# Shunkhlai Fuel Monitor — A92 Availability Tracker

Shows which Shunkhlai stations in Ulaanbaatar have **A92 (АИ-92)** right now, puts them on a map, and sends a **Telegram** alert when A92 turns up near you. Euro-92 is deliberately ignored: it is never tracked, recommended or alerted.

Stack: Next.js 16 (App Router), TypeScript, Tailwind v4 and shadcn/ui, Prisma 6 with PostgreSQL (Neon), Leaflet and OpenStreetMap, the Telegram Bot API, Zod, Vercel Cron.

## Architecture

```
Shunkhlai API ──(every 1–2 min)──► /api/cron/monitor  ◄── Vercel Cron / external scheduler (Bearer CRON_SECRET)
                                        │ fetch → validate (zod) → diff
                                        ▼
                              PostgreSQL (Neon)
       FuelStation · FuelAvailability (history, rows written only on change) · AvailabilityEvent (unique key)
       NotificationHistory (unique userId+eventId) · User/UserPreference · TelegramConnection(+Token) · SyncRun
                                        │
             ┌──────────────────────────┴───────────────────────────┐
             ▼                                                      ▼
   Next.js dashboard (map, lists, settings)            Telegram bot (/api/telegram/webhook)
```

### How a run works (`src/lib/monitor.ts`)

1. **Skip check.** If the previous run started less than `POLL_INTERVAL_SECONDS` ago, the run is skipped. Cron can therefore fire every minute while the real interval stays configurable.
2. **Fetch.** The source is fetched server-side with a timeout and one retry, then validated with Zod. Malformed stations are skipped. A station whose `ai92` value is malformed shows as **unknown** (gray). Nothing is hardcoded.
3. **History.** A `FuelAvailability` row is appended only when A92's state changes (available / arrivedAt / emptyAt / limit). The first time a station is seen it is stored as a baseline and never triggers an alert.
4. **Events.**
   - `A92_AVAILABLE` fires on a false → true change. Its key is `avail:<previous state row id>`.
   - `A92_ARRIVAL_TIME` fires when a station reports a new arrival time. Its key is `arrival:<station>:<UB date>:<time>`.

   Each key is unique, so two runs at the same time produce one event.
5. **Dispatch.** For every recent event, each connected user is matched against their preferences:
   - Favorite stations always match.
   - Otherwise the station must be within the user's radius of their home pin.
   - If there is no home pin, or the station has no coordinates, it must be in the user's district.

   Before sending, the app claims a `NotificationHistory(userId, eventId)` row. The unique constraint means each event reaches each user exactly once. A cooldown stops alerts when a station's status flips back and forth.
6. **Delivery.** Messages go out one at a time at about 25 per second. On a `429` the app waits for `retry_after` and tries again. On a `403` (the user blocked the bot) it removes the Telegram connection. Every send is logged as `SENT` or `FAILED`.

The cron job is the main trigger. As a fallback, opening the page starts a sync in the background (using `after()`) when the data is older than 2× the poll interval.

### API limitations found during inspection

- The source has no coordinates. The address is inside the station name, e.g. `УБ ШТС-13 (УБ хот, БЗДүүрэг, 8-р хороо, …)`. Countryside stations only have a code, e.g. `Хэнтий ШТС (214)`.
- `arrivedAt` and `emptyAt` are local `HH:mm` strings with no date.
- A station can be `available:false` while still showing an `arrivedAt` value.
- The source sends `cache-control: max-age=30`. Its `updatedAt` value is shown on the dashboard as the source time.

## Station coordinates (never invented)

Stations without coordinates are listed in the station list but not drawn on the map. On the map, unverified pins have a dashed outline and carry a "Байршил баталгаажаагүй" (location unverified) label.

There are two ways to add coordinates:

1. **Admin UI at `/admin`.** Log in with `ADMIN_SECRET`, pick a station, then click its location on the map or paste `lat, lng` (a Google Maps link also works). Tick "Баталгаажсан" (verified) and save. Your edits go into `FuelStation.latitude/longitude` with `coordinateSource = "admin"`, and syncs **never overwrite them**. "Координат устгах" (clear coordinates) hands the station back to the dataset.
2. **Dataset at `data/station-coordinates.json`.** This file seeds stations the admin hasn't edited. `npm run coords:osm` suggests entries:
   - It takes real Shunkhlai `amenity=fuel` nodes from OpenStreetMap.
   - It matches each one to the landmark in a station's address, within 450 m, one-to-one.
   - It writes every match with `verified:false`.

   Confirm each suggested pin before you trust it.

You can also edit the coordinates directly in the database:

```sql
UPDATE "FuelStation" SET latitude=47.91, longitude=106.95, "coordinateVerified"=true, "coordinateSource"='admin'
WHERE "externalId"='1366';
```

## Local development

```bash
cp .env.example .env            # fill values (see below)
docker run -d --name fuel-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=fuel -p 55432:5432 postgres:17-alpine
# DATABASE_URL=DIRECT_URL=postgresql://postgres:pg@localhost:55432/fuel
npm install
npm run db:migrate              # applies prisma/migrations
npm run dev                     # http://localhost:3000
# trigger a sync manually (cron isn't running locally):
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/monitor?force=1"
```

To test the Telegram bot locally, expose port 3000 with a tunnel such as `cloudflared tunnel --url http://localhost:3000`. Set `NEXT_PUBLIC_APP_URL` to the tunnel URL, then run the webhook setup below.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL (Neon `-pooler`) |
| `DIRECT_URL` | Direct Postgres URL, used by migrations |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Server-side only. |
| `TELEGRAM_BOT_USERNAME` | Bot username without `@`, used for deep links |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram sends it back in `X-Telegram-Bot-Api-Secret-Token`, and the webhook checks it |
| `CRON_SECRET` | Bearer token for `/api/cron/monitor` and `/api/telegram/setup` |
| `SESSION_SECRET` | Signs the anonymous browser user id cookie (≥16 chars) |
| `ADMIN_SECRET` | Password for `/admin`. Leave empty to disable the admin page. |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app |
| `POLL_INTERVAL_SECONDS` | Optional, default 60. Minimum gap between syncs. |
| `NOTIFICATION_COOLDOWN_MINUTES` | Optional, default 30. Anti-flapping window. |

## Production deployment (Vercel + Neon)

1. Create a Neon project and copy the **pooled** and **direct** connection strings.
2. Create a bot with @BotFather and note the token and username.
3. Import the repo into Vercel and set every environment variable above. Generate the secrets with `openssl rand -hex 32`.
4. Deploy. The `build` script runs `prisma generate && prisma migrate deploy && next build`, so migrations apply on every deploy.
5. Register the webhook and the command menu once:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR_APP/api/telegram/setup
   ```
6. Set up the cron job. `vercel.json` schedules `/api/cron/monitor` every minute, and Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.
   - **Vercel Pro** allows per-minute crons.
   - **Hobby plan:** cron runs at most once a day, which is useless here. Use an external scheduler instead, such as [cron-job.org](https://cron-job.org) or Upstash QStash. Have it call `GET https://YOUR_APP/api/cron/monitor` every 1–2 minutes with the header `Authorization: Bearer <CRON_SECRET>`.
   - Check your plan's current cron limits before relying on Vercel Cron.

## Telegram

**Connecting an account:**

1. Open the dashboard, go to Settings, and press "Telegram холбох" (Connect Telegram).
2. The server creates a single-use token: 32 random bytes, stored only as a SHA-256 hash, valid for 15 minutes.
3. The page opens `https://t.me/<bot>?start=<token>`.
4. Telegram sends `/start <token>` to the bot. The server claims the token atomically and links the **chat id** (never the username) to that browser's user.
5. The dashboard checks every few seconds and shows "connected" once the link is made.

**Commands:** `/start`, `/status`, `/nearby`, `/stations`, `/settings` (inline buttons for notifications, arrival-time alerts and radius), `/help`, `/disconnect`. Sending a 📎 location to the bot sets your home pin.

## Security notes

- Secrets live only in server environment variables. The bot token is never sent to the browser.
- The webhook checks its secret with a timing-safe comparison. The cron, setup and admin endpoints are protected by secrets.
- **Users are anonymous browser identities**, held in a signed httpOnly cookie. `src/proxy.ts` checks the cookie and passes the user id on in a header that clients can't spoof. Preferences and favorites are scoped to that id. No API returns chat ids or another user's data.
- Every input is validated with Zod.
- Rate limits are stored in Postgres, so they work across serverless instances. They cover connect-token creation, preference and favorite writes, Telegram messages per chat, and admin login.
- Limitation: identity belongs to the browser. Clearing cookies creates a new user; reconnect Telegram to carry on. The `email` column is reserved for adding real auth later.

## Project layout

```
src/lib/fuel-api.ts          source fetch + zod parsing + name/address split
src/lib/monitor.ts           sync, diff, events, notification dispatch
src/lib/stations.ts          dashboard/bot view model (status, unknown handling, sort: available → Баянзүрх → УБ)
src/lib/telegram/*           Bot API client (429 handling), bot commands, connect tokens, message formatting
src/app/api/*                cron, webhook, setup, connect/disconnect, me, preferences, favorites, stations, admin
src/components/*             dashboard, Leaflet maps, lists, settings, Telegram panel, admin editor
prisma/schema.prisma         data model; prisma/migrations/ — SQL migrations
data/station-coordinates.json  coordinate seed dataset
```

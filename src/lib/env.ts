import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(""),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(""),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(""),
  CRON_SECRET: z.string().optional().default(""),
  /** Override only for local testing against a mock Bot API. */
  TELEGRAM_API_BASE: z.string().url().default("https://api.telegram.org"),
  SESSION_SECRET: z.string().optional().default(""),
  /** Password for /admin (station coordinate editor). Admin is disabled when empty. */
  ADMIN_SECRET: z.string().optional().default(""),
  NEXT_PUBLIC_APP_URL: z.string().optional().default("http://localhost:3000"),
  FUEL_API_URL: z.string().url().default("https://shunkhlai-fuel.nasanochir.workers.dev/"),
  FUEL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** Minimum seconds between syncs. Cron may fire every minute; runs inside this window are skipped. */
  POLL_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(60),
  /** Do not re-alert the same user about the same station within this window (anti-flapping). */
  NOTIFICATION_COOLDOWN_MINUTES: z.coerce.number().int().min(0).default(30),
});

export const env = schema.parse(process.env);

export const STALE_AFTER_MS = Math.max(env.POLL_INTERVAL_SECONDS * 5, 600) * 1000;

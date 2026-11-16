import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log, errMsg } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { distanceKm } from "@/lib/geo";
import { districtName, inHomeDistrict } from "@/lib/districts";
import { getStationsData, type StationView } from "@/lib/stations";
import { escapeHtml as h, sendMessage, tgCall } from "@/lib/telegram/api";
import { consumeConnectionToken } from "@/lib/telegram/connect";
import { formatStationLine, formatSyncFooter } from "@/lib/telegram/format";

const chatSchema = z.object({ id: z.number().int(), type: z.string() });
const fromSchema = z.object({ id: z.number().int(), username: z.string().optional(), first_name: z.string().optional() });

export const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: chatSchema,
      from: fromSchema.optional(),
      text: z.string().max(4096).optional(),
      location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: fromSchema,
      data: z.string().max(64).optional(),
      message: z.object({ chat: chatSchema, message_id: z.number().int() }).optional(),
    })
    .optional(),
});

type Update = z.infer<typeof updateSchema>;

const RADII = [1, 3, 5, 10, 20];
const MAX_LEN = 3800;
const settingsUrl = () => `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/#settings`;

const HELP = [
  "⛽ <b>Шунхлай АИ-92 мониторинг</b>",
  "",
  "/status — АИ-92 ерөнхий төлөв",
  "/nearby — Миний ойролцоох АИ-92 бүхий ШТС",
  "/stations — АИ-92 байгаа бүх ШТС",
  "/settings — Мэдэгдлийн тохиргоо",
  "/disconnect — Telegram холболтыг салгах",
  "/help — Тусламж",
  "",
  "📎 Байршлаа (Location) илгээвэл гэрийн байршлыг шинэчилнэ.",
].join("\n");

async function reply(chatId: number, text: string, replyMarkup?: unknown) {
  // Split long messages on line boundaries (Telegram limit 4096).
  const chunks: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > MAX_LEN) {
      chunks.push(cur);
      cur = line;
    } else cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) chunks.push(cur);
  for (let i = 0; i < chunks.length; i++) await sendMessage(chatId, chunks[i], i === chunks.length - 1 ? { replyMarkup } : {});
}

async function getConnection(chatId: number) {
  return prisma.telegramConnection.findUnique({
    where: { chatId: BigInt(chatId) },
    include: { user: { include: { preference: true, favorites: { select: { stationId: true } } } } },
  });
}

export async function handleUpdate(update: Update) {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (chatId == null) return;
  if (update.message && update.message.chat.type !== "private") return; // bot is for private chats only

  if (!(await rateLimit(`tg:${chatId}`, 20, 60))) {
    log("warn", "telegram chat rate limited", { chatId });
    return;
  }

  try {
    if (update.callback_query) return await handleCallback(update.callback_query, chatId);
    const msg = update.message!;
    if (msg.location) return await handleLocation(chatId, msg.location.latitude, msg.location.longitude);
    const text = msg.text?.trim() ?? "";
    const [rawCmd, ...args] = text.split(/\s+/);
    const cmd = rawCmd.toLowerCase().replace(/@.*$/, "");

    switch (cmd) {
      case "/start":
        return await cmdStart(chatId, args[0], msg.from);
      case "/status":
        return await cmdStatus(chatId);
      case "/nearby":
        return await cmdNearby(chatId);
      case "/stations":
        return await cmdStations(chatId);
      case "/settings":
        return await cmdSettings(chatId);
      case "/disconnect":
        return await cmdDisconnect(chatId);
      case "/help":
        return await reply(chatId, HELP);
      default:
        return await reply(chatId, "Командыг танисангүй. /help гэж бичээд боломжит командуудыг харна уу.");
    }
  } catch (e) {
    log("error", "telegram handler failed", { chatId, error: errMsg(e) });
    await sendMessage(chatId, "⚠️ Алдаа гарлаа. Дахин оролдоно уу.").catch(() => {});
  }
}

async function cmdStart(chatId: number, token: string | undefined, from?: z.infer<typeof fromSchema>) {
  if (token) {
    const res = await consumeConnectionToken(token, {
      chatId: BigInt(chatId),
      username: from?.username ?? null,
      firstName: from?.first_name ?? null,
    });
    if (res.ok) {
      log("info", "telegram connected", { userId: res.userId });
      return reply(chatId, `✅ <b>Амжилттай холбогдлоо!</b>\n\nАИ-92 ирэхэд танд мэдэгдэл илгээнэ.\n\n${HELP}`);
    }
    return reply(
      chatId,
      res.reason === "expired"
        ? "⌛ Холболтын линкний хугацаа дууссан. Вэб апп-аас дахин «Telegram холбох» дарна уу."
        : `❌ Холболтын линк буруу эсвэл ашиглагдсан байна.\n\nВэб апп: ${settingsUrl()}`,
    );
  }
  const conn = await getConnection(chatId);
  if (conn) return reply(chatId, `👋 Тавтай морил! Таны бүртгэл холбогдсон байна.\n\n${HELP}`);
  return reply(
    chatId,
    `👋 Сайн байна уу!\n\nМэдэгдэл авахын тулд вэб апп-ын <b>Тохиргоо</b> хэсгээс «Telegram холбох» товчийг дарна уу:\n${settingsUrl()}\n\n${HELP}`,
  );
}

const available = (list: StationView[]) => list.filter((s) => s.status === "available");

async function cmdStatus(chatId: number) {
  const { stations, sync } = await getStationsData();
  const ub = stations.filter((s) => s.isUB);
  const avUB = available(ub);
  const avBZD = avUB.filter((s) => s.district === "BZD");
  const lines = [
    "📊 <b>АИ-92 төлөв</b>",
    "",
    `🏙 Улаанбаатар: <b>${avUB.length}</b> / ${ub.length} ШТС-д байгаа`,
    `📍 Баянзүрх: <b>${avBZD.length}</b> ШТС-д байгаа`,
    `🌏 Нийт (орон нутаг орсон): ${available(stations).length} / ${stations.length}`,
  ];
  if (avUB.length) {
    lines.push("", "<b>УБ-д АИ-92 байгаа:</b>");
    for (const s of avUB.slice(0, 8)) lines.push(`🟢 ${h(s.name)}${s.arrivedAt ? ` · 🕒 ${h(s.arrivedAt)}` : ""} — ${h(districtName(s.district) ?? "")}`);
    if (avUB.length > 8) lines.push(`… +${avUB.length - 8} (/stations)`);
  }
  lines.push("", formatSyncFooter(sync));
  return reply(chatId, lines.join("\n"));
}

async function cmdNearby(chatId: number) {
  const conn = await getConnection(chatId);
  if (!conn) return reply(chatId, `Эхлээд бүртгэлээ холбоно уу: ${settingsUrl()}`);
  const pref = conn.user.preference;
  const { stations, sync } = await getStationsData();
  const av = available(stations);
  const radius = pref?.notificationRadiusKm ?? 5;
  const district = pref?.district ?? "BZD";
  const lines: string[] = [];

  if (pref?.latitude != null && pref?.longitude != null) {
    const home = { lat: pref.latitude, lng: pref.longitude };
    const withDist = av
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ s, d: distanceKm(home, { lat: s.lat!, lng: s.lng! }) }))
      .sort((a, b) => a.d - b.d);
    const near = withDist.filter((x) => x.d <= radius);
    lines.push(`📍 <b>${radius} км радиус дахь АИ-92</b>`, "");
    if (near.length) near.slice(0, 10).forEach(({ s, d }) => lines.push(formatStationLine(s, d), ""));
    else {
      lines.push("😕 Таны радиус дотор АИ-92 байхгүй байна.");
      if (withDist[0]) lines.push("", "Хамгийн ойр:", formatStationLine(withDist[0].s, withDist[0].d));
      lines.push("");
    }
    const noCoords = av.filter((s) => s.lat == null && inHomeDistrict(s, district));
    if (noCoords.length) {
      lines.push(`ℹ️ ${h(districtName(district) ?? "")} — байршил тодорхойгүй ШТС:`);
      noCoords.forEach((s) => lines.push(formatStationLine(s), ""));
    }
  } else {
    const inDistrict = av.filter((s) => inHomeDistrict(s, district));
    lines.push(`📍 <b>${h(districtName(district) ?? "")} — АИ-92</b>`, "");
    if (inDistrict.length) inDistrict.forEach((s) => lines.push(formatStationLine(s), ""));
    else lines.push("😕 Таны дүүрэгт одоогоор АИ-92 байхгүй байна.", "");
    lines.push("💡 Нарийн зай тооцуулахын тулд 📎 Location илгээнэ үү.");
  }
  lines.push(formatSyncFooter(sync));
  return reply(chatId, lines.join("\n"));
}

async function cmdStations(chatId: number) {
  const { stations, sync } = await getStationsData();
  const av = available(stations);
  if (!av.length) return reply(chatId, `😕 Одоогоор АИ-92 аль ч ШТС-д байхгүй байна.\n\n${formatSyncFooter(sync)}`);
  const lines = [`⛽ <b>АИ-92 байгаа ШТС (${av.length})</b>`, ""];
  av.forEach((s) => lines.push(formatStationLine(s), ""));
  lines.push(formatSyncFooter(sync));
  return reply(chatId, lines.join("\n"));
}

function settingsKeyboard(p: { telegramNotificationsEnabled: boolean; notifyOnArrivalTime: boolean; notificationRadiusKm: number }) {
  return {
    inline_keyboard: [
      [{ text: p.telegramNotificationsEnabled ? "🔔 Мэдэгдэл: Асаалттай" : "🔕 Мэдэгдэл: Унтраалттай", callback_data: "notif:toggle" }],
      [{ text: `🕒 Ирэх цагийн мэдэгдэл: ${p.notifyOnArrivalTime ? "Тийм" : "Үгүй"}`, callback_data: "arrival:toggle" }],
      RADII.map((r) => ({ text: `${r === p.notificationRadiusKm ? "✅ " : ""}${r} км`, callback_data: `radius:${r}` })),
    ],
  };
}

function settingsText(p: NonNullable<Awaited<ReturnType<typeof getConnection>>>["user"]["preference"]) {
  const loc = p?.latitude != null ? "📍 Гэрийн байршил: тохируулсан" : "📍 Гэрийн байршил: тохируулаагүй (дүүргээр шүүнэ)";
  return [
    "⚙️ <b>Мэдэгдлийн тохиргоо</b>",
    "",
    `🏠 Дүүрэг: ${h(districtName(p?.district ?? "BZD") ?? "")}`,
    loc,
    `📏 Радиус: ${p?.notificationRadiusKm ?? 5} км`,
    `⭐ Зөвхөн дуртай ШТС: ${p?.favoritesOnly ? "Тийм" : "Үгүй"}`,
    "",
    `Дэлгэрэнгүй: ${settingsUrl()}`,
  ].join("\n");
}

async function cmdSettings(chatId: number) {
  const conn = await getConnection(chatId);
  if (!conn) return reply(chatId, `Эхлээд бүртгэлээ холбоно уу: ${settingsUrl()}`);
  const p = conn.user.preference ?? (await prisma.userPreference.create({ data: { userId: conn.userId } }));
  return reply(chatId, settingsText(p), settingsKeyboard(p));
}

async function handleCallback(cb: NonNullable<Update["callback_query"]>, chatId: number) {
  const conn = await getConnection(chatId);
  // Callback must come from the same Telegram user who owns the private chat.
  if (!conn || BigInt(cb.from.id) !== BigInt(chatId)) {
    await tgCall("answerCallbackQuery", { callback_query_id: cb.id, text: "Холболт олдсонгүй" });
    return;
  }
  const p = conn.user.preference ?? (await prisma.userPreference.create({ data: { userId: conn.userId } }));
  const data: Partial<typeof p> = {};
  const [kind, val] = (cb.data ?? "").split(":");
  if (kind === "notif") data.telegramNotificationsEnabled = !p.telegramNotificationsEnabled;
  else if (kind === "arrival") data.notifyOnArrivalTime = !p.notifyOnArrivalTime;
  else if (kind === "radius" && RADII.includes(Number(val))) data.notificationRadiusKm = Number(val);

  const updated = await prisma.userPreference.update({ where: { userId: conn.userId }, data });
  await tgCall("answerCallbackQuery", { callback_query_id: cb.id, text: "Хадгаллаа ✅" });
  if (cb.message) {
    await tgCall("editMessageText", {
      chat_id: chatId,
      message_id: cb.message.message_id,
      text: settingsText(updated),
      parse_mode: "HTML",
      reply_markup: settingsKeyboard(updated),
      link_preview_options: { is_disabled: true },
    }).catch(() => {}); // "message is not modified" is harmless
  }
}

async function handleLocation(chatId: number, lat: number, lng: number) {
  const conn = await getConnection(chatId);
  if (!conn) return reply(chatId, `Эхлээд бүртгэлээ холбоно уу: ${settingsUrl()}`);
  await prisma.userPreference.upsert({
    where: { userId: conn.userId },
    create: { userId: conn.userId, latitude: lat, longitude: lng },
    update: { latitude: lat, longitude: lng },
  });
  return reply(chatId, "🏠 Гэрийн байршил шинэчлэгдлээ. /nearby командаар ойролцоох ШТС-ийг харна уу.");
}

async function cmdDisconnect(chatId: number) {
  const { count } = await prisma.telegramConnection.deleteMany({ where: { chatId: BigInt(chatId) } });
  return reply(chatId, count ? "👋 Telegram холболт салгагдлаа. Мэдэгдэл илгээхээ зогсоолоо." : "Холбогдсон бүртгэл алга.");
}

export const BOT_COMMANDS = [
  { command: "status", description: "АИ-92 ерөнхий төлөв" },
  { command: "nearby", description: "Ойролцоох АИ-92 бүхий ШТС" },
  { command: "stations", description: "АИ-92 байгаа бүх ШТС" },
  { command: "settings", description: "Мэдэгдлийн тохиргоо" },
  { command: "help", description: "Тусламж" },
  { command: "disconnect", description: "Telegram холболт салгах" },
];

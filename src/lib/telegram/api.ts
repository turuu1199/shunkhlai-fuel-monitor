import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export class TelegramError extends Error {
  constructor(
    message: string,
    public code: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
  /** User blocked the bot / chat deleted — connection should be dropped. */
  get isPermanent() {
    return this.code === 403 || (this.code === 400 && /chat not found|user is deactivated/i.test(this.message));
  }
}

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!env.TELEGRAM_BOT_TOKEN) throw new TelegramError("TELEGRAM_BOT_TOKEN is not configured", 0);
  const res = await fetch(`${env.TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as TgResponse<T>;
  if (!data.ok) {
    throw new TelegramError(data.description ?? "Telegram error", data.error_code ?? res.status, data.parameters?.retry_after);
  }
  return data.result as T;
}

export type SendOptions = {
  replyMarkup?: unknown;
  disablePreview?: boolean;
};

/** sendMessage with 429 handling (honours retry_after, max 3 attempts). */
export async function sendMessage(chatId: bigint | number | string, text: string, opts: SendOptions = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tgCall("sendMessage", {
        chat_id: chatId.toString(),
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: opts.disablePreview ?? true },
        reply_markup: opts.replyMarkup,
      });
    } catch (e) {
      if (e instanceof TelegramError && e.code === 429 && attempt < 3) {
        const wait = Math.min((e.retryAfter ?? 1) * 1000, 15_000);
        log("warn", "telegram rate limited", { wait });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

import { getTelegramBotToken } from "../utils/env.ts";
import { getTodayIST } from "../utils/date.ts";
import { getDailyBriefPayloads } from "../db/dailyBrief.ts";
import { buildDailyBriefMessages } from "../domain/dailyBrief.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = getTelegramBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }
}

export async function runDailyBrief(): Promise<void> {
  const startTime = Date.now();
  const today = getTodayIST();
  console.log(`[dailyBrief] Starting job for ${today}`);

  let sent = 0;
  let failed = 0;
  let total = 0;

  try {
    // RPC handles idempotency via daily_brief_log
    // Heavy aggregation is performed in Postgres, not here
    const payloads = await getDailyBriefPayloads(today);
    const messages = await buildDailyBriefMessages(payloads);
    total = messages.length;
    console.log(`[dailyBrief] Sending ${total} brief(s)`);

    // Sequential send with rate limiting to avoid Telegram API limits
    for (const message of messages) {
      try {
        await sendTelegramMessage(message.chatId, message.text);
        sent++;
        // Rate limiting: Telegram allows ~30 messages/second to different users
        // Add 50ms delay to stay well below limit
        if (messages.length > 1) {
          await sleep(50);
        }
      } catch (error) {
        failed++;
        console.error(
          `[dailyBrief] Send failed for chat ${message.chatId}, uid ${message.firebaseUid}:`,
          error
        );
        // Continue to next message - one failure does not abort the job
      }
    }
  } catch (error) {
    // Top-level failure (e.g., RPC error) - log and exit gracefully
    console.error("[dailyBrief] Job failed:", error);
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[dailyBrief] Completed in ${durationMs}ms: ${sent} sent, ${failed} failed, ${total} total`
  );
}

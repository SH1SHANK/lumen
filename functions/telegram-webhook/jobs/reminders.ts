import { getTelegramBotToken } from "../utils/env.ts";
import { buildClassReminders } from "../domain/reminders.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramMessage(chatId: number, text: string) {
  const token = getTelegramBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram API error: ${response.status} ${body}`);
  }
}

export async function runReminders(): Promise<void> {
  const startTime = Date.now();
  console.log("[reminders] Starting job");

  let sent = 0;
  let failed = 0;
  let total = 0;

  try {
    // RPC handles idempotency via class_notification_log
    // Heavy aggregation is performed in Postgres, not here
    const messages = await buildClassReminders();
    total = messages.length;
    console.log(`[reminders] Sending ${total} reminder(s)`);

    // Sequential send with rate limiting to avoid Telegram API limits
    for (const message of messages) {
      try {
        await sendTelegramMessage(message.chatId, message.text);
        sent++;
        // Rate limiting: add 50ms delay between messages
        if (messages.length > 1) {
          await sleep(50);
        }
      } catch (error) {
        failed++;
        console.error(
          `[reminders] Send failed for chat ${message.chatId}:`,
          error
        );
        // Continue to next message - one failure does not abort the job
      }
    }
  } catch (error) {
    // Top-level failure (e.g., RPC error) - log and exit gracefully
    console.error("[reminders] Job failed:", error);
  }

  const durationMs = Date.now() - startTime;
  console.log(
    `[reminders] Completed in ${durationMs}ms: ${sent} sent, ${failed} failed, ${total} total`
  );
}

import { InlineKeyboard } from "https://esm.sh/grammy@1.34.0";
import { bot } from "../bot/bot.ts";
import { supabase } from "../db/client.ts";
import { APP_BASE_URL } from "../utils/env.ts";
import { withTyping } from "../utils/telegram.ts";

// Helper: Get user's Firebase UID
async function getUserUid(chatId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_user_mappings")
    .select("firebase_uid")
    .eq("chat_id", chatId)
    .single();

  if (error || !data) return null;
  return data.firebase_uid;
}

export function registerStartCommand() {
  bot.command("start", async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const chatId = ctx.chat.id;
        const uid = await getUserUid(chatId);

        if (uid) {
          return ctx.reply(
            "✅ You are already connected to Attendrix.\n\nYour account is active and ready to use. Type /help to see available commands."
          );
        }

        const connectionLink = `${APP_BASE_URL}?chatID=${chatId}`;
        const buttonRow = new InlineKeyboard().url(
          "🔗 Connect Account",
          connectionLink
        );

        await ctx.reply(
          "👋 *Welcome to Lumen*\n\n" +
            "I'm your digital attendance assistant. To get started, you must link your Telegram account with your Attendrix profile.\n\n" +
            "Click the button below to authenticate.",
          {
            reply_markup: buttonRow,
            parse_mode: "Markdown",
          }
        );
      } catch (error) {
        console.error("Error in /start:", error);
        ctx.reply("An error occurred. Please try again.");
      }
    });
  });
}

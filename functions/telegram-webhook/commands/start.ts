import { InlineKeyboard } from "https://esm.sh/grammy@1.34.0";
import { bot } from "../bot/bot.ts";
import { supabase } from "../db/client.ts";
import { APP_BASE_URL } from "../utils/env.ts";
import { withTyping } from "../utils/telegram.ts";
import { getUserGreeting } from "../domain/userProfile.ts";

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
          const greeting = await getUserGreeting(uid);
          const welcomeMsg = greeting
            ? `Welcome back, ${greeting}.\n\nYour account is connected and ready. Use /help to see what I can do.`
            : "Your account is already connected.\n\nEverything is ready. Use /help to see what I can do.";
          return ctx.reply(welcomeMsg);
        }

        const connectionLink = `${APP_BASE_URL}?chatID=${chatId}`;
        const buttonRow = new InlineKeyboard().url(
          "🔗 Connect Account",
          connectionLink
        );

        await ctx.reply(
          "Welcome to Lumen.\n\nI help you track attendance and manage your class schedule. To get started, connect your Telegram account with Attendrix.\n\nTap the button below to authenticate.",
          {
            reply_markup: buttonRow,
          }
        );
      } catch (error) {
        console.error("Error in /start:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });
}

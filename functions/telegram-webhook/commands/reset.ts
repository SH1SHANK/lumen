import { InlineKeyboard } from "https://esm.sh/grammy@1.34.0";
import { bot } from "../bot/bot.ts";
import { withTyping } from "../utils/telegram.ts";
import { resetTelegramLink } from "../domain/accountReset.ts";

const RESET_CONFIRM_CALLBACK = "reset:confirm";
const RESET_CANCEL_CALLBACK = "reset:cancel";

export function registerResetCommand() {
  // /reset command handler
  bot.command("reset", async (ctx) => {
    await withTyping(ctx, async () => {
      const keyboard = new InlineKeyboard()
        .text("✅ Yes, disconnect my account", RESET_CONFIRM_CALLBACK)
        .row()
        .text("❌ Cancel", RESET_CANCEL_CALLBACK);

      await ctx.reply(
        `*Account Disconnect*

This will remove the link between your Telegram and Attendrix.

*What happens:*
• Your Telegram link is removed
• You'll need to run /start to reconnect

*What's preserved:*
• All your attendance records
• Your Attendrix account
• Your course enrollments

Are you sure?`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    });
  });

  // Confirmation callback handler
  bot.callbackQuery(RESET_CONFIRM_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.editMessageText(
          "Something didn't go through. Try /reset again."
        );
        return;
      }

      await resetTelegramLink(chatId);

      await ctx.editMessageText(
        `*Account Disconnected*

Your Telegram is no longer linked to Attendrix.

To reconnect, use /start.`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      console.error("Error in reset confirm:", error);
      await ctx.editMessageText(
        "Something didn't go through. Try /reset again."
      );
    }
  });

  // Cancel callback handler
  bot.callbackQuery(RESET_CANCEL_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Disconnect cancelled.");
  });
}

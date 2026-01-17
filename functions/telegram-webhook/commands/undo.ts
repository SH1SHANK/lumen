import { bot } from "../bot/bot.ts";
import { withTyping } from "../utils/telegram.ts";
import { undoLastAction } from "../domain/undo.ts";

export function registerUndoCommand() {
  bot.command(["undo", "u"], async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const firebaseUid = ctx.state?.firebaseUid;

        if (!firebaseUid) {
          await ctx.reply(
            "You need to connect your account first. Use /start."
          );
          return;
        }

        const result = await undoLastAction(firebaseUid);

        await ctx.reply(result.message);
      } catch (error) {
        console.error("Error in /undo:", error);
        await ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });
}

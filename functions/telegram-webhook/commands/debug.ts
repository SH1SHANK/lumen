import { bot } from "../bot/bot.ts";
import { withTyping } from "../utils/telegram.ts";
import { assertAdmin, AdminAccessDeniedError } from "../domain/adminAccess.ts";
import { buildDiagnosticMessage } from "../domain/adminDebug.ts";

export function registerDebugCommand() {
  bot.command("debug", async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;

        // Admin access control
        try {
          await assertAdmin(uid);
        } catch (error) {
          if (error instanceof AdminAccessDeniedError) {
            console.log(`[/debug] Access denied for uid ${uid}`);
            return ctx.reply("This command is restricted.");
          }
          throw error;
        }

        // Log admin debug usage
        console.log(`[/debug] Admin diagnostic requested by uid ${uid}`);

        // Fetch and display diagnostics
        const diagnosticMessage = await buildDiagnosticMessage(uid);
        await ctx.reply(diagnosticMessage, { parse_mode: "Markdown" });
      } catch (error) {
        console.error(
          `[/debug] Failed for uid ${ctx.state.firebaseUid}:`,
          error
        );
        ctx.reply(
          "Couldn't load diagnostics right now. Try again in a moment."
        );
      }
    });
  });
}

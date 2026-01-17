import { bot } from "../bot/bot.ts";
import { withTyping } from "../utils/telegram.ts";

export function registerHelpCommand() {
  bot.command("help", async (ctx) => {
    await withTyping(ctx, async () => {
      const helpText = `
*Lumen Help*

I help you track attendance and view your class schedule.

*Attendance*
/attend – Mark present (tap classes or type numbers)
/attend_all – Mark all classes present for today
/absent – Mark absent (tap classes or type numbers)
/absent_all – Mark all classes absent for today

*Schedule & Info*
/today – View today's schedule
/tomorrow – View tomorrow's schedule
/status – Check your attendance by course

*Settings*
/remind_me – Toggle reminders 10 minutes before class
/daily_brief – Toggle morning summary at 8:00 AM

*Account & Recovery*
/undo – Revert your last attendance action (today only)
/reset – Disconnect and reconnect your account

*Quick Access*
/shortcuts – View shorter command aliases

*Examples:*
/attend → Shows buttons for all classes
/attend 1 3 5 → Mark classes 1, 3, and 5 present
  `;

      await ctx.reply(helpText, { parse_mode: "Markdown" });
    });
  });

  bot.command("shortcuts", async (ctx) => {
    await withTyping(ctx, async () => {
      const shortcutsText = `
*Quick Shortcuts*

Speed up your workflow:

*Attendance*
/a → /attend
/aa → /attend_all
/ab → /absent

*Info*
/s → /status
/u → /undo

*Examples:*
/a 1 2 → Mark classes 1 and 2 present
/aa → Mark all classes present
/s → View attendance by course
  `;

      await ctx.reply(shortcutsText, { parse_mode: "Markdown" });
    });
  });
}

import { bot } from "../bot/bot.ts";
import { withTyping } from "../utils/telegram.ts";

export function registerHelpCommand() {
  bot.command("help", async (ctx) => {
    await withTyping(ctx, async () => {
      const helpText = `
💡 *Lumen Help Guide*

I am your digital attendance assistant. Use the commands below to manage your schedule and track your presence.

*Attendance Commands*
• /attend – Mark yourself present (shows class buttons or use numbers)
• /attend_all – Quickly mark present for every class today
• /absent – Mark yourself absent (shows class buttons or use numbers)
• /absent_all – Log an absence for all of today's classes

*Schedule & Info*
• /today – View your current daily schedule
• /tomorrow – Get a sneak peek at tomorrow's classes
• /status – Check your attendance percentage and Amplix score

*Settings*
• /remind_me – Toggle 10-minute class reminders
• /daily_brief – Receive a morning summary at 8:00 AM
• /start – Reset or link a new account

*Examples:*
/attend → Shows buttons for all classes
/attend 1 3 5 → Mark classes 1, 3, and 5 as present
  `;

      await ctx.reply(helpText, { parse_mode: "Markdown" });
    });
  });
}

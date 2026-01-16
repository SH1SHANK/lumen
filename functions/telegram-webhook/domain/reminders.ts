import { getPendingClassReminders } from "../db/reminders.ts";
import { TIMEZONE } from "../utils/date.ts";

export interface ReminderMessage {
  chatId: number;
  text: string;
}

export async function buildClassReminders(): Promise<ReminderMessage[]> {
  const rows = await getPendingClassReminders();

  return rows.map((row) => {
    const startTime = new Date(row.class_start_time).toLocaleTimeString(
      "en-IN",
      {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
      }
    );

    const venueLine = row.class_venue ? `\n📍 ${row.class_venue}` : "";

    const text =
      `⏰ *Class Reminder*\n\n` +
      `*${row.course_name}* starts at ${startTime}.${venueLine}`;

    return {
      chatId: row.chat_id,
      text,
    };
  });
}

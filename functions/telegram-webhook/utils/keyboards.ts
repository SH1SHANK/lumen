import { InlineKeyboard } from "https://esm.sh/grammy@1.34.0";
import type { ScheduleClass } from "../domain/schedule.ts";
import { TIMEZONE } from "./date.ts";

export const ATTENDANCE_ACTIONS = {
  SELECT: "att_s",
  CONFIRM: "att_c",
  ATTEND_ALL: "att_a_all",
  ABSENT_ALL: "att_abs_all",
};

export function buildAttendanceKeyboard(
  classes: ScheduleClass[],
  dateStr: string,
  selectedMask: number
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  // 1. Class Selection Buttons
  classes.forEach((cls, index) => {
    const isSelected = (selectedMask & (1 << index)) !== 0;
    const check = isSelected ? "✅ " : "⬜ ";
    
    const startTimeHash = new Date(cls.classStartTime);
    const timeStr = startTimeHash.toLocaleTimeString("en-IN", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const label = `${check}${cls.courseName} (${timeStr})`;
    
    // Payload: Action : Date : Index : CurrentMask
    // Handler will flip the bit at Index
    keyboard.text(
      label,
      `${ATTENDANCE_ACTIONS.SELECT}:${dateStr}:${index}:${selectedMask}`
    ).row();
  });

  // 2. Action Buttons (only if selection exists)
  if (selectedMask !== 0) {
    keyboard.text(
      "Attend Selected 🙋‍♂️",
      `${ATTENDANCE_ACTIONS.CONFIRM}:${dateStr}:attend:${selectedMask}`
    );
    keyboard.text(
      "Absent Selected 🙅‍♂️",
      `${ATTENDANCE_ACTIONS.CONFIRM}:${dateStr}:absent:${selectedMask}`
    );
    keyboard.row();
  }

  // 3. Bulk Actions
  keyboard.text(
    "Attend All 🚀",
    `${ATTENDANCE_ACTIONS.ATTEND_ALL}:${dateStr}`
  );
  keyboard.text(
    "Absent All 😴",
    `${ATTENDANCE_ACTIONS.ABSENT_ALL}:${dateStr}`
  );

  return keyboard;
}

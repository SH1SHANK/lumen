import type { Context } from "https://esm.sh/grammy@1.34.0";
import {
  buildAttendanceKeyboard,
  ATTENDANCE_ACTIONS,
} from "../utils/keyboards.ts";
import { getScheduleForDate } from "../domain/schedule.ts";
import {
  markAttendanceByIndices,
  markAbsenceByIndices,
  markAttendanceForAll,
  markAbsenceForAll,
} from "../domain/attendance.ts";

// Handle single toggle
export async function handleAttendanceSelect(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return ctx.answerCallbackQuery("Invalid request");
  }

  const parts = data.split(":");
  if (parts.length < 4) {
    return ctx.answerCallbackQuery("Invalid data format");
  }

  const dateStr = parts[1];
  const index = parseInt(parts[2]);
  const currentMask = parseInt(parts[3]);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("Invalid date");
  }

  if (isNaN(index) || isNaN(currentMask) || index < 0 || index > 31) {
    return ctx.answerCallbackQuery("Invalid selection");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) return ctx.answerCallbackQuery("Unauthorized");

  try {
    const classes = await getScheduleForDate(uid, dateStr);
    if (classes.length === 0) {
      return ctx.answerCallbackQuery("No classes found for this date.");
    }

    // Validate index bounds against actual class count
    if (index >= classes.length) {
      return ctx.answerCallbackQuery("Invalid class selection");
    }

    // Toggle bit
    const newMask = currentMask ^ (1 << index);

    const keyboard = buildAttendanceKeyboard(classes, dateStr, newMask);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceSelect] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery("An error occurred");
  }
}

// Handle "Attend/Absent Selected"
export async function handleAttendanceConfirm(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return ctx.answerCallbackQuery("Invalid request");
  }

  const parts = data.split(":");
  if (parts.length < 4) {
    return ctx.answerCallbackQuery("Invalid data format");
  }

  const dateStr = parts[1];
  const type = parts[2]; // 'attend' or 'absent'
  const mask = parseInt(parts[3]);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("Invalid date");
  }

  // Validate type
  if (type !== "attend" && type !== "absent") {
    return ctx.answerCallbackQuery("Invalid action");
  }

  // Validate mask
  if (isNaN(mask) || mask < 0) {
    return ctx.answerCallbackQuery("Invalid selection");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) return ctx.answerCallbackQuery("Unauthorized");

  try {
    const classes = await getScheduleForDate(uid, dateStr);

    // Convert mask to 1-based indices
    const indices: number[] = [];
    for (let i = 0; i < classes.length; i++) {
      if ((mask & (1 << i)) !== 0) {
        indices.push(i + 1);
      }
    }

    if (indices.length === 0) {
      return ctx.answerCallbackQuery({
        text: "⚠️ No classes selected!",
        show_alert: true,
      });
    }

    if (type === "attend") {
      // Attendance writes delegated to RPC (bounded execution)
      const results = await markAttendanceByIndices(uid, classes, indices);
      const marked = results.filter((r) => r.status === "marked").length;
      const already = results.filter((r) => r.status === "already").length;
      const failed = results.filter((r) => r.status === "failed").length;

      await ctx.editMessageText(
        `✅ *Attendance Marked*\n\n` +
          `Selected: ${indices.length}\n` +
          `New: ${marked} | Existing: ${already} | Failed: ${failed}\n\n` +
          `_Your stats will reflect this immediately._`,
        { parse_mode: "Markdown" }
      );
    } else {
      // Absent - attendance deletes delegated to RPC (bounded execution)
      await markAbsenceByIndices(uid, classes, indices);
      await ctx.editMessageText(
        `📝 *Absence Recorded*\n\nMarked absent for ${indices.length} selected class(es).`,
        { parse_mode: "Markdown" }
      );
    }
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceConfirm] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery("An error occurred");
  }
}

// Handle "Attend/Absent All"
export async function handleAttendanceAll(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return ctx.answerCallbackQuery("Invalid request");
  }

  const parts = data.split(":");
  if (parts.length < 2) {
    return ctx.answerCallbackQuery("Invalid data format");
  }

  const action = parts[0]; // att_a_all or att_abs_all
  const dateStr = parts[1];

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("Invalid date");
  }

  // Validate action
  if (
    action !== ATTENDANCE_ACTIONS.ATTEND_ALL &&
    action !== ATTENDANCE_ACTIONS.ABSENT_ALL
  ) {
    return ctx.answerCallbackQuery("Invalid action");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) return ctx.answerCallbackQuery("Unauthorized");

  try {
    const classes = await getScheduleForDate(uid, dateStr);
    if (classes.length === 0) {
      return ctx.answerCallbackQuery("No classes found.");
    }

    if (action === ATTENDANCE_ACTIONS.ATTEND_ALL) {
      // Attendance writes delegated to RPC (bounded execution)
      const results = await markAttendanceForAll(uid, classes);
      const marked = results.filter((r) => r.status === "marked").length;
      const already = results.filter((r) => r.status === "already").length;

      await ctx.editMessageText(
        `✅ *All Attendance Marked*\n\n` +
          `Total: ${classes.length}\n` +
          `New: ${marked} | Existing: ${already}\n\n` +
          `_Your stats will reflect this immediately._`,
        { parse_mode: "Markdown" }
      );
    } else {
      // Absent All - attendance deletes delegated to RPC (bounded execution)
      await markAbsenceForAll(uid, classes);
      await ctx.editMessageText(
        `📝 *All Absences Recorded*\n\nMarked absent for all ${classes.length} classes.`,
        { parse_mode: "Markdown" }
      );
    }
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceAll] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery("An error occurred");
  }
}

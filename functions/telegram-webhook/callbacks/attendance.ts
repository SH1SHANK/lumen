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
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const parts = data.split(":");
  if (parts.length < 4) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const dateStr = parts[1];
  const index = parseInt(parts[2]);
  const currentMask = parseInt(parts[3]);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  if (isNaN(index) || isNaN(currentMask) || index < 0 || index > 31) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) {
    return ctx.answerCallbackQuery("Please use /start to link your account.");
  }

  try {
    const classes = await getScheduleForDate(uid, dateStr);
    if (classes.length === 0) {
      return ctx.answerCallbackQuery("No classes found for this date.");
    }

    // Validate index bounds against actual class count
    if (index >= classes.length) {
      return ctx.answerCallbackQuery("This action has expired.");
    }

    // Toggle bit
    const newMask = currentMask ^ (1 << index);

    const keyboard = buildAttendanceKeyboard(classes, dateStr, newMask);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceSelect] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery(
      "Something didn't go through. Try again in a moment."
    );
  }
}

// Handle "Attend/Absent Selected"
export async function handleAttendanceConfirm(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const parts = data.split(":");
  if (parts.length < 4) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const dateStr = parts[1];
  const type = parts[2]; // 'attend' or 'absent'
  const mask = parseInt(parts[3]);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  // Validate type
  if (type !== "attend" && type !== "absent") {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  // Validate mask
  if (isNaN(mask) || mask < 0) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) {
    return ctx.answerCallbackQuery("Please use /start to link your account.");
  }

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
        text: "No classes selected.",
        show_alert: true,
      });
    }

    if (type === "attend") {
      // Attendance writes delegated to RPC (bounded execution)
      const results = await markAttendanceByIndices(uid, classes, indices);
      const marked = results.filter((r) => r.status === "marked").length;
      const already = results.filter((r) => r.status === "already").length;

      await ctx.editMessageText(
        `Marked ${marked} class${marked > 1 ? "es" : ""} present` +
          (already > 0 ? ` (${already} already marked)` : "") +
          `.\n\n_Use /undo to revert if needed._`
      );
    } else {
      // Absent - attendance deletes delegated to RPC (bounded execution)
      await markAbsenceByIndices(uid, classes, indices);
      await ctx.editMessageText(
        `Marked ${indices.length} class${
          indices.length > 1 ? "es" : ""
        } absent.

_Use /undo to revert if needed._`
      );
    }
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceConfirm] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery(
      "Something didn't go through. Try again in a moment."
    );
  }
}

// Handle "Attend/Absent All"
export async function handleAttendanceAll(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const parts = data.split(":");
  if (parts.length < 2) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const action = parts[0]; // att_a_all or att_abs_all
  const dateStr = parts[1];

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  // Validate action
  if (
    action !== ATTENDANCE_ACTIONS.ATTEND_ALL &&
    action !== ATTENDANCE_ACTIONS.ABSENT_ALL
  ) {
    return ctx.answerCallbackQuery("This action has expired.");
  }

  const uid = ctx.state?.firebaseUid;
  if (!uid) {
    return ctx.answerCallbackQuery("Please use /start to link your account.");
  }

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
        `Marked ${marked} class${marked > 1 ? "es" : ""} present` +
          (already > 0 ? ` (${already} already marked)` : "") +
          `.\n\n_Use /undo to revert if needed._`
      );
    } else {
      // Absent All - attendance deletes delegated to RPC (bounded execution)
      await markAbsenceForAll(uid, classes);
      await ctx.editMessageText(
        `Marked all ${classes.length} class${
          classes.length > 1 ? "es" : ""
        } absent.

_Use /undo to revert if needed._`
      );
    }
    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error(`[handleAttendanceAll] Failed for uid ${uid}:`, error);
    await ctx.answerCallbackQuery(
      "Something didn't go through. Try again in a moment."
    );
  }
}

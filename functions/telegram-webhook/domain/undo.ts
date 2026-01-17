import { getLastAttendanceAction, revertAttendanceAction } from "../db/undo.ts";
import { getTodayIST } from "../utils/date.ts";

export interface UndoResult {
  success: boolean;
  message: string;
  classCount?: number;
}

/**
 * Undoes the user's last attendance action.
 *
 * Rules:
 * - Only undoes actions from today
 * - Only undoes the most recent action
 * - Does not undo actions older than the current day
 * - Does not guess or infer intent
 */
export async function undoLastAction(firebaseUid: string): Promise<UndoResult> {
  const lastAction = await getLastAttendanceAction(firebaseUid);

  if (!lastAction) {
    return {
      success: false,
      message: "Nothing to undo. All actions are from previous days.",
    };
  }

  // Check if action is from today
  const actionDate = new Date(lastAction.created_at).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Kolkata" }
  );
  const today = getTodayIST();

  if (actionDate !== today) {
    return {
      success: false,
      message: `Can only undo today's actions. Last action was on ${actionDate}.`,
    };
  }

  try {
    const affectedCount = await revertAttendanceAction(lastAction);

    const actionVerb =
      lastAction.action_type === "attend"
        ? "attendance"
        : "absence";

    return {
      success: true,
      message: `Undid ${actionVerb} for ${affectedCount} class${
        affectedCount > 1 ? "es" : ""
      }.`,
      classCount: affectedCount,
    };
  } catch (error) {
    console.error("Error reverting action:", error);
    return {
      success: false,
      message: "Something didn't go through. Try again in a moment.",
    };
  }
}

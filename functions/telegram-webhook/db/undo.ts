import { supabase } from "./client.ts";

export interface AttendanceAction {
  id: string;
  firebase_uid: string;
  action_type: "attend" | "absent";
  affected_class_ids: string[];
  created_at: string;
}

/**
 * Logs an attendance action to the audit table.
 * Should be called after successful attendance mutations.
 */
export async function logAttendanceAction(
  firebaseUid: string,
  actionType: "attend" | "absent",
  affectedClassIds: string[]
): Promise<void> {
  const { error } = await supabase.from("attendance_actions").insert({
    firebase_uid: firebaseUid,
    action_type: actionType,
    affected_class_ids: affectedClassIds,
  });

  if (error) {
    console.error("Failed to log attendance action:", error);
    // Don't throw - logging failure should not break the main operation
  }
}

/**
 * Retrieves the last attendance action for a user.
 * Returns null if no actions exist.
 */
export async function getLastAttendanceAction(
  firebaseUid: string
): Promise<AttendanceAction | null> {
  const { data, error } = await supabase
    .from("attendance_actions")
    .select("*")
    .eq("firebase_uid", firebaseUid)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return data as AttendanceAction;
}

/**
 * Reverts an attendance action.
 * - If action was "attend" → delete the attendance records
 * - If action was "absent" → re-insert the attendance records (conservative: only if they exist in timetable)
 * 
 * Returns the number of class IDs affected.
 */
export async function revertAttendanceAction(
  action: AttendanceAction
): Promise<number> {
  if (action.action_type === "attend") {
    // Undo attend: delete the attendance records
    const { error } = await supabase
      .from("attendanceRecords")
      .delete()
      .eq("userID", action.firebase_uid)
      .in("classID", action.affected_class_ids);

    if (error) {
      throw new Error(`Failed to revert attend action: ${error.message}`);
    }

    // Delete the action log entry
    await supabase
      .from("attendance_actions")
      .delete()
      .eq("id", action.id);

    return action.affected_class_ids.length;
  } else if (action.action_type === "absent") {
    // Undo absent: re-insert attendance records
    // We only re-insert if the class still exists in timetable
    const { data: classes, error: fetchError } = await supabase
      .from("timetableRecords")
      .select("classID, courseID, classStartTime")
      .in("classID", action.affected_class_ids);

    if (fetchError || !classes || classes.length === 0) {
      throw new Error("Unable to restore attendance: classes not found");
    }

    // Prepare attendance records
    const records = classes.map((cls) => ({
      userID: action.firebase_uid,
      classID: cls.classID,
      courseID: cls.courseID,
      classTime: cls.classStartTime,
      checkinTime: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from("attendanceRecords")
      .insert(records);

    if (insertError) {
      throw new Error(`Failed to restore attendance: ${insertError.message}`);
    }

    // Delete the action log entry
    await supabase
      .from("attendance_actions")
      .delete()
      .eq("id", action.id);

    return classes.length;
  }

  throw new Error(`Unknown action type: ${action.action_type}`);
}

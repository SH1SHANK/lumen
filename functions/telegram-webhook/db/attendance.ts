import { supabase } from "./client.ts";

export type AttendanceMarkStatus = "marked" | "already" | "failed";

export interface AttendanceMarkResult {
  class_id: string;
  status: AttendanceMarkStatus;
}

export interface AttendanceDeleteResult {
  class_id: string;
  deleted: boolean;
}

export interface AttendanceStatusResult {
  class_id: string;
  is_marked: boolean;
}

// Check if attendance is already marked for a class
export async function isAttendanceMarked(
  userID: string,
  classID: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_attendance_exists", {
    p_class_id: classID,
    p_user_id: userID,
  });

  if (error) return false;
  return !!data;
}

export async function markAttendanceBulk(params: {
  userID: string;
  classIDs: string[];
  courseIDs: string[];
  classTimes: string[];
  checkinTime: string;
}): Promise<AttendanceMarkResult[]> {
  const { data, error } = await supabase.rpc("mark_attendance_bulk", {
    p_user_id: params.userID,
    p_class_ids: params.classIDs,
    p_course_ids: params.courseIDs,
    p_class_times: params.classTimes,
    p_checkin_time: params.checkinTime,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to mark attendance");
  }

  return data as AttendanceMarkResult[];
}

export async function deleteAttendanceBulk(
  userID: string,
  classIDs: string[]
): Promise<AttendanceDeleteResult[]> {
  const { data, error } = await supabase.rpc("delete_attendance_bulk", {
    p_user_id: userID,
    p_class_ids: classIDs,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to delete attendance");
  }

  return data as AttendanceDeleteResult[];
}

export async function getAttendanceStatusBulk(
  userID: string,
  classIDs: string[]
): Promise<AttendanceStatusResult[]> {
  const { data, error } = await supabase.rpc("get_attendance_status_bulk", {
    p_user_id: userID,
    p_class_ids: classIDs,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to fetch attendance status");
  }

  return data as AttendanceStatusResult[];
}

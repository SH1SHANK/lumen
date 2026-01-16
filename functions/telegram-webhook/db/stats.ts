import { supabase } from "./client.ts";

export interface AttendanceSummary {
  total_classes: number;
  attended_classes: number;
  percentage: number;
}

export async function getAttendanceSummary(params: {
  userID: string;
  courseIDs: string[];
  batchID: string;
  todayDate: string;
}): Promise<AttendanceSummary> {
  const { data, error } = await supabase.rpc("get_attendance_summary", {
    p_user_id: params.userID,
    p_course_ids: params.courseIDs,
    p_batch_id: params.batchID,
    p_today_date: params.todayDate,
  });

  if (error || !data) {
    throw error ?? new Error("Failed to fetch attendance summary");
  }

  return data as AttendanceSummary;
}

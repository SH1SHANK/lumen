import { supabase } from "./client.ts";

export interface EffectiveCourseAttendance {
  course_id: string;
  course_name: string;
  is_lab: boolean;
  effective_attended_classes: number;
  effective_total_classes: number;
}

export async function getEffectiveCourseAttendance(
  firebaseUid: string
): Promise<EffectiveCourseAttendance[]> {
  const { data, error } = await supabase.rpc(
    "get_effective_course_attendance",
    {
      p_firebase_uid: firebaseUid,
    }
  );

  if (error || !data) {
    throw error ?? new Error("Failed to fetch effective course attendance");
  }

  return data as EffectiveCourseAttendance[];
}

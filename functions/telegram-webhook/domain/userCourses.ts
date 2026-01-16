import type { EffectiveCourseAttendance } from "../db/courseAttendance.ts";
import { getEffectiveCourseAttendance } from "../db/courseAttendance.ts";

/**
 * Course-wise attendance summary for a user.
 *
 * This is the ONLY attendance read interface in the Telegram bot.
 * All attendance reads must use this type.
 */
export interface CourseAttendanceSummary {
  courseId: string;
  courseName: string;
  isLab: boolean;
  attended: number;
  total: number;
  percentage: number;
}

/**
 * Get effective course-wise attendance for a user.
 *
 * This is the SINGLE source of truth for attendance in the Telegram bot.
 *
 * Guarantees:
 * - Attendance is always course-wise (never overall).
 * - Results are authoritative (merge Firebase snapshot + attendanceRecords deltas).
 * - Users do NOT need to open the app to see accurate attendance.
 * - Computation happens in Postgres (get_effective_course_attendance RPC).
 *
 * On Failure:
 * - Throws if the RPC fails.
 * - Caller must handle with user-facing fallback.
 *
 * @param firebaseUid - The user's Firebase UID
 * @returns Array of course attendance summaries
 */
export async function getUserCourseAttendance(
  firebaseUid: string
): Promise<CourseAttendanceSummary[]> {
  const courses = await getEffectiveCourseAttendance(firebaseUid);

  return courses.map((course) => {
    const percentage =
      course.effective_total_classes > 0
        ? (course.effective_attended_classes / course.effective_total_classes) *
          100
        : 0;

    return {
      courseId: course.course_id,
      courseName: course.course_name,
      isLab: course.is_lab,
      attended: course.effective_attended_classes,
      total: course.effective_total_classes,
      percentage: Math.round(percentage * 10) / 10,
    };
  });
}

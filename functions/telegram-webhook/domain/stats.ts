import { getAttendanceSummary } from "../db/stats.ts";
import { getUserEnrollment } from "../db/schedule.ts";
import { getTodayIST } from "../utils/date.ts";

export interface AttendanceStatusSummary {
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
}

export async function getUserAttendanceSummary(
  userID: string
): Promise<AttendanceStatusSummary | null> {
  const enrollment = await getUserEnrollment(userID);
  if (!enrollment || !enrollment.courseIDs.length) {
    return null;
  }

  const summary = await getAttendanceSummary({
    userID,
    courseIDs: enrollment.courseIDs,
    batchID: enrollment.batchID,
    todayDate: getTodayIST(),
  });

  const percentage = Number(summary.percentage ?? 0);

  return {
    totalClasses: Number(summary.total_classes ?? 0),
    attendedClasses: Number(summary.attended_classes ?? 0),
    percentage: Number.isFinite(percentage) ? percentage : 0,
  };
}

import {
  getUserEnrollment,
  getClassesByDate,
  ClassRecord,
} from "../db/schedule.ts";
import { getAttendanceStatusBulk } from "../db/attendance.ts";
import { getTodayIST, getTomorrowIST } from "../utils/date.ts";

export interface ScheduleClass extends ClassRecord {
  isMarked?: boolean;
}

// Get today's schedule for a user
export async function getTodaySchedule(
  userID: string
): Promise<ScheduleClass[]> {
  const enrollment = await getUserEnrollment(userID);
  if (!enrollment || !enrollment.courseIDs.length) {
    return [];
  }

  const today = getTodayIST();
  const classes = await getClassesByDate(
    enrollment.batchID,
    enrollment.courseIDs,
    today
  );

  if (classes.length === 0) {
    return [];
  }

  const classIDs = classes.map((cls) => cls.classID);
  const statuses = await getAttendanceStatusBulk(userID, classIDs);
  const statusMap = new Map(
    statuses.map((status) => [status.class_id, status.is_marked])
  );

  return classes.map((cls) => ({
    ...cls,
    isMarked: statusMap.get(cls.classID) ?? false,
  }));
}

// Get tomorrow's schedule for a user
export async function getTomorrowSchedule(
  userID: string
): Promise<ClassRecord[]> {
  const enrollment = await getUserEnrollment(userID);
  if (!enrollment || !enrollment.courseIDs.length) {
    return [];
  }

  const tomorrow = getTomorrowIST();
  const classes = await getClassesByDate(
    enrollment.batchID,
    enrollment.courseIDs,
    tomorrow
  );

  return classes;
}

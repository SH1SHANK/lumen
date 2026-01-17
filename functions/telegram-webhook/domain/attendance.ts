import type { ClassRecord } from "../db/schedule.ts";
import {
  deleteAttendanceBulk,
  markAttendanceBulk,
  type AttendanceMarkStatus,
} from "../db/attendance.ts";
import { logAttendanceAction } from "../db/undo.ts";

export interface AttendanceActionResult {
  index: number;
  classID: string;
  courseName: string;
  status: AttendanceMarkStatus;
}

function mapIndicesToClasses(
  classes: ClassRecord[],
  indices: number[]
): Array<{ index: number; cls: ClassRecord }> {
  return indices.map((index) => ({ index, cls: classes[index - 1] }));
}

export async function markAttendanceByIndices(
  userID: string,
  classes: ClassRecord[],
  indices: number[]
): Promise<AttendanceActionResult[]> {
  const selections = mapIndicesToClasses(classes, indices);

  const classIDs = selections.map(({ cls }) => cls.classID);
  const courseIDs = selections.map(({ cls }) => cls.courseID);
  const classTimes = selections.map(({ cls }) => cls.classStartTime);
  const checkinTime = new Date().toISOString();

  const results = await markAttendanceBulk({
    userID,
    classIDs,
    courseIDs,
    classTimes,
    checkinTime,
  });

  const statusByClassID = new Map(
    results.map((result) => [result.class_id, result.status])
  );

  // Log successful marks
  const successfulClassIDs = results
    .filter((r) => r.status === "marked")
    .map((r) => r.class_id);

  if (successfulClassIDs.length > 0) {
    await logAttendanceAction(userID, "attend", successfulClassIDs);
  }

  return selections.map(({ index, cls }) => ({
    index,
    classID: cls.classID,
    courseName: cls.courseName,
    status: statusByClassID.get(cls.classID) ?? "failed",
  }));
}

export async function markAttendanceForAll(
  userID: string,
  classes: ClassRecord[]
): Promise<AttendanceActionResult[]> {
  const indices = classes.map((_, idx) => idx + 1);
  return markAttendanceByIndices(userID, classes, indices);
}

export async function markAttendanceForClass(
  userID: string,
  classItem: ClassRecord
): Promise<AttendanceMarkStatus> {
  const results = await markAttendanceBulk({
    userID,
    classIDs: [classItem.classID],
    courseIDs: [classItem.courseID],
    classTimes: [classItem.classStartTime],
    checkinTime: new Date().toISOString(),
  });

  const status = results[0]?.status ?? "failed";

  if (status === "marked") {
    await logAttendanceAction(userID, "attend", [classItem.classID]);
  }

  return status;
}

export interface AbsenceActionResult {
  index: number;
  classID: string;
  courseName: string;
}

export async function markAbsenceByIndices(
  userID: string,
  classes: ClassRecord[],
  indices: number[]
): Promise<AbsenceActionResult[]> {
  const selections = mapIndicesToClasses(classes, indices);
  const classIDs = selections.map(({ cls }) => cls.classID);

  await deleteAttendanceBulk(userID, classIDs);

  // Log absence marking
  if (classIDs.length > 0) {
    await logAttendanceAction(userID, "absent", classIDs);
  }

  return selections.map(({ index, cls }) => ({
    index,
    classID: cls.classID,
    courseName: cls.courseName,
  }));
}

export async function markAbsenceForAll(
  userID: string,
  classes: ClassRecord[]
): Promise<void> {
  const classIDs = classes.map((cls) => cls.classID);
  await deleteAttendanceBulk(userID, classIDs);

  // Log absence marking
  if (classIDs.length > 0) {
    await logAttendanceAction(userID, "absent", classIDs);
  }
}

export async function markAbsenceForClass(
  userID: string,
  classID: string
): Promise<void> {
  await deleteAttendanceBulk(userID, [classID]);

  // Log absence marking
  await logAttendanceAction(userID, "absent", [classID]);
}

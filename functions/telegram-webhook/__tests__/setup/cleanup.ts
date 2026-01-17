// Test cleanup utilities
//
// These functions clean up test data after each test to ensure isolation.

import { supabase } from "../../db/client.ts";
import { DUMMY_FIREBASE_UID } from "../fixtures/test-data.ts";

/**
 * Delete all attendance records for the dummy user.
 * This should be called after each test that creates attendance records.
 */
export async function cleanupAttendanceRecords(): Promise<void> {
  const { error } = await supabase
    .from("attendanceRecords")
    .delete()
    .eq("userID", DUMMY_FIREBASE_UID);

  if (error) {
    console.warn("Failed to cleanup attendance records:", error);
  }
}

/**
 * Delete all attendance action logs for the dummy user.
 * This should be called after each test that creates action logs.
 */
export async function cleanupAttendanceActions(): Promise<void> {
  const { error } = await supabase
    .from("attendance_actions")
    .delete()
    .eq("firebase_uid", DUMMY_FIREBASE_UID);

  if (error) {
    console.warn("Failed to cleanup attendance actions:", error);
  }
}

/**
 * Delete all timetable records matching test class IDs.
 * This should be called after tests that create timetable entries.
 */
export async function cleanupTimetableRecords(
  classIDs: string[]
): Promise<void> {
  if (classIDs.length === 0) return;

  const { error } = await supabase
    .from("timetableRecords")
    .delete()
    .in("classID", classIDs);

  if (error) {
    console.warn("Failed to cleanup timetable records:", error);
  }
}

/**
 * Delete daily brief log entries for the dummy user.
 */
export async function cleanupDailyBriefLog(): Promise<void> {
  const { error } = await supabase
    .from("daily_brief_log")
    .delete()
    .eq("firebase_uid", DUMMY_FIREBASE_UID);

  if (error) {
    console.warn("Failed to cleanup daily brief log:", error);
  }
}

/**
 * Full cleanup - removes all test data for the dummy user.
 * Use this for thorough cleanup between test suites.
 */
export async function fullCleanup(): Promise<void> {
  await Promise.all([
    cleanupAttendanceRecords(),
    cleanupAttendanceActions(),
    cleanupDailyBriefLog(),
  ]);
}

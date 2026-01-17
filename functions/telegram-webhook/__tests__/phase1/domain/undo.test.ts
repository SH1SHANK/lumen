// Phase 1: Undo domain logic tests
//
// Purpose: Validate undo safety and conservative restoration
// Critical: Undo must be predictable, safe, and limited to same-day actions
//
// Tests cover:
// - Same-day restriction enforcement
// - Single-step undo (only most recent action)
// - Conservative restoration (only if timetable exists)
// - Attend vs absent action reversal
// - Action log cleanup after undo

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { undoLastAction } from "../../../domain/undo.ts";
import {
  logAttendanceAction,
  getLastAttendanceAction,
} from "../../../db/undo.ts";
import { supabase } from "../../../db/client.ts";
import {
  DUMMY_FIREBASE_UID,
  TEST_COURSE_IDS,
  TEST_CLASS_IDS,
  getTodayISTString,
  getYesterdayISTString,
} from "../../fixtures/test-data.ts";
import {
  cleanupAttendanceRecords,
  cleanupAttendanceActions,
  fullCleanup,
} from "../../setup/cleanup.ts";

// Helper: Create attendance record
async function createAttendanceRecord(params: {
  classID: string;
  courseID: string;
  classTime: string;
  checkinTime: string;
}): Promise<void> {
  const { error } = await supabase.from("attendanceRecords").insert({
    userID: DUMMY_FIREBASE_UID,
    classID: params.classID,
    courseID: params.courseID,
    classTime: params.classTime,
    checkinTime: params.checkinTime,
    createdAt: new Date().toISOString(),
  });

  if (error) throw error;
}

// Helper: Create timetable record
async function createTimetableRecord(params: {
  classID: string;
  courseID: string;
  courseName: string;
  classStartTime: string;
  isLab: boolean;
}): Promise<void> {
  const { error } = await supabase.from("timetableRecords").insert({
    userID: DUMMY_FIREBASE_UID,
    classID: params.classID,
    courseID: params.courseID,
    courseName: params.courseName,
    isLab: params.isLab,
    classStartTime: params.classStartTime,
    createdAt: new Date().toISOString(),
  });

  if (error) throw error;
}

// Helper: Manually insert action log with custom timestamp (for testing old actions)
async function createActionLogWithTimestamp(params: {
  actionType: "attend" | "absent";
  affectedClassIds: string[];
  createdAt: string;
}): Promise<void> {
  const { error } = await supabase.from("attendance_actions").insert({
    firebase_uid: DUMMY_FIREBASE_UID,
    action_type: params.actionType,
    affected_class_ids: params.affectedClassIds,
    created_at: params.createdAt,
  });

  if (error) throw error;
}

Deno.test({
  name: "undo: same-day restriction - cannot undo actions from previous days",
  async fn() {
    await fullCleanup();

    try {
      const yesterday = getYesterdayISTString();

      // Create an action log from yesterday (manually set timestamp)
      await createActionLogWithTimestamp({
        actionType: "attend",
        affectedClassIds: [TEST_CLASS_IDS.CLASS_1],
        createdAt: `${yesterday}T09:00:00Z`,
      });

      // Try to undo
      const result = await undoLastAction(DUMMY_FIREBASE_UID);

      // Assert: Should reject
      assertEquals(result.success, false);
      assertEquals(
        result.message.includes("previous day") ||
          result.message.includes(yesterday),
        true,
        "Should mention date restriction"
      );

      // Verify: Action log still exists (wasn't consumed)
      const lastAction = await getLastAttendanceAction(DUMMY_FIREBASE_UID);
      assertEquals(lastAction !== null, true, "Old action should remain");
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "undo: single-step - only undoes most recent action, not older ones",
  async fn() {
    await fullCleanup();

    try {
      const today = getTodayISTString();

      // Create two actions (simulate two separate mark operations)
      // Action 1 (older): marked class 1
      await createAttendanceRecord({
        classID: TEST_CLASS_IDS.CLASS_1,
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
      });
      await logAttendanceAction(DUMMY_FIREBASE_UID, "attend", [
        TEST_CLASS_IDS.CLASS_1,
      ]);

      // Wait a moment to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Action 2 (newer): marked class 2
      await createAttendanceRecord({
        classID: TEST_CLASS_IDS.CLASS_2,
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T10:00:00`,
        checkinTime: `${today}T10:05:00`,
      });
      await logAttendanceAction(DUMMY_FIREBASE_UID, "attend", [
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // Undo (should only undo Action 2)
      const result = await undoLastAction(DUMMY_FIREBASE_UID);

      assertEquals(result.success, true);
      assertEquals(result.classCount, 1);

      // Verify: Class 1 attendance still exists (older action untouched)
      const { data: class1Record } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID)
        .eq("classID", TEST_CLASS_IDS.CLASS_1)
        .single();

      assertEquals(class1Record !== null, true, "Older action should remain");

      // Verify: Class 2 attendance deleted (recent action undone)
      const { data: class2Record } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID)
        .eq("classID", TEST_CLASS_IDS.CLASS_2)
        .maybeSingle();

      assertEquals(class2Record, null, "Recent action should be undone");

      // Verify: Only 1 action log remains (the older one)
      const { data: actions } = await supabase
        .from("attendance_actions")
        .select("affected_class_ids")
        .eq("firebase_uid", DUMMY_FIREBASE_UID);

      assertEquals(actions?.length, 1, "Should have 1 action left");
      assertEquals(
        actions?.[0].affected_class_ids[0],
        TEST_CLASS_IDS.CLASS_1,
        "Remaining action should be the older one"
      );
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "undo: conservative restoration - undoing 'absent' only restores if timetable exists",
  async fn() {
    await fullCleanup();

    try {
      const today = getTodayISTString();

      // Setup: Create timetable for Class 1 only (not Class 2)
      await createTimetableRecord({
        classID: TEST_CLASS_IDS.CLASS_1,
        courseID: TEST_COURSE_IDS.COURSE_A,
        courseName: "Test Course A",
        classStartTime: `${today}T09:00:00`,
        isLab: false,
      });

      // Simulate user marked Class 1 and Class 2 as absent
      // (In reality, "absent" means deleting attendance, so create action log only)
      await logAttendanceAction(DUMMY_FIREBASE_UID, "absent", [
        TEST_CLASS_IDS.CLASS_1, // has timetable
        TEST_CLASS_IDS.CLASS_2, // NO timetable
      ]);

      // Undo the "absent" action
      const result = await undoLastAction(DUMMY_FIREBASE_UID);

      // Assert: Should succeed but only restore Class 1
      assertEquals(result.success, true);
      // Conservative: only classes in timetable are restored
      assertEquals(
        result.classCount,
        1,
        "Only 1 class should be restored (has timetable)"
      );

      // Verify: Class 1 attendance restored
      const { data: class1Record } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID)
        .eq("classID", TEST_CLASS_IDS.CLASS_1)
        .maybeSingle();

      assertEquals(class1Record !== null, true, "Class 1 should be restored");

      // Verify: Class 2 NOT restored (no timetable)
      const { data: class2Record } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID)
        .eq("classID", TEST_CLASS_IDS.CLASS_2)
        .maybeSingle();

      assertEquals(
        class2Record,
        null,
        "Class 2 should NOT be restored (no timetable)"
      );

      // Cleanup timetable
      await supabase
        .from("timetableRecords")
        .delete()
        .eq("classID", TEST_CLASS_IDS.CLASS_1);
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "undo: attend action - successfully deletes attendance records",
  async fn() {
    await fullCleanup();

    try {
      const today = getTodayISTString();

      // Setup: Mark attendance for 2 classes
      await createAttendanceRecord({
        classID: TEST_CLASS_IDS.CLASS_1,
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
      });
      await createAttendanceRecord({
        classID: TEST_CLASS_IDS.CLASS_2,
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T10:00:00`,
        checkinTime: `${today}T10:05:00`,
      });

      // Log the action
      await logAttendanceAction(DUMMY_FIREBASE_UID, "attend", [
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // Undo
      const result = await undoLastAction(DUMMY_FIREBASE_UID);

      assertEquals(result.success, true);
      assertEquals(result.classCount, 2);

      // Verify: Attendance records deleted
      const { data: records } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(
        records?.length,
        0,
        "All attendance records should be deleted"
      );

      // Verify: Action log deleted
      const lastAction = await getLastAttendanceAction(DUMMY_FIREBASE_UID);
      assertEquals(lastAction, null, "Action log should be consumed");
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "undo: no actions - returns appropriate message",
  async fn() {
    await fullCleanup();

    try {
      // No actions logged

      const result = await undoLastAction(DUMMY_FIREBASE_UID);

      assertEquals(result.success, false);
      assertEquals(
        result.message.includes("Nothing to undo"),
        true,
        "Should indicate no actions to undo"
      );
    } finally {
      await fullCleanup();
    }
  },
});

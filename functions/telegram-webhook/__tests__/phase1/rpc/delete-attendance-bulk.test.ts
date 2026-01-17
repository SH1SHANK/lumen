// Phase 1: delete_attendance_bulk idempotency tests
//
// Purpose: Validate that delete_attendance_bulk is retry-safe
// Critical: Webhook retries must not fail when deleting already-deleted records
//
// Tests cover:
// - Double-call idempotency (delete twice returns false on second call)
// - Partial success (some exist, some don't)
// - Mixed existing + non-existing classes
// - Return value correctness (deleted: true | false)

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { deleteAttendanceBulk } from "../../../db/attendance.ts";
import { supabase } from "../../../db/client.ts";
import {
  DUMMY_FIREBASE_UID,
  TEST_COURSE_IDS,
  TEST_CLASS_IDS,
  getTodayISTString,
} from "../../fixtures/test-data.ts";
import { cleanupAttendanceRecords } from "../../setup/cleanup.ts";

// Helper: Create attendance records for testing deletion
async function createTestAttendanceRecords(classIDs: string[]): Promise<void> {
  const today = getTodayISTString();
  const records = classIDs.map((classID, index) => ({
    userID: DUMMY_FIREBASE_UID,
    classID: classID,
    courseID: TEST_COURSE_IDS.COURSE_A,
    classTime: `${today}T${9 + index}:00:00`,
    checkinTime: `${today}T${9 + index}:05:00`,
    createdAt: new Date().toISOString(),
  }));

  const { error } = await supabase.from("attendanceRecords").insert(records);
  if (error) throw error;
}

Deno.test({
  name: "delete_attendance_bulk: idempotent - calling twice returns false on second call",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      // Setup: Create 2 attendance records
      await createTestAttendanceRecords([
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // First call: delete attendance
      const result1 = await deleteAttendanceBulk(DUMMY_FIREBASE_UID, [
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // Assert: First call should return deleted=true
      assertEquals(result1.length, 2);
      assertEquals(
        result1.every((r) => r.deleted === true),
        true,
        "First call should delete all"
      );

      // Verify: Records are gone
      const { data: afterFirst } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(afterFirst?.length, 0, "Records should be deleted");

      // Second call: same classIDs
      const result2 = await deleteAttendanceBulk(DUMMY_FIREBASE_UID, [
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // Assert: Second call should return deleted=false (nothing to delete)
      assertEquals(result2.length, 2);
      assertEquals(
        result2.every((r) => r.deleted === false),
        true,
        "Second call should indicate nothing deleted"
      );
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "delete_attendance_bulk: partial success - mixed existing + non-existing classes",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      // Setup: Create only 2 out of 3 records
      await createTestAttendanceRecords([
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ]);

      // Call delete with 3 classIDs (1 doesn't exist)
      const result = await deleteAttendanceBulk(DUMMY_FIREBASE_UID, [
        TEST_CLASS_IDS.CLASS_1, // exists
        TEST_CLASS_IDS.CLASS_2, // exists
        TEST_CLASS_IDS.CLASS_3, // doesn't exist
      ]);

      // Assert: Mixed results
      assertEquals(result.length, 3);

      const class1Result = result.find(
        (r) => r.class_id === TEST_CLASS_IDS.CLASS_1
      );
      const class2Result = result.find(
        (r) => r.class_id === TEST_CLASS_IDS.CLASS_2
      );
      const class3Result = result.find(
        (r) => r.class_id === TEST_CLASS_IDS.CLASS_3
      );

      assertEquals(
        class1Result?.deleted,
        true,
        "Existing class should be deleted"
      );
      assertEquals(
        class2Result?.deleted,
        true,
        "Existing class should be deleted"
      );
      assertEquals(
        class3Result?.deleted,
        false,
        "Non-existing class should return false"
      );

      // Verify: All records are gone
      const { data: records } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(records?.length, 0);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "delete_attendance_bulk: returns results in same order as input classIDs",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      await createTestAttendanceRecords([
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
        TEST_CLASS_IDS.CLASS_3,
      ]);

      const inputClassIDs = [
        TEST_CLASS_IDS.CLASS_3, // reversed order
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
      ];

      const result = await deleteAttendanceBulk(
        DUMMY_FIREBASE_UID,
        inputClassIDs
      );

      // Assert: Results order matches input
      assertEquals(result.length, 3);
      assertEquals(result[0].class_id, TEST_CLASS_IDS.CLASS_3);
      assertEquals(result[1].class_id, TEST_CLASS_IDS.CLASS_1);
      assertEquals(result[2].class_id, TEST_CLASS_IDS.CLASS_2);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "delete_attendance_bulk: empty classIDs array returns empty results",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      await createTestAttendanceRecords([TEST_CLASS_IDS.CLASS_1]);

      const result = await deleteAttendanceBulk(DUMMY_FIREBASE_UID, []);

      // Assert: Empty array returned
      assertEquals(result.length, 0);

      // Verify: Original record still exists (nothing deleted)
      const { data: records } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(records?.length, 1);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "delete_attendance_bulk: doesn't affect other users' records",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      // Setup: Create record for dummy user
      await createTestAttendanceRecords([TEST_CLASS_IDS.CLASS_1]);

      // Setup: Create record for a different user (simulating isolation)
      const otherUserID = "other_user_firebase_uid";
      const today = getTodayISTString();
      await supabase.from("attendanceRecords").insert({
        userID: otherUserID,
        classID: TEST_CLASS_IDS.CLASS_1, // same classID
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
        createdAt: new Date().toISOString(),
      });

      // Delete for dummy user only
      const result = await deleteAttendanceBulk(DUMMY_FIREBASE_UID, [
        TEST_CLASS_IDS.CLASS_1,
      ]);

      assertEquals(result[0].deleted, true);

      // Verify: Dummy user's record deleted
      const { data: dummyRecords } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(dummyRecords?.length, 0);

      // Verify: Other user's record still exists
      const { data: otherRecords } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", otherUserID);

      assertEquals(otherRecords?.length, 1);

      // Cleanup other user's record
      await supabase
        .from("attendanceRecords")
        .delete()
        .eq("userID", otherUserID);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

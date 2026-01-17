// Phase 1: mark_attendance_bulk idempotency tests
//
// Purpose: Validate that mark_attendance_bulk is retry-safe
// Critical: Webhook retries must not create duplicate attendance records
//
// Tests cover:
// - Double-call idempotency (same call twice)
// - Partial success handling
// - Mixed already-marked + new classes
// - Return value correctness ("marked" | "already" | "failed")

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { markAttendanceBulk } from "../../../db/attendance.ts";
import { supabase } from "../../../db/client.ts";
import {
  DUMMY_FIREBASE_UID,
  TEST_COURSE_IDS,
  TEST_CLASS_IDS,
  getTodayISTString,
} from "../../fixtures/test-data.ts";
import { cleanupAttendanceRecords, fullCleanup } from "../../setup/cleanup.ts";

Deno.test({
  name: "mark_attendance_bulk: idempotent - calling twice returns 'already' on second call",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      const today = getTodayISTString();
      const params = {
        userID: DUMMY_FIREBASE_UID,
        classIDs: [TEST_CLASS_IDS.CLASS_1, TEST_CLASS_IDS.CLASS_2],
        courseIDs: [TEST_COURSE_IDS.COURSE_A, TEST_COURSE_IDS.COURSE_A],
        classTimes: [`${today}T09:00:00`, `${today}T11:00:00`],
        checkinTime: `${today}T09:05:00`,
      };

      // First call: mark attendance
      const result1 = await markAttendanceBulk(params);

      // Assert: First call should return "marked"
      assertEquals(result1.length, 2);
      assertEquals(
        result1.every((r) => r.status === "marked"),
        true,
        "First call should mark all as 'marked'"
      );

      // Second call: same params
      const result2 = await markAttendanceBulk(params);

      // Assert: Second call should return "already"
      assertEquals(result2.length, 2);
      assertEquals(
        result2.every((r) => r.status === "already"),
        true,
        "Second call should mark all as 'already'"
      );

      // Verify: Only 2 records exist in DB (not 4)
      const { data: records } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(
        records?.length,
        2,
        "Should have exactly 2 records, not duplicates"
      );
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "mark_attendance_bulk: partial success - returns mixed status correctly",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      const today = getTodayISTString();

      // Pre-mark one class manually
      await supabase.from("attendanceRecords").insert({
        userID: DUMMY_FIREBASE_UID,
        classID: TEST_CLASS_IDS.CLASS_1,
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:03:00`,
        createdAt: new Date().toISOString(),
      });

      // Now call mark_attendance_bulk with 3 classes (1 already marked, 2 new)
      const result = await markAttendanceBulk({
        userID: DUMMY_FIREBASE_UID,
        classIDs: [
          TEST_CLASS_IDS.CLASS_1, // already marked
          TEST_CLASS_IDS.CLASS_2, // new
          TEST_CLASS_IDS.CLASS_3, // new
        ],
        courseIDs: [
          TEST_COURSE_IDS.COURSE_A,
          TEST_COURSE_IDS.COURSE_A,
          TEST_COURSE_IDS.COURSE_A,
        ],
        classTimes: [
          `${today}T09:00:00`,
          `${today}T10:00:00`,
          `${today}T11:00:00`,
        ],
        checkinTime: `${today}T10:05:00`,
      });

      // Assert: Mixed status
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
        class1Result?.status,
        "already",
        "Pre-marked class should be 'already'"
      );
      assertEquals(
        class2Result?.status,
        "marked",
        "New class should be 'marked'"
      );
      assertEquals(
        class3Result?.status,
        "marked",
        "New class should be 'marked'"
      );

      // Verify: Exactly 3 records in DB
      const { data: records } = await supabase
        .from("attendanceRecords")
        .select("classID")
        .eq("userID", DUMMY_FIREBASE_UID);

      assertEquals(records?.length, 3);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "mark_attendance_bulk: returns results in same order as input classIDs",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      const today = getTodayISTString();
      const inputClassIDs = [
        TEST_CLASS_IDS.CLASS_1,
        TEST_CLASS_IDS.CLASS_2,
        TEST_CLASS_IDS.CLASS_3,
      ];

      const result = await markAttendanceBulk({
        userID: DUMMY_FIREBASE_UID,
        classIDs: inputClassIDs,
        courseIDs: [
          TEST_COURSE_IDS.COURSE_A,
          TEST_COURSE_IDS.COURSE_A,
          TEST_COURSE_IDS.COURSE_A,
        ],
        classTimes: [
          `${today}T09:00:00`,
          `${today}T10:00:00`,
          `${today}T11:00:00`,
        ],
        checkinTime: `${today}T09:05:00`,
      });

      // Assert: Results order matches input
      assertEquals(result.length, 3);
      assertEquals(result[0].class_id, TEST_CLASS_IDS.CLASS_1);
      assertEquals(result[1].class_id, TEST_CLASS_IDS.CLASS_2);
      assertEquals(result[2].class_id, TEST_CLASS_IDS.CLASS_3);
    } finally {
      await cleanupAttendanceRecords();
    }
  },
});

Deno.test({
  name: "mark_attendance_bulk: empty classIDs array returns empty results",
  async fn() {
    await cleanupAttendanceRecords();

    try {
      const today = getTodayISTString();

      const result = await markAttendanceBulk({
        userID: DUMMY_FIREBASE_UID,
        classIDs: [],
        courseIDs: [],
        classTimes: [],
        checkinTime: `${today}T09:05:00`,
      });

      // Assert: Empty array returned
      assertEquals(result.length, 0);

      // Verify: No records created
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

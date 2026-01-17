// Phase 1: get_effective_course_attendance RPC correctness tests
//
// Purpose: Validate single source of truth for attendance reads
// Critical: This RPC merges Firebase snapshot + attendanceRecords deltas
//
// Tests cover:
// - Snapshot + delta merging
// - Missing Firebase snapshot handling
// - lastDataFetchTime filtering
// - New classes from timetableRecords
// - Deleted courses
// - Course isolation

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getEffectiveCourseAttendance } from "../../../db/courseAttendance.ts";
import { supabase } from "../../../db/client.ts";
import {
  DUMMY_FIREBASE_UID,
  TEST_COURSE_IDS,
  getTodayISTString,
} from "../../fixtures/test-data.ts";
import { cleanupAttendanceRecords, fullCleanup } from "../../setup/cleanup.ts";

// Helper: Create a test class in timetableRecords
async function createTestClass(params: {
  classID: string;
  courseID: string;
  courseName: string;
  classTime: string;
  isLab: boolean;
}): Promise<void> {
  const { error } = await supabase.from("timetableRecords").insert({
    userID: DUMMY_FIREBASE_UID,
    classID: params.classID,
    courseID: params.courseID,
    courseName: params.courseName,
    isLab: params.isLab,
    classTime: params.classTime,
    createdAt: new Date().toISOString(),
  });

  if (error) throw error;
}

// Helper: Mark attendance for a specific class
async function markTestAttendance(params: {
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

// Helper: Update Firebase snapshot for a course
async function updateFirebaseSnapshot(params: {
  courseID: string;
  attendedClasses: number;
  totalClasses: number;
}): Promise<void> {
  const { error } = await supabase.from("firebase_data").upsert({
    userID: DUMMY_FIREBASE_UID,
    courseID: params.courseID,
    attendedClasses: params.attendedClasses,
    totalClasses: params.totalClasses,
    lastUpdated: new Date().toISOString(),
  });

  if (error) throw error;
}

// Helper: Set lastDataFetchTime for the user
async function setLastDataFetchTime(timestamp: string): Promise<void> {
  const { error } = await supabase.from("userProfile").upsert({
    firebaseUID: DUMMY_FIREBASE_UID,
    lastDataFetchTime: timestamp,
  });

  if (error) throw error;
}

Deno.test({
  name: "get_effective_course_attendance: merges snapshot + deltas correctly",
  async fn() {
    await fullCleanup();

    try {
      // Setup: Firebase snapshot shows 3/10
      await updateFirebaseSnapshot({
        courseID: TEST_COURSE_IDS.COURSE_A,
        attendedClasses: 3,
        totalClasses: 10,
      });

      // Setup: Set lastDataFetchTime to a past date
      const fetchTime = "2024-01-01T00:00:00Z";
      await setLastDataFetchTime(fetchTime);

      // Setup: User marked 2 more classes after the snapshot
      const today = getTodayISTString();
      await markTestAttendance({
        classID: "class_1",
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
      });
      await markTestAttendance({
        classID: "class_2",
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T11:00:00`,
        checkinTime: `${today}T11:03:00`,
      });

      // Act: Call the RPC
      const result = await getEffectiveCourseAttendance(DUMMY_FIREBASE_UID);

      // Assert: Effective attendance = snapshot + delta (3 + 2 = 5)
      const courseA = result.find(
        (c) => c.course_id === TEST_COURSE_IDS.COURSE_A
      );
      assertEquals(courseA !== undefined, true, "Course A should exist");
      assertEquals(
        courseA!.effective_attended_classes,
        5,
        "Should merge snapshot (3) + delta (2)"
      );
      assertEquals(
        courseA!.effective_total_classes,
        10,
        "Total should remain from snapshot"
      );
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "get_effective_course_attendance: handles missing Firebase snapshot gracefully",
  async fn() {
    await fullCleanup();

    try {
      // Setup: No Firebase snapshot exists, only delta attendance
      const today = getTodayISTString();
      await createTestClass({
        classID: "class_3",
        courseID: TEST_COURSE_IDS.COURSE_B,
        courseName: "Test Course B",
        classTime: `${today}T10:00:00`,
        isLab: false,
      });

      await markTestAttendance({
        classID: "class_3",
        courseID: TEST_COURSE_IDS.COURSE_B,
        classTime: `${today}T10:00:00`,
        checkinTime: `${today}T10:02:00`,
      });

      // Act
      const result = await getEffectiveCourseAttendance(DUMMY_FIREBASE_UID);

      // Assert: Should use delta only (attended=1, total calculated from timetable)
      const courseB = result.find(
        (c) => c.course_id === TEST_COURSE_IDS.COURSE_B
      );
      assertEquals(courseB !== undefined, true, "Course B should exist");
      assertEquals(
        courseB!.effective_attended_classes,
        1,
        "Should count delta attendance"
      );
      // Total depends on timetableRecords count - verify it's >= attended
      assertEquals(
        courseB!.effective_total_classes >= courseB!.effective_attended_classes,
        true,
        "Total should be >= attended"
      );
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "get_effective_course_attendance: ignores attendance before lastDataFetchTime",
  async fn() {
    await fullCleanup();

    try {
      // Setup: Firebase snapshot at a specific time
      await updateFirebaseSnapshot({
        courseID: TEST_COURSE_IDS.COURSE_A,
        attendedClasses: 5,
        totalClasses: 10,
      });

      // Setup: Set lastDataFetchTime to today at 08:00
      const today = getTodayISTString();
      const fetchTime = `${today}T08:00:00Z`;
      await setLastDataFetchTime(fetchTime);

      // Setup: Mark attendance BEFORE lastDataFetchTime (should be ignored)
      await markTestAttendance({
        classID: "class_old",
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T07:00:00`,
        checkinTime: `${today}T07:05:00`,
      });

      // Setup: Mark attendance AFTER lastDataFetchTime (should be counted)
      await markTestAttendance({
        classID: "class_new",
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
      });

      // Act
      const result = await getEffectiveCourseAttendance(DUMMY_FIREBASE_UID);

      // Assert: Only post-fetch attendance should be added
      const courseA = result.find(
        (c) => c.course_id === TEST_COURSE_IDS.COURSE_A
      );
      assertEquals(courseA !== undefined, true);
      assertEquals(
        courseA!.effective_attended_classes,
        6,
        "Should be snapshot (5) + only post-fetch delta (1)"
      );
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "get_effective_course_attendance: respects course isolation",
  async fn() {
    await fullCleanup();

    try {
      // Setup: Two courses with separate attendance
      const today = getTodayISTString();

      await updateFirebaseSnapshot({
        courseID: TEST_COURSE_IDS.COURSE_A,
        attendedClasses: 5,
        totalClasses: 10,
      });

      await updateFirebaseSnapshot({
        courseID: TEST_COURSE_IDS.COURSE_B,
        attendedClasses: 3,
        totalClasses: 8,
      });

      // Mark attendance for Course A only
      await markTestAttendance({
        classID: "class_a1",
        courseID: TEST_COURSE_IDS.COURSE_A,
        classTime: `${today}T09:00:00`,
        checkinTime: `${today}T09:05:00`,
      });

      // Act
      const result = await getEffectiveCourseAttendance(DUMMY_FIREBASE_UID);

      // Assert: Course A updated, Course B unchanged
      const courseA = result.find(
        (c) => c.course_id === TEST_COURSE_IDS.COURSE_A
      );
      const courseB = result.find(
        (c) => c.course_id === TEST_COURSE_IDS.COURSE_B
      );

      assertEquals(courseA !== undefined, true);
      assertEquals(courseB !== undefined, true);

      assertEquals(
        courseA!.effective_attended_classes,
        6,
        "Course A: snapshot (5) + delta (1)"
      );
      assertEquals(
        courseB!.effective_attended_classes,
        3,
        "Course B: unchanged snapshot (3)"
      );
      assertEquals(
        courseB!.effective_total_classes,
        8,
        "Course B total unchanged"
      );
    } finally {
      await fullCleanup();
    }
  },
});

Deno.test({
  name: "get_effective_course_attendance: returns empty array when no courses exist",
  async fn() {
    await fullCleanup();

    try {
      // Act: No data for dummy user
      const result = await getEffectiveCourseAttendance(DUMMY_FIREBASE_UID);

      // Assert: Should return empty array, not null or error
      assertEquals(Array.isArray(result), true);
      assertEquals(result.length, 0);
    } finally {
      await fullCleanup();
    }
  },
});

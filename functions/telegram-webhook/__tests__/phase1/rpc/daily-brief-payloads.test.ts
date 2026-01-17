// Phase 1: Daily brief cron idempotency tests
//
// Purpose: Validate that get_daily_brief_payloads RPC is retry-safe
// Critical: Cron retries must not send duplicate daily briefs to users
//
// Tests cover:
// - RPC-level idempotency (calling twice returns empty on second call)
// - daily_brief_log prevents duplicates
// - Multi-user isolation
// - Date isolation (different dates are independent)

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getDailyBriefPayloads } from "../../../db/dailyBrief.ts";
import { supabase } from "../../../db/client.ts";
import {
  DUMMY_FIREBASE_UID,
  TEST_TELEGRAM_CHAT_ID,
  TEST_COURSE_IDS,
  getTodayISTString,
  getYesterdayISTString,
} from "../../fixtures/test-data.ts";
import {
  cleanupDailyBriefLog,
  fullCleanup,
} from "../../setup/cleanup.ts";

// Helper: Create timetable entries for today
async function createTodayClasses(count: number): Promise<void> {
  const today = getTodayISTString();
  const classes = Array.from({ length: count }, (_, i) => ({
    userID: DUMMY_FIREBASE_UID,
    classID: `test_class_${i}`,
    courseID: TEST_COURSE_IDS.COURSE_A,
    courseName: "Test Course A",
    isLab: false,
    classStartTime: `${today}T${9 + i}:00:00`,
    classVenue: "Room 101",
    createdAt: new Date().toISOString(),
  }));

  const { error } = await supabase.from("timetableRecords").insert(classes);
  if (error) throw error;
}

// Helper: Ensure telegram_user_mappings exists for dummy user
async function ensureTelegramMapping(): Promise<void> {
  const { error } = await supabase.from("telegram_user_mappings").upsert({
    firebase_uid: DUMMY_FIREBASE_UID,
    telegram_chat_id: TEST_TELEGRAM_CHAT_ID,
  });

  if (error) throw error;
}

// Helper: Set user's daily brief preference
async function setDailyBriefPreference(enabled: boolean): Promise<void> {
  const { error } = await supabase.from("userProfile").upsert({
    firebaseUID: DUMMY_FIREBASE_UID,
    dailyBriefEnabled: enabled,
  });

  if (error) throw error;
}

// Helper: Cleanup timetable test data
async function cleanupTimetable(): Promise<void> {
  await supabase
    .from("timetableRecords")
    .delete()
    .eq("userID", DUMMY_FIREBASE_UID);
}

// Helper: Cleanup telegram mapping
async function cleanupTelegramMapping(): Promise<void> {
  await supabase
    .from("telegram_user_mappings")
    .delete()
    .eq("firebase_uid", DUMMY_FIREBASE_UID);
}

Deno.test({
  name: "daily_brief: idempotent - calling RPC twice returns empty on second call",
  async fn() {
    await fullCleanup();
    await cleanupTimetable();
    await cleanupTelegramMapping();

    try {
      const today = getTodayISTString();

      // Setup: Enable daily brief, create telegram mapping, create classes
      await setDailyBriefPreference(true);
      await ensureTelegramMapping();
      await createTodayClasses(3);

      // First call: Get daily brief payloads
      const payloads1 = await getDailyBriefPayloads(today);

      // Assert: Should return 1 payload for dummy user
      assertEquals(payloads1.length, 1, "Should return 1 payload on first call");
      assertEquals(payloads1[0].firebase_uid, DUMMY_FIREBASE_UID);
      assertEquals(payloads1[0].chat_id, TEST_TELEGRAM_CHAT_ID);
      assertEquals(payloads1[0].brief_date, today);

      // Verify: daily_brief_log now has an entry
      const { data: log1 } = await supabase
        .from("daily_brief_log")
        .select("*")
        .eq("firebase_uid", DUMMY_FIREBASE_UID)
        .eq("brief_date", today);

      assertEquals(log1?.length, 1, "Should have 1 log entry");

      // Second call: Same date (simulating cron retry)
      const payloads2 = await getDailyBriefPayloads(today);

      // Assert: Should return empty (already logged)
      assertEquals(
        payloads2.length,
        0,
        "Second call should return empty (already sent today)"
      );

      // Verify: Still only 1 log entry (no duplicates)
      const { data: log2 } = await supabase
        .from("daily_brief_log")
        .select("*")
        .eq("firebase_uid", DUMMY_FIREBASE_UID)
        .eq("brief_date", today);

      assertEquals(log2?.length, 1, "Should still have exactly 1 log entry");
    } finally {
      await cleanupTimetable();
      await cleanupTelegramMapping();
      await cleanupDailyBriefLog();
    }
  },
});

Deno.test({
  name: "daily_brief: date isolation - different dates return independent payloads",
  async fn() {
    await fullCleanup();
    await cleanupTimetable();
    await cleanupTelegramMapping();

    try {
      const today = getTodayISTString();
      const yesterday = getYesterdayISTString();

      await setDailyBriefPreference(true);
      await ensureTelegramMapping();
      await createTodayClasses(2);

      // Call for yesterday (will insert log for yesterday)
      await getDailyBriefPayloads(yesterday);

      // Verify: Log exists for yesterday
      const { data: yesterdayLog } = await supabase
        .from("daily_brief_log")
        .select("*")
        .eq("firebase_uid", DUMMY_FIREBASE_UID)
        .eq("brief_date", yesterday);

      assertEquals(yesterdayLog?.length, 1);

      // Call for today (should return payload, different date)
      const todayPayloads = await getDailyBriefPayloads(today);

      // Assert: Should return payload for today (independent from yesterday)
      assertEquals(
        todayPayloads.length,
        1,
        "Different date should return payload despite yesterday's log"
      );
      assertEquals(todayPayloads[0].brief_date, today);

      // Verify: Now have 2 separate log entries (yesterday + today)
      const { data: allLogs } = await supabase
        .from("daily_brief_log")
        .select("brief_date")
        .eq("firebase_uid", DUMMY_FIREBASE_UID);

      assertEquals(allLogs?.length, 2, "Should have 2 independent log entries");
    } finally {
      await cleanupTimetable();
      await cleanupTelegramMapping();
      await cleanupDailyBriefLog();
    }
  },
});

Deno.test({
  name: "daily_brief: multi-user isolation - only returns users without logs for today",
  async fn() {
    await fullCleanup();
    await cleanupTimetable();
    await cleanupTelegramMapping();

    try {
      const today = getTodayISTString();

      // Setup: Two users with daily brief enabled
      const otherFirebaseUID = "other_user_test_uid";
      const otherChatID = 888888888;

      // Setup dummy user
      await setDailyBriefPreference(true);
      await ensureTelegramMapping();
      await createTodayClasses(2);

      // Setup other user
      await supabase.from("userProfile").upsert({
        firebaseUID: otherFirebaseUID,
        dailyBriefEnabled: true,
      });
      await supabase.from("telegram_user_mappings").upsert({
        firebase_uid: otherFirebaseUID,
        telegram_chat_id: otherChatID,
      });
      // Create timetable for other user
      await supabase.from("timetableRecords").insert({
        userID: otherFirebaseUID,
        classID: "other_class_1",
        courseID: TEST_COURSE_IDS.COURSE_A,
        courseName: "Test Course",
        isLab: false,
        classStartTime: `${today}T09:00:00`,
        classVenue: "Room 101",
        createdAt: new Date().toISOString(),
      });

      // First call: Should return both users
      const payloads1 = await getDailyBriefPayloads(today);
      assertEquals(
        payloads1.length,
        2,
        "Should return 2 payloads (both users not yet sent)"
      );

      // Verify both UIDs present
      const uids = payloads1.map((p) => p.firebase_uid).sort();
      assertEquals(uids.includes(DUMMY_FIREBASE_UID), true);
      assertEquals(uids.includes(otherFirebaseUID), true);

      // Second call: Should return empty (both logged now)
      const payloads2 = await getDailyBriefPayloads(today);
      assertEquals(payloads2.length, 0, "Second call should return empty for both users");

      // Cleanup other user
      await supabase
        .from("telegram_user_mappings")
        .delete()
        .eq("firebase_uid", otherFirebaseUID);
      await supabase.from("userProfile").delete().eq("firebaseUID", otherFirebaseUID);
      await supabase.from("timetableRecords").delete().eq("userID", otherFirebaseUID);
      await supabase
        .from("daily_brief_log")
        .delete()
        .eq("firebase_uid", otherFirebaseUID);
    } finally {
      await cleanupTimetable();
      await cleanupTelegramMapping();
      await cleanupDailyBriefLog();
    }
  },
});

Deno.test({
  name: "daily_brief: respects user preference - doesn't return disabled users",
  async fn() {
    await fullCleanup();
    await cleanupTimetable();
    await cleanupTelegramMapping();

    try {
      const today = getTodayISTString();

      // Setup: Disable daily brief for dummy user
      await setDailyBriefPreference(false);
      await ensureTelegramMapping();
      await createTodayClasses(3);

      // Call RPC
      const payloads = await getDailyBriefPayloads(today);

      // Assert: Should return empty (user has it disabled)
      assertEquals(payloads.length, 0, "Should not return users with dailyBriefEnabled=false");

      // Verify: No log entry created (user wasn't eligible)
      const { data: logs } = await supabase
        .from("daily_brief_log")
        .select("*")
        .eq("firebase_uid", DUMMY_FIREBASE_UID)
        .eq("brief_date", today);

      assertEquals(logs?.length, 0, "Should not create log for disabled users");
    } finally {
      await cleanupTimetable();
      await cleanupTelegramMapping();
      await cleanupDailyBriefLog();
    }
  },
});

Deno.test({
  name: "daily_brief: payload structure contains required fields",
  async fn() {
    await fullCleanup();
    await cleanupTimetable();
    await cleanupTelegramMapping();

    try {
      const today = getTodayISTString();

      await setDailyBriefPreference(true);
      await ensureTelegramMapping();
      await createTodayClasses(2);

      const payloads = await getDailyBriefPayloads(today);

      assertEquals(payloads.length, 1);

      const payload = payloads[0];

      // Assert: Required fields exist
      assertEquals(typeof payload.chat_id, "number");
      assertEquals(typeof payload.firebase_uid, "string");
      assertEquals(Array.isArray(payload.classes), true);
      assertEquals(typeof payload.brief_date, "string");
      // attendance fields may be null if no attendance data exists
      assertEquals(
        typeof payload.attendance_percentage === "number" ||
          payload.attendance_percentage === null,
        true
      );

      // Assert: Classes array has expected structure
      assertEquals(payload.classes.length, 2, "Should have 2 classes");
      const firstClass = payload.classes[0];
      assertEquals(typeof firstClass.courseName === "string" || firstClass.courseName === null, true);
      assertEquals(typeof firstClass.classStartTime === "string" || firstClass.classStartTime === null, true);
      assertEquals(typeof firstClass.classVenue === "string" || firstClass.classVenue === null, true);
    } finally {
      await cleanupTimetable();
      await cleanupTelegramMapping();
      await cleanupDailyBriefLog();
    }
  },
});

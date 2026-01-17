import { supabase } from "./client.ts";

export interface DiagnosticData {
  lastReminderRun: string | null;
  lastDailyBriefRun: string | null;
  remindersEnabled: boolean | null;
  dailyBriefEnabled: boolean | null;
  courseCount: number | null;
  hybridAttendanceSuccess: boolean;
}

/**
 * Fetch the last reminder sent timestamp for any user (system-wide).
 */
async function getLastReminderRun(): Promise<string | null> {
  const { data, error } = await supabase
    .from("class_notification_log")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.sent_at;
}

/**
 * Fetch the last daily brief sent timestamp for any user (system-wide).
 */
async function getLastDailyBriefRun(): Promise<string | null> {
  const { data, error } = await supabase
    .from("daily_brief_log")
    .select("sent_at")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.sent_at;
}

/**
 * Fetch user settings (reminders, daily brief).
 */
async function getUserSettings(
  firebaseUid: string
): Promise<{
  remindersEnabled: boolean | null;
  dailyBriefEnabled: boolean | null;
}> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("reminders_enabled, daily_brief_enabled")
    .eq("firebase_uid", firebaseUid)
    .single();

  if (error || !data) {
    return { remindersEnabled: null, dailyBriefEnabled: null };
  }

  return {
    remindersEnabled: data.reminders_enabled,
    dailyBriefEnabled: data.daily_brief_enabled,
  };
}

/**
 * Fetch effective course attendance count via RPC to test hybrid attendance system.
 */
async function getEffectiveCourseCount(firebaseUid: string): Promise<{
  count: number | null;
  success: boolean;
}> {
  try {
    const { data, error } = await supabase.rpc(
      "get_effective_course_attendance",
      {
        p_user_id: firebaseUid,
      }
    );

    if (error || !data) {
      return { count: null, success: false };
    }

    return { count: Array.isArray(data) ? data.length : null, success: true };
  } catch {
    return { count: null, success: false };
  }
}

/**
 * Gather all diagnostic data for an admin user.
 * Partial failures are tolerated - unavailable fields are marked as null.
 */
export async function getDiagnosticData(
  firebaseUid: string
): Promise<DiagnosticData> {
  // Fetch data in parallel where possible
  const [lastReminderRun, lastDailyBriefRun, userSettings, courseData] =
    await Promise.allSettled([
      getLastReminderRun(),
      getLastDailyBriefRun(),
      getUserSettings(firebaseUid),
      getEffectiveCourseCount(firebaseUid),
    ]);

  return {
    lastReminderRun:
      lastReminderRun.status === "fulfilled" ? lastReminderRun.value : null,
    lastDailyBriefRun:
      lastDailyBriefRun.status === "fulfilled" ? lastDailyBriefRun.value : null,
    remindersEnabled:
      userSettings.status === "fulfilled"
        ? userSettings.value.remindersEnabled
        : null,
    dailyBriefEnabled:
      userSettings.status === "fulfilled"
        ? userSettings.value.dailyBriefEnabled
        : null,
    courseCount:
      courseData.status === "fulfilled" ? courseData.value.count : null,
    hybridAttendanceSuccess:
      courseData.status === "fulfilled" ? courseData.value.success : false,
  };
}

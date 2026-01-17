// Test environment configuration and dummy data
//
// This module defines the test fixture data that is safe to mutate during tests.
// The dummy Firebase UID must exist in the database but should not be used in production.

/**
 * Dummy Firebase UID that is safe to mutate for tests.
 * This UID should exist in firebase_data and telegram_user_mappings tables.
 *
 * IMPORTANT: This must be a real UID in your test database.
 * You may need to update this value based on your test environment.
 */
export const DUMMY_FIREBASE_UID = "ZeFmnn5uzFdVMp77llyXDRuLCXM2";

/**
 * Test Telegram chat ID mapped to the dummy UID.
 */
export const TEST_TELEGRAM_CHAT_ID = 999999999;

/**
 * Test course IDs that should exist in the dummy user's enrollment.
 * These are used for attendance tests.
 */
export const TEST_COURSE_IDS = {
  COURSE_A: "MA2013EICB1",
  COURSE_B: "IE2001EEIC1",
};

/**
 * Test class IDs for creating timetable entries.
 * These can be safely created and deleted during tests.
 */
export const TEST_CLASS_IDS = {
  CLASS_1: "09/00/07/01/2026-ME02-IE2001EEIC1",
  CLASS_2: "09/00/08/01/2026-ME02-ME2311EPCD1",
  CLASS_3: "09/00/12/01/2026-ME02-ME2111EPCA1",
  CLASS_4: "09/00/13/01/2026-ME02-MA2013EICB1",
  CLASS_5: "09/00/14/01/2026-ME02-IE2001EEIC1",
};

/**
 * IST timezone identifier
 */
export const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Get current date in IST as YYYY-MM-DD string
 */
export function getTodayISTString(): string {
  const now = new Date();
  const istTime = new Date(
    now.toLocaleString("en-US", { timeZone: IST_TIMEZONE })
  );
  const year = istTime.getFullYear();
  const month = String(istTime.getMonth() + 1).padStart(2, "0");
  const day = String(istTime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get yesterday's date in IST as YYYY-MM-DD string
 */
export function getYesterdayISTString(): string {
  const now = new Date();
  const istTime = new Date(
    now.toLocaleString("en-US", { timeZone: IST_TIMEZONE })
  );
  istTime.setDate(istTime.getDate() - 1);
  const year = istTime.getFullYear();
  const month = String(istTime.getMonth() + 1).padStart(2, "0");
  const day = String(istTime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

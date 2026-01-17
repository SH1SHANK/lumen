import { getDiagnosticData, type DiagnosticData } from "../db/adminDebug.ts";

/**
 * Format diagnostic data for display in /debug command.
 */
function formatDiagnosticData(data: DiagnosticData): string {
  const lines: string[] = [];

  lines.push("🔧 *System Diagnostics*\n");

  // Cron jobs
  lines.push("*Cron Jobs:*");
  lines.push(
    `• Reminders: ${
      data.lastReminderRun
        ? new Date(data.lastReminderRun).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "Never run"
    }`
  );
  lines.push(
    `• Daily Brief: ${
      data.lastDailyBriefRun
        ? new Date(data.lastDailyBriefRun).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })
        : "Never run"
    }\n`
  );

  // User settings
  lines.push("*Your Settings:*");
  lines.push(
    `• Reminders: ${
      data.remindersEnabled === null
        ? "Unknown"
        : data.remindersEnabled
        ? "Enabled"
        : "Disabled"
    }`
  );
  lines.push(
    `• Daily Brief: ${
      data.dailyBriefEnabled === null
        ? "Unknown"
        : data.dailyBriefEnabled
        ? "Enabled"
        : "Disabled"
    }\n`
  );

  // Attendance system
  lines.push("*Attendance System:*");
  lines.push(
    `• Hybrid RPC: ${data.hybridAttendanceSuccess ? "✅ Working" : "❌ Failed"}`
  );
  lines.push(
    `• Courses Resolved: ${
      data.courseCount !== null ? data.courseCount : "N/A"
    }`
  );

  return lines.join("\n");
}

/**
 * Build diagnostic message for admin users.
 */
export async function buildDiagnosticMessage(
  firebaseUid: string
): Promise<string> {
  const data = await getDiagnosticData(firebaseUid);
  return formatDiagnosticData(data);
}

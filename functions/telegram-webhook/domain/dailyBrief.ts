import type { DailyBriefPayload } from "../db/dailyBrief.ts";
import { getUserCourseAttendance } from "./userCourses.ts";
import { getUserGreeting } from "./userProfile.ts";
import { TIMEZONE } from "../utils/date.ts";

export interface DailyBriefMessage {
  chatId: number;
  firebaseUid: string;
  text: string;
}

const MOTIVATION_LINE = "Keep it up.";

function formatTime(value: string | null): string {
  if (!value) return "TBD";
  const date = new Date(value);
  return date.toLocaleTimeString("en-IN", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatClasses(classes: DailyBriefPayload["classes"]): string[] {
  if (!classes.length) {
    return ["No classes today."];
  }

  const lines = ["Today's classes:"];
  for (const cls of classes) {
    const time = formatTime(cls.classStartTime);
    const venue = cls.classVenue ? ` • ${cls.classVenue}` : "";
    const name = cls.courseName ?? "Class";
    lines.push(`- ${name} @ ${time}${venue}`);
  }

  return lines;
}

export async function buildDailyBriefMessages(
  payloads: DailyBriefPayload[]
): Promise<DailyBriefMessage[]> {
  const messages: DailyBriefMessage[] = [];

  for (const payload of payloads) {
    try {
      // Get personalized greeting
      const greeting = await getUserGreeting(payload.firebase_uid);
      const greetingLine = greeting
        ? `Good morning, ${greeting}.`
        : `Good morning. Here's your brief for ${payload.brief_date}.`;

      const classesLines = formatClasses(payload.classes);

      // Get effective course attendance (authoritative)
      // Failures are logged but do not stop the job
      let attendanceLines: string[] = [];

      try {
        const courses = await getUserCourseAttendance(payload.firebase_uid);
        if (courses.length > 0) {
          attendanceLines.push("", "Your attendance:");
          for (const course of courses) {
            const labTag = course.isLab ? " 🧪" : "";
            attendanceLines.push(
              `${course.courseName}${labTag}: ${course.attended}/${course.total} (${course.percentage}%)`
            );
          }
        }
      } catch (error) {
        console.error(
          `[dailyBrief] Failed to fetch attendance for ${payload.firebase_uid}:`,
          error
        );
        // Send brief without attendance section on failure
        attendanceLines = ["", "Attendance data unavailable right now."];
      }

      const text = [
        greetingLine,
        "",
        ...classesLines,
        ...attendanceLines,
        "",
        MOTIVATION_LINE,
        "",
        "_Updates in real-time as you mark attendance._",
      ].join("\n");

      messages.push({
        chatId: payload.chat_id,
        firebaseUid: payload.firebase_uid,
        text,
      });
    } catch (error) {
      console.error(
        `[dailyBrief] Failed to build message for ${payload.firebase_uid}:`,
        error
      );
    }
  }

  return messages;
}

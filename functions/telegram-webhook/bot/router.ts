import { InlineKeyboard } from "https://esm.sh/grammy@1.34.0";
import { bot } from "./bot.ts";
import { supabase } from "../db/client.ts";
import { withTyping } from "../utils/telegram.ts";
import {
  getTodayIST,
  getTomorrowIST,
  TIMEZONE,
  getNowIST,
} from "../utils/date.ts";
import { registerStartCommand } from "../commands/start.ts";
import { registerHelpCommand } from "../commands/help.ts";
import { registerDebugCommand } from "../commands/debug.ts";
import { registerResetCommand } from "../commands/reset.ts";
import { registerUndoCommand } from "../commands/undo.ts";
import { getTodaySchedule, getTomorrowSchedule } from "../domain/schedule.ts";
import { getUserCourseAttendance } from "../domain/userCourses.ts";
import {
  markAttendanceByIndices,
  markAttendanceForAll,
  markAttendanceForClass,
  markAbsenceByIndices,
  markAbsenceForAll,
  markAbsenceForClass,
} from "../domain/attendance.ts";
import {
  ATTENDANCE_ACTIONS,
  buildAttendanceKeyboard,
} from "../utils/keyboards.ts";
import {
  handleAttendanceSelect,
  handleAttendanceConfirm,
  handleAttendanceAll,
} from "../callbacks/attendance.ts";

// Helper: Get user's Firebase UID
async function getUserUid(chatId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_user_mappings")
    .select("firebase_uid")
    .eq("chat_id", chatId)
    .single();

  if (error || !data) return null;
  return data.firebase_uid;
}

// Helper: Get user's enrolled courses and batch
async function getUserEnrollment(userID: string) {
  const { data, error } = await supabase
    .from("userCourseRecords")
    .select("enrolledCourses, batchID")
    .eq("userID", userID)
    .single();

  if (error || !data) return null;
  return {
    courseIDs: data.enrolledCourses || [],
    batchID: data.batchID,
  };
}

// Helper: Get today's classes for user
async function getTodaysClasses(userID: string) {
  const enrollment = await getUserEnrollment(userID);
  if (!enrollment || !enrollment.courseIDs.length) {
    return [];
  }

  const today = getTodayIST();

  const { data: classes, error } = await supabase
    .from("timetableRecords")
    .select("*")
    .eq("classDate", today)
    .eq("batchID", enrollment.batchID)
    .in("courseID", enrollment.courseIDs)
    .order("classStartTime");

  if (error) {
    console.error("Error fetching classes:", error);
    return [];
  }

  return classes || [];
}

// Helper: Find current or upcoming class (within 10 minutes)
function findNextClass(classes: any[]): any | null {
  if (classes.length === 0) return null;

  const now = getNowIST();
  const nowMs = now.getTime();
  const tenMinutesMs = 10 * 60 * 1000;

  for (const cls of classes) {
    const startTime = new Date(cls.classStartTime);
    const endTime = new Date(cls.classEndTime);
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    // Class is ongoing
    if (nowMs >= startMs && nowMs <= endMs) {
      return cls;
    }

    // Class starts within 10 minutes
    if (startMs > nowMs && startMs - nowMs <= tenMinutesMs) {
      return cls;
    }
  }

  return null;
}

// Register all routes
export function registerRoutes() {
  // Register Attendance Callbacks
  const selectRegex = new RegExp(`^${ATTENDANCE_ACTIONS.SELECT}:`);
  bot.callbackQuery(selectRegex, handleAttendanceSelect);

  const confirmRegex = new RegExp(`^${ATTENDANCE_ACTIONS.CONFIRM}:`);
  bot.callbackQuery(confirmRegex, handleAttendanceConfirm);

  const allActionsRegex = new RegExp(
    `^(${ATTENDANCE_ACTIONS.ATTEND_ALL}|${ATTENDANCE_ACTIONS.ABSENT_ALL}):`
  );
  bot.callbackQuery(allActionsRegex, handleAttendanceAll);

  // Register basic commands
  registerStartCommand();
  registerHelpCommand();
  registerDebugCommand();
  registerResetCommand();
  registerUndoCommand();

  // Command: /attend [numbers] (alias: /a)
  bot.command(["attend", "a"], async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        const args = ctx.message?.text?.split(" ").slice(1);

        const classes = await getTodaysClasses(uid);

        if (classes.length === 0) {
          return ctx.reply("No classes scheduled for today.");
        }

        // Smart default: single-class auto-attend
        if (!args || args.length === 0) {
          if (classes.length === 1) {
            const result = await markAttendanceForClass(uid, classes[0]);
            if (result === "marked") {
              return ctx.reply(
                `Marked present.

${classes[0].courseName}

_Use /undo to revert if needed._`
              );
            } else if (result === "already") {
              return ctx.reply(
                `Already marked present for ${classes[0].courseName}.`
              );
            } else {
              return ctx.reply(
                `Something didn't go through. Try again in a moment.`
              );
            }
          }
        }

        // If numbers are provided, mark those classes
        if (args && args.length > 0) {
          const indices = args
            .flatMap((arg) => arg.split(/[,\s]+/))
            .map((n) => parseInt(n.trim()))
            .filter((n) => !isNaN(n) && n >= 1 && n <= classes.length);

          if (indices.length === 0) {
            return ctx.reply(
              "I couldn't find those class numbers. Use /today to see your schedule."
            );
          }

          // Attendance writes are delegated to RPCs for bounded execution
          const results = await markAttendanceByIndices(uid, classes, indices);
          let markedCount = 0;
          let alreadyMarked = 0;
          const messages: string[] = [];

          for (const result of results) {
            if (result.status === "already") {
              alreadyMarked++;
              messages.push(
                `${result.index}. ${result.courseName} - Already marked ✓`
              );
            } else if (result.status === "marked") {
              markedCount++;
              messages.push(
                `${result.index}. ${result.courseName} - Marked ✅`
              );
            } else {
              messages.push(
                `${result.index}. ${result.courseName} - Failed ❌`
              );
            }
          }

          // Compact summary
          let summary = `Marked ${markedCount} class${
            markedCount > 1 ? "es" : ""
          } present`;
          if (alreadyMarked > 0) {
            summary += ` (${alreadyMarked} already marked)`;
          }

          const hasFailures = results.some((r) => r.status === "failed");
          if (hasFailures) {
            summary += "\n\n" + messages.join("\n");
          }

          summary += "\n\n_Use /undo to revert if needed._";

          await ctx.reply(summary, { parse_mode: "Markdown" });
          return;
        }

        // No arguments - show buttons
        const dateStr = getTodayIST();

        // Smart default: if a class is ongoing or starting soon, pre-select it
        const nextClass = findNextClass(classes);
        let initialMask = 0;
        let messageText = `*Select classes to mark present:*
Tap to select, then confirm. Or: /attend 1 2`;

        if (nextClass && classes.length > 1) {
          // Find index of next class (1-based)
          const nextClassIndex = classes.findIndex(
            (c) => c.classID === nextClass.classID
          );
          if (nextClassIndex !== -1) {
            initialMask = 1 << nextClassIndex; // Pre-select the next class
            messageText = `*Current/Upcoming Class Pre-selected*

${nextClass.courseName} is starting soon.

Tap to adjust selection, then confirm.`;
          }
        }

        const keyboard = buildAttendanceKeyboard(classes, dateStr, initialMask);

        await ctx.reply(messageText, {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error("Error in /attend:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Command: /absent [numbers] (alias: /ab)
  bot.command(["absent", "ab"], async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        const args = ctx.message?.text?.split(" ").slice(1);

        const classes = await getTodaysClasses(uid);

        if (classes.length === 0) {
          return ctx.reply("📭 You have no classes scheduled for today.");
        }

        // Smart default: single-class auto-absent
        if (!args || args.length === 0) {
          if (classes.length === 1) {
            await markAbsenceForClass(uid, classes[0].classID);
            return ctx.reply(
              `Marked absent.

${classes[0].courseName}

_Use /undo to revert if needed._`
            );
          }
        }

        // If numbers are provided
        if (args && args.length > 0) {
          const indices = args
            .flatMap((arg) => arg.split(/[,\s]+/))
            .map((n) => parseInt(n.trim()))
            .filter((n) => !isNaN(n) && n >= 1 && n <= classes.length);

          if (indices.length === 0) {
            return ctx.reply(
              "I couldn't find those class numbers. Use /today to see your schedule."
            );
          }

          // Attendance deletes are delegated to RPCs for bounded execution
          const results = await markAbsenceByIndices(uid, classes, indices);

          await ctx.reply(
            `Marked ${results.length} class${
              results.length > 1 ? "es" : ""
            } absent.

_Use /undo to revert if needed._`
          );
          return;
        }

        // No arguments - show buttons
        const dateStr = getTodayIST();
        const keyboard = buildAttendanceKeyboard(classes, dateStr, 0);

        await ctx.reply(
          `*Select classes to mark absent:*
Tap to select, then confirm. Or: /absent 1 2`,
          {
            reply_markup: keyboard,
            parse_mode: "Markdown",
          }
        );
      } catch (error) {
        console.error("Error in /absent:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Handle callback queries for attend/absent buttons
  bot.on("callback_query:data", async (ctx) => {
    try {
      const data = ctx.callbackQuery.data;
      const [action, classID] = data.split(":");

      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.answerCallbackQuery({
          text: "This action has expired.",
          show_alert: true,
        });
        return;
      }

      const uid = await getUserUid(chatId);
      if (!uid) {
        return ctx.answerCallbackQuery({
          text: "Please connect your account using /start",
          show_alert: true,
        });
      }

      // Get class details (read-only)
      const { data: classData } = await supabase
        .from("timetableRecords")
        .select("*")
        .eq("classID", classID)
        .single();

      if (!classData) {
        return ctx.answerCallbackQuery({
          text: "This class is no longer available.",
          show_alert: true,
        });
      }

      if (action === "attend") {
        // Attendance write delegated to RPC (bounded work)
        const status = await markAttendanceForClass(uid, classData);

        if (status === "already") {
          return ctx.answerCallbackQuery({
            text: `Already marked present for ${classData.courseName}`,
          });
        }

        if (status === "marked") {
          await ctx.answerCallbackQuery({
            text: `Marked present for ${classData.courseName}`,
          });
        } else {
          await ctx.answerCallbackQuery({
            text: "Something didn't go through. Try again in a moment.",
            show_alert: true,
          });
        }
      } else if (action === "absent") {
        // Attendance delete delegated to RPC (bounded work)
        await markAbsenceForClass(uid, classID);
        await ctx.answerCallbackQuery({
          text: `Marked absent for ${classData.courseName}`,
        });
      } else {
        await ctx.answerCallbackQuery({
          text: "Unknown action.",
          show_alert: true,
        });
      }
    } catch (error) {
      console.error("Error in callback query:", error);
      await ctx.answerCallbackQuery({
        text: "Something didn't go through. Try again in a moment.",
        show_alert: true,
      });
    }
  });

  // Command: /attend_all (alias: /aa)
  bot.command(["attend_all", "aa"], async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        const classes = await getTodaysClasses(uid);

        if (classes.length === 0) {
          return ctx.reply("📭 You have no classes scheduled for today.");
        }

        // Attendance writes are delegated to RPCs for bounded execution
        const results = await markAttendanceForAll(uid, classes);
        let markedCount = 0;
        let alreadyMarked = 0;

        for (const result of results) {
          if (result.status === "already") {
            alreadyMarked++;
          } else if (result.status === "marked") {
            markedCount++;
          }
        }

        await ctx.reply(
          `Marked ${markedCount} class${markedCount > 1 ? "es" : ""} present` +
            (alreadyMarked > 0 ? ` (${alreadyMarked} already marked)` : "") +
            `.\n\n_Use /undo to revert if needed._`
        );
      } catch (error) {
        console.error("Error in /attend_all:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Command: /absent_all
  bot.command("absent_all", async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        const classes = await getTodaysClasses(uid);

        if (classes.length === 0) {
          return ctx.reply("📭 You have no classes scheduled for today.");
        }

        // Attendance deletes are delegated to RPCs for bounded execution
        await markAbsenceForAll(uid, classes);
        await ctx.reply(
          `Marked all ${classes.length} class${
            classes.length > 1 ? "es" : ""
          } absent.

_Use /undo to revert if needed._`
        );
      } catch (error) {
        console.error("Error in /absent_all:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Command: /today
  bot.command("today", async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        // Schedule read path delegates attendance status to RPCs
        const classes = await getTodaySchedule(uid);

        if (classes.length === 0) {
          return ctx.reply("📭 You have no classes scheduled for today.");
        }

        const today = getTodayIST();
        let schedule = `*Today's Schedule (${today})*

`;

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i];
          const startTime = new Date(cls.classStartTime).toLocaleTimeString(
            "en-IN",
            {
              timeZone: TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
            }
          );
          const endTime = new Date(cls.classEndTime).toLocaleTimeString(
            "en-IN",
            {
              timeZone: TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
            }
          );

          const status = cls.isMarked ? "✅" : "⏸️";

          schedule += `${i + 1}. *${cls.courseName}* ${status}\n`;
          schedule += `   ⏰ ${startTime} - ${endTime}\n`;
          if (cls.classVenue) schedule += `   📍 ${cls.classVenue}\n`;
          schedule += `\n`;
        }

        await ctx.reply(schedule, { parse_mode: "Markdown" });
      } catch (error) {
        console.error("Error in /today:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Command: /tomorrow
  bot.command("tomorrow", async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;
        const classes = await getTomorrowSchedule(uid);

        if (classes.length === 0) {
          return ctx.reply("No classes scheduled for tomorrow.");
        }

        const tomorrow = getTomorrowIST();

        let schedule = `*Tomorrow's Schedule (${tomorrow})*

`;

        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i];
          const startTime = new Date(cls.classStartTime).toLocaleTimeString(
            "en-IN",
            {
              timeZone: TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
            }
          );
          const endTime = new Date(cls.classEndTime).toLocaleTimeString(
            "en-IN",
            {
              timeZone: TIMEZONE,
              hour: "2-digit",
              minute: "2-digit",
            }
          );

          schedule += `${i + 1}. *${cls.courseName}*\n`;
          schedule += `   ⏰ ${startTime} - ${endTime}\n`;
          if (cls.classVenue) schedule += `   📍 ${cls.classVenue}\n`;
          schedule += `\n`;
        }

        await ctx.reply(schedule, { parse_mode: "Markdown" });
      } catch (error) {
        console.error("Error in /tomorrow:", error);
        ctx.reply("Something didn't go through. Try again in a moment.");
      }
    });
  });

  // Command: /status (alias: /s)
  bot.command(["status", "s"], async (ctx) => {
    await withTyping(ctx, async () => {
      try {
        const uid = ctx.state.firebaseUid;

        const courses = await getUserCourseAttendance(uid);
        if (!courses || courses.length === 0) {
          return ctx.reply("❌ No courses found.");
        }

        const { getUserGreeting } = await import("../domain/userProfile.ts");
        const greeting = await getUserGreeting(uid);
        const header = greeting
          ? `*Your Attendance, ${greeting}*\n\n`
          : `*Your Attendance*\n\n`;

        let statusText = header;

        for (const course of courses) {
          const labTag = course.isLab ? " 🧪" : "";
          statusText += `${course.courseName}${labTag}
`;
          statusText += `  ${course.attended} / ${course.total} (${course.percentage}%)

`;
        }

        statusText += "\n_Updated in real-time as you mark attendance._";

        await ctx.reply(statusText.trim(), { parse_mode: "Markdown" });
      } catch (error) {
        console.error(
          `[/status] Failed for uid ${ctx.state.firebaseUid}:`,
          error
        );
        ctx.reply(
          "Couldn't load your attendance data right now. Try again in a moment."
        );
      }
    });
  });

  // Command: /remind_me
  bot.command("remind_me", async (ctx) => {
    try {
      const uid = ctx.state.firebaseUid;

      const { data: settings } = await supabase
        .from("user_settings")
        .select("reminders_enabled")
        .eq("firebase_uid", uid)
        .single();

      const currentState = settings?.reminders_enabled ?? false;
      const newState = !currentState;

      await supabase.from("user_settings").upsert({
        firebase_uid: uid,
        reminders_enabled: newState,
      });

      await ctx.reply(
        newState
          ? "Class reminders enabled. You'll be notified 10 minutes before each class."
          : "Class reminders disabled."
      );
    } catch (error) {
      console.error("Error in /remind_me:", error);
      ctx.reply("Something didn't go through. Try again in a moment.");
    }
  });

  // Command: /daily_brief
  bot.command("daily_brief", async (ctx) => {
    try {
      const uid = ctx.state.firebaseUid;

      const { data: settings } = await supabase
        .from("user_settings")
        .select("daily_brief_enabled")
        .eq("firebase_uid", uid)
        .single();

      const currentState = settings?.daily_brief_enabled ?? false;
      const newState = !currentState;

      await supabase.from("user_settings").upsert({
        firebase_uid: uid,
        daily_brief_enabled: newState,
      });

      await ctx.reply(
        newState
          ? "Daily brief enabled. You'll receive a morning summary at 8:00 AM."
          : "Daily brief disabled."
      );
    } catch (error) {
      console.error("Error in /daily_brief:", error);
      ctx.reply("Something didn't go through. Try again in a moment.");
    }
  });

  // Error handling
  bot.catch((err) => {
    console.error("Bot error:", err);
  });
}

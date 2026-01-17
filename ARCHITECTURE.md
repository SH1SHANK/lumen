# Telegram Bot Architecture (Supabase Edge Function)

This repository implements a Telegram bot using a single Supabase Edge Function written for the Deno runtime with grammY. The system is structured into layers that separate Telegram routing, domain orchestration, and database access via RPCs.

## Request Flow

### Webhook (Telegram Update)

```
Telegram Update
  → Edge Function HTTP entrypoint (functions/telegram-webhook/index.ts)
    → bot/bot.ts (grammY instance)
    → bot/middleware.ts (auth + ctx.state.firebaseUid)
    → bot/router.ts (commands + callbacks)
      → callbacks/* (inline keyboard flows)
      → commands/* (start/help)
      → domain/* (attendance/schedule/stats/reminders)
      → db/* (RPCs + direct queries)
      → Postgres
    → Telegram response
```

### Job Execution (Cron Trigger)

```
Cron HTTP Request (x-execution-mode: job)
  → functions/telegram-webhook/index.ts
    → jobs/reminders.ts | jobs/dailyBrief.ts
      → db/dailyBrief.ts → get_daily_brief_payloads RPC
      → Telegram Bot API (sendMessage)
```

## Folder Responsibilities

### functions/telegram-webhook/

This is the Edge Function root. Only one HTTP entrypoint exists.

- bot/ – grammY bot instance, middleware, and route registration.
- commands/ – command handlers that register with the bot.
- callbacks/ – callback handlers for inline keyboard actions.
- domain/ – business orchestration; uses db layer only.
- db/ – Supabase RPC wrappers and direct table queries.
- jobs/ – cron-triggered execution logic (currently stubs).
- utils/ – environment access, date helpers, keyboards, and Telegram UX helpers.

## Architecture Invariants (As Implemented)

- Single HTTP entrypoint at functions/telegram-webhook/index.ts.
- Webhook routing happens through grammY `bot` with middleware and router registration.
- Domain modules do not import grammY or bot instances.
- Postgres-heavy attendance operations are executed via RPCs.
- Job execution is routed via `x-execution-mode: job` and does not touch the bot routing path.

### Known Exceptions in Current Implementation

These are deviations observed in the current code and should be resolved in future refactors:

- bot/middleware.ts calls Supabase directly to resolve Telegram chat IDs to Firebase UIDs.
- commands/start.ts calls Supabase directly to resolve the user mapping.
- bot/router.ts performs direct Supabase queries for:
  - user enrollment and today’s classes (`userCourseRecords`, `timetableRecords`)
  - class lookup in callback handlers (`timetableRecords`)
  - settings toggles for `/remind_me` and `/daily_brief` (`user_settings`)

## File-Level Documentation

### functions/telegram-webhook/index.ts

This is the single HTTP entrypoint. It validates environment via utils/env.ts side effects, wires middleware and routes, and starts the webhook server. It also routes job execution via `x-execution-mode: job` and dynamic imports. It contains no business or database logic.

### functions/telegram-webhook/bot/bot.ts

Creates and exports the grammY `bot` instance using the Telegram token. It does not register middleware or handlers.

### functions/telegram-webhook/bot/middleware.ts

Defines authentication middleware. It resolves Telegram chat IDs to Firebase UIDs and sets `ctx.state.firebaseUid`. It skips `/start` and `/help`, and does not run for callback queries. It uses a direct Supabase query for the mapping.

### functions/telegram-webhook/bot/router.ts

Registers all commands and callback handlers. It formats responses and invokes domain functions. It also contains direct Supabase queries for enrollment, schedule reads, class lookup in callbacks, and user settings toggles. It uses `withTyping()` for UX.

### functions/telegram-webhook/commands/start.ts

Registers the `/start` command. It checks whether the user is already linked and returns a link button when needed. It directly queries `telegram_user_mappings` via Supabase.

### functions/telegram-webhook/commands/help.ts

Registers the `/help` command and returns the static help text. No database access.

### functions/telegram-webhook/commands/debug.ts

Registers the `/debug` command for admin-only diagnostics. Access control is based on `firebase_data.attrs.fields.isAdmin.booleanValue`. The command displays read-only system diagnostics including cron job status, user settings, and hybrid attendance RPC health. Non-admin users receive a neutral denial message.

### functions/telegram-webhook/commands/reset.ts

Registers the `/reset` command. Displays a confirmation prompt via inline keyboard, then calls `domain/accountReset.ts` to unlink the Telegram account. Handles confirmation and cancellation callbacks.

### functions/telegram-webhook/commands/undo.ts

Registers the `/undo` command. Retrieves firebaseUid from `ctx.state`, calls `domain/undo.ts` to perform the undo, and returns user-friendly feedback.

### functions/telegram-webhook/callbacks/

Contains handlers for inline keyboard callback queries.

- `attendance.ts` implements the tap-only selection flow. It decodes selection state from callback data (bitmask), toggles buttons, and executes bulk actions via the domain layer.

### functions/telegram-webhook/domain/attendance.ts

Orchestrates attendance write actions. It maps command indices to class IDs, uses RPC-backed db functions, and returns result objects for the router to render. It does not import Telegram or the Supabase client. After successful mutations, logs actions to `attendance_actions` table via `db/undo.ts` for undo capability.

### functions/telegram-webhook/domain/schedule.ts

Orchestrates schedule read paths. It fetches enrollment and classes via db/schedule.ts and attaches attendance status via db/attendance.ts bulk status RPC. It does not import Telegram or the Supabase client.

### functions/telegram-webhook/domain/userCourses.ts

**SINGLE SOURCE OF TRUTH FOR ATTENDANCE READS IN THE TELEGRAM BOT.**

Provides per-course attendance via `getUserCourseAttendance(firebaseUid)`. This is the ONLY attendance read interface. All attendance reads in the bot must use this function. Uses db/courseAttendance.ts to fetch effective course attendance that merges Firebase snapshot + authoritative attendanceRecords. Returns course-wise attendance only (never overall).

**Architectural Invariant:** No code path in the bot may read attendance except through this function. Overall attendance semantics do not exist. The `getUserAttendanceSummary` and `get_attendance_summary` RPC are obsolete and must not be used.

### functions/telegram-webhook/domain/reminders.ts

Builds reminder message payloads by transforming rows from db/reminders.ts. It does not send messages and does not import Telegram or the Supabase client.

### functions/telegram-webhook/domain/dailyBrief.ts

Formats daily brief messages from db/dailyBrief.ts payloads. Uses `domain/userProfile.ts` for personalized greetings. It does not send messages and does not import Telegram or the Supabase client.

### functions/telegram-webhook/domain/userProfile.ts

Provides `getUserGreeting(firebaseUid)` as the single interface for name resolution. Fetches user profile from `db/firebase.ts` and returns a greeting-safe name. Prefers display_name, falls back to username, then returns null for neutral greetings.

### functions/telegram-webhook/domain/adminAccess.ts

Implements admin access control via `assertAdmin(firebaseUid)`. Checks `firebase_data.attrs.fields.isAdmin.booleanValue` and throws `AdminAccessDeniedError` if not true. Used exclusively by `/debug` command.

### functions/telegram-webhook/domain/adminDebug.ts

Builds diagnostic messages for `/debug` command. Formats data from `db/adminDebug.ts` into user-friendly output. No database access.

### functions/telegram-webhook/domain/accountReset.ts

Orchestrates account re-linking via `/reset` command. Calls `db/telegram.ts` to unlink the Telegram account. Does not contain confirmation logic (handled in command layer).

### functions/telegram-webhook/domain/undo.ts

Implements undo logic for `/undo` command. Validates time-window eligibility (today only), fetches last action, and calls `db/undo.ts` to perform reversion. Returns user-friendly result messages.

### functions/telegram-webhook/db/client.ts

Creates and exports the Supabase client using the service role key. This is the only place the client is instantiated.

### functions/telegram-webhook/db/firebase.ts

Fetches minimal user profile data (display_name, username, isAdmin) from `firebase_data.attrs.fields`. Provides `getUserProfile()` for personalization and `getIsAdmin()` for admin access control. Does not expose raw attrs.

### functions/telegram-webhook/db/adminDebug.ts

Fetches diagnostic data for `/debug` command: cron job timestamps (from `class_notification_log`, `daily_brief_log`), user settings, and hybrid attendance RPC health. Tolerates partial failures - unavailable fields return null.

### functions/telegram-webhook/db/attendance.ts

Wraps attendance RPCs. Current RPCs used: `mark_attendance_bulk`, `delete_attendance_bulk`, `get_attendance_status_bulk`, and `check_attendance_exists`.

### functions/telegram-webhook/db/schedule.ts

Wraps schedule and enrollment queries.

### functions/telegram-webhook/db/reminders.ts

Wraps the `get_pending_class_reminders` RPC used to build reminder payloads.

### functions/telegram-webhook/db/dailyBrief.ts

Wraps the `get_daily_brief_payloads` RPC used by cron execution to fetch per-user daily brief data.

### functions/telegram-webhook/db/courseAttendance.ts

Wraps the `get_effective_course_attendance` RPC that merges Firebase snapshot base with attendanceRecords deltas to produce authoritative per-course attendance.

### functions/telegram-webhook/db/telegram.ts

Provides `unlinkTelegramAccount(chatId)` to delete the Telegram ↔ Firebase UID mapping. Used by `/reset` command. Idempotent and does not affect attendance or Firebase data.

### functions/telegram-webhook/db/undo.ts

Provides action logging, retrieval, and reversion for undo functionality:

- `logAttendanceAction()`: Logs bot-initiated attendance actions to `attendance_actions` table
- `getLastAttendanceAction()`: Retrieves most recent action for a user
- `revertAttendanceAction()`: Reverses an action (delete for attend, re-insert for absent) and removes the log entry

### functions/telegram-webhook/jobs/reminders.ts

Defines `runReminders()`, a cron-triggered job entrypoint placeholder. It does not implement any logic yet.

### functions/telegram-webhook/jobs/dailyBrief.ts

Defines `runDailyBrief()`, a cron-triggered job entrypoint. It fetches daily brief payloads via RPC, formats messages in the domain layer, and sends messages via the Telegram Bot API.

### functions/telegram-webhook/utils/env.ts

Validates required environment variables and provides accessors.

### functions/telegram-webhook/utils/date.ts

IST date helpers (`getTodayIST`, `getTomorrowIST`) and the `TIMEZONE` constant.

### functions/telegram-webhook/utils/keyboards.ts

Builds the inline keyboard for attendance selection. Encodes selection as a bitmask in `callback_data`.

### functions/telegram-webhook/utils/telegram.ts

Provides the `withTyping()` helper for fire-and-forget typing indicators and optional intermediate messages.

## RPC Usage Summary

Attendance aggregation and status are performed in Postgres RPCs to avoid heavy computation in the Edge Function.

- `mark_attendance_bulk` – batch insert attendance rows with idempotent status output.
- `delete_attendance_bulk` – batch delete attendance rows.
- `get_attendance_status_bulk` – returns per-class attendance status for a user.
- `check_attendance_exists` – checks for existing attendance for a class/user.
- `get_pending_class_reminders` – returns upcoming reminders for users who opted in.
- `get_daily_brief_payloads` – returns per-user daily brief payloads and records idempotency.
- `get_effective_course_attendance` – **PRIMARY ATTENDANCE RPC** – merges Firebase snapshot with attendanceRecords deltas to produce authoritative per-course attendance.

## Where to Add Features

- New commands: add a file in commands/ and register it in bot/router.ts.
- New domain logic: add in domain/ and call it from commands/callbacks.
- New database interactions: add RPC wrappers in db/ and call from domain/.
- Scheduled tasks: add in jobs/.

If a requirement cannot be expressed using current RPCs, add a new RPC in Postgres and wrap it in db/.

## Cron-Triggered vs Telegram-Triggered Execution

Telegram-triggered execution starts at the webhook and routes through grammY. Cron-triggered execution is routed via the existing entrypoint using `x-execution-mode: job` and must not use bot routing. Daily brief delivery runs only in the cron path.

## Production Safety Guarantees

### Idempotency

All cron jobs and write operations are idempotent by design:

- **Attendance writes**: The `mark_attendance_bulk` RPC checks for existing records and returns "already" status for duplicates. Safe to retry any number of times.
- **Daily brief**: The `get_daily_brief_payloads` RPC atomically inserts into `daily_brief_log` and only returns rows that were successfully inserted. Uses `on conflict do nothing` + join pattern. Safe to retry within the same day.
- **Reminders**: The `get_pending_class_reminders` RPC atomically inserts into `class_notification_log` and only returns rows that were successfully inserted. Uses `on conflict do nothing` + join pattern. Safe to retry.

### Retry Safety

- All attendance RPCs use `on conflict do nothing` or return status codes.
- Cron jobs are isolated: one user's failure does not stop the job.
- Callback handlers answer all queries even on error paths.
- Re-running a cron job produces no duplicate messages due to Postgres-backed idempotency guards.

### Failure Isolation

- **Cron jobs**: Top-level try/catch ensures job completes gracefully even on RPC errors. Per-message try/catch ensures one Telegram send failure does not stop subsequent sends.
- **Webhook handlers**: All heavy work (attendance aggregation, status checks) is delegated to Postgres RPCs. Edge Function execution remains bounded and fast.
- **Callback handlers**: All code paths answer the callback query. Defensive input validation catches invalid/stale payloads before processing.

### Input Validation

Callback handlers validate all inputs defensively:

- Date format validation (YYYY-MM-DD)
- Numeric bounds validation (index, mask)
- Action type validation (attend/absent)
- User authorization checks

Invalid or stale callback payloads fail gracefully with user-friendly messages.

### Rate Limiting

- Cron jobs add 50ms delays between Telegram sends to stay well below Telegram's 30 messages/second limit.
- Messages are sent sequentially, not in parallel, to maintain rate control.

### Execution Time Bounds

- **Webhook handlers**: Must return within ~10 seconds. All aggregation and bulk operations are delegated to Postgres RPCs.
- **Cron jobs**: No unbounded loops. Payload size is bounded by active user count and RPC query limits.
- **RPC delegation**: Heavy computation (attendance counts, schedule joins, notification eligibility) happens in Postgres, not in the Edge Function.

### What Happens When Things Go Wrong

| Failure Mode             | Behavior                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| RPC error in cron job    | Job logs error and exits gracefully. No messages sent. Safe to retry. |
| Telegram send failure    | Logged with chat ID. Other users still receive messages.              |
| Invalid callback payload | User sees "Invalid data" toast. No crash.                             |
| Missing user mapping     | User prompted to /start. No crash.                                    |
| Stale class selection    | Fails with "No classes found" or "Invalid selection". No crash.       |
| Duplicate cron execution | Idempotent. No duplicate messages sent.                               |

## Data Model: Snapshot vs Authoritative Records

### Problem

- **firebase_data** stores a cached Firestore snapshot refreshed only when the mobile app opens.
- Course-wise attendance in firebase_data becomes stale when users only use the Telegram bot.
- Displaying stale attendance defeats the purpose of the bot.

### Solution

- **attendanceRecords** is the authoritative event source for all attendance events.
- **firebase_data** provides the base attendance snapshot up to `lastDataFetchTime`.
- **get_effective_course_attendance** RPC merges:
  - Base course attendance from firebase_data snapshot
  - Attendance deltas from attendanceRecords (after lastDataFetchTime)
  - Total class deltas from timetableRecords (after lastDataFetchTime)
- All read paths (/status, daily brief) use this RPC as the single source of truth.

### Invariants

- The Telegram bot **never writes to firebase_data**. It is app-owned and read-only.
- Attendance correctness is resolved in Postgres, not in JavaScript.
- Users never need to open the app to "sync" their Telegram bot attendance.
- Course-wise attendance is always current and accurate.
- **All attendance reads must use `domain/userCourses.ts::getUserCourseAttendance()`**. Direct RPC calls or alternative read paths are prohibited.

## Admin Access and Diagnostics

### Admin Access Control

Admin status is determined exclusively by Firebase:

- A user is an admin if `firebase_data.attrs.fields.isAdmin.booleanValue === true`
- No Telegram IDs, environment variables, or hardcoded lists are used
- Access control is enforced via `domain/adminAccess.ts::assertAdmin()`

### /debug Command

The `/debug` command provides read-only operational diagnostics for admin users:

**Access**: Admin-only (enforced via Firebase isAdmin flag)

**Diagnostics Shown**:

- Last reminder cron run timestamp (system-wide)
- Last daily brief cron run timestamp (system-wide)
- User's reminder enabled status
- User's daily brief enabled status
- Hybrid attendance RPC health check
- Course count resolved by hybrid RPC

**What is NOT shown**:

- Raw Firebase attrs
- Email addresses
- Internal database IDs
- Stack traces or error details
- Other users' data

**Failure Handling**: Partial failures are tolerated. If some diagnostics fail to load, they are marked as "Unknown" or "N/A" rather than crashing the command.

**Logging**: Admin debug usage is logged with firebase_uid and timestamp only. Diagnostic payloads are not logged.

**Use Cases**: Verify cron jobs are running, check RPC health, confirm user settings without direct database access.

## Interaction Models

### Tap-Only Attendance

Attendance marking uses a two-phase inline keyboard flow to avoid typing errors:

1. **Selection**: User taps toggle buttons. Selection state is encoded as a bitmask in the `callback_data` (stateless). The message updates to show checkmarks.
2. **Confirmation**: User taps "Attend Selected" or "Absent Selected". The handler decodes the mask, resolves classes via `domain/schedule.ts`, and executes bulk RPCs.

This model ensures the Edge Function remains stateless while providing a responsive UI.

### Attendance Transparency and Trust Cues

To build user trust and minimize confusion when using both the mobile app and Telegram bot together:

- **`/status` command**: Footer states "Attendance shown is up to date with your recent check-ins."
- **Daily brief**: Footer states "Numbers update when you mark attendance via the bot."
- **Attendance confirmations**: Footer states "Your stats will reflect this immediately."

These cues clarify that:

- The bot shows authoritative attendance (not stale snapshots)
- Numbers update immediately when marked via the bot
- App and bot may show different timing due to Firebase sync, but bot attendance is always authoritative

The wording is non-technical, non-alarmist, and does not expose implementation details (Firebase, RPCs, databases).

### User Personalization

The bot addresses users personally in key messages using Firebase profile data:

- **`/start` command**: "Welcome back, [Name]!" for already-connected users
- **`/status` command**: "[Name]'s Attendance" as the header
- **Daily brief**: "Good morning, [Name]" as the greeting

**Name Resolution**:

1. Prefers `display_name` from `firebase_data.attrs.fields` if present and non-empty
2. Falls back to `username` if display_name is unavailable
3. Uses neutral greeting if neither exists

**Scope**: Personalization is intentionally limited to high-value touchpoints (welcome, status, daily brief). It is NOT used in error messages, inline buttons, or every response to avoid overuse.

**Performance**: Profile data is fetched once per request and reused within the same execution. No cross-request caching is implemented.

**Implementation**: `domain/userProfile.ts::getUserGreeting()` provides the single interface for name resolution. `db/firebase.ts` handles raw profile queries.

## User Recovery: Reset and Undo

The bot provides two recovery mechanisms for users who make mistakes or need to change their account linking.

### /reset – Account Re-linking

**Purpose**: Allows users to disconnect their Telegram from Attendrix and re-link to a different account.

**What it does**:

- Removes the Telegram chat_id ↔ firebase_uid mapping from `telegram_user_mappings`
- Forces authentication middleware to block all commands until `/start` is run again
- Requires explicit confirmation via inline keyboard to prevent accidental disconnection

**What it does NOT do**:

- Does NOT delete any attendance data from `attendanceRecords`
- Does NOT delete Firebase data
- Does NOT delete course enrollment or user profile data
- Does NOT automatically link a new account

**Use case**: User accidentally linked the wrong Attendrix account, or wants to switch to a different account.

**Implementation**:

- `commands/reset.ts`: Telegram command handler with confirmation flow
- `domain/accountReset.ts`: Business logic orchestration
- `db/telegram.ts`: Direct database mutation (DELETE from telegram_user_mappings)

**Safety**:

- Requires inline keyboard confirmation
- Clear messaging about what is preserved vs removed
- Idempotent: safe to run multiple times

### /undo – Last Action Reversal

**Purpose**: Allows users to revert their most recent attendance-related action performed via the bot.

**What it does**:

- Reverts the user's last attendance mutation (attend or absent)
- Only works for actions performed today (same day in IST)
- Only undoes bot-initiated actions (not manual or web-based attendance)

**Action Types**:

- Undo "attend" → deletes the attendance records that were just marked
- Undo "absent" → re-inserts attendance records that were just deleted (conservative: only if class still exists in timetable)

**What it does NOT do**:

- Does NOT undo actions from previous days
- Does NOT undo manual attendance changes made in the mobile app
- Does NOT undo cron-scheduled actions (reminders, daily brief)
- Does NOT provide multi-step undo (only most recent action)
- Does NOT expose raw class IDs or internal state to users

**Use case**: User accidentally marked attendance for the wrong class(es), or accidentally marked absent instead of present.

**Audit Trail**:

- All bot-initiated attendance actions are logged to `attendance_actions` table
- Table contains: firebase_uid, action_type (attend/absent), affected_class_ids[], created_at
- Action log entries are deleted after successful undo
- Undo itself is NOT logged as a separate action (prevents undo-redo loops)

**Implementation**:

- `commands/undo.ts`: Telegram command handler
- `domain/undo.ts`: Business logic with time-window validation
- `db/undo.ts`: Action logging, retrieval, and reversion
- `domain/attendance.ts`: Integrated action logging after successful mutations

**Safety Guarantees**:

- Time-bounded: only actions from today
- Conservative: undo "absent" only restores attendance if class still exists
- Idempotent: safe to retry (action is deleted after reversion)
- Deterministic: does not guess or infer user intent

**Limitations (Intentional)**:

- Single-step undo only (no undo history)
- Same-day only (no historical undo)
- Bot-initiated only (does not track app-based changes)
- No redo capability

**Why Conservative**:

- Prevents accidental data corruption
- Reduces support load from undo mistakes
- Ensures audit trail remains clean
- Maintains data integrity across bot and mobile app

### Difference: Reset vs Undo

| Feature            | /reset                            | /undo                                  |
| ------------------ | --------------------------------- | -------------------------------------- |
| **Scope**          | Account linking                   | Last attendance action                 |
| **Time limit**     | None                              | Today only                             |
| **Confirmation**   | Required (inline keyboard)        | Not required                           |
| **Data deleted**   | telegram_user_mappings row        | attendance_actions + attendanceRecords |
| **Data preserved** | All attendance, Firebase, courses | All data except last action            |
| **Reversible**     | Yes (run /start again)            | No (undo is one-way)                   |
| **Use case**       | Wrong account linked              | Accidental attendance mark             |

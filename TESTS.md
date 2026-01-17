# Comprehensive Test Plan for Telegram Bot

## 1. RPC-Level Tests (Highest Priority)

These tests validate the foundational computation layer that all bot features depend on.

### 1.1 Attendance Write RPCs

**Test: `mark_attendance_bulk` returns idempotent status codes**

- **Purpose**: Verify duplicate inserts return "already" status without errors
- **Protects against**: Retry storms causing crashes or data corruption
- **Why necessary**: Cron retries and user double-taps must be safe

**Test: `mark_attendance_bulk` correctly handles partial success**

- **Purpose**: When marking 3 classes where 1 already exists, verify mixed results
- **Protects against**: All-or-nothing failures hiding partial state
- **Why necessary**: Users need accurate feedback on what succeeded

**Test: `delete_attendance_bulk` is idempotent on missing records**

- **Purpose**: Deleting already-deleted records returns success status
- **Protects against**: Undo failures when user retries
- **Why necessary**: Undo must be retry-safe

**Test: `delete_attendance_bulk` only deletes user's own records**

- **Purpose**: Cannot accidentally delete another user's attendance
- **Protects against**: Authorization bugs in bulk operations
- **Why necessary**: Multi-tenancy isolation

### 1.2 Attendance Read RPC (Critical)

**Test: `get_effective_course_attendance` merges snapshot + deltas correctly**

- **Purpose**: Firebase shows 5/10, bot marks 2 more → should return 7/12
- **Protects against**: Displaying stale attendance to users
- **Why necessary**: Core value proposition of the bot

**Test: `get_effective_course_attendance` handles missing Firebase snapshot gracefully**

- **Purpose**: New user with no firebase_data entry returns zero-initialized attendance
- **Protects against**: Null pointer crashes on new accounts
- **Why necessary**: Onboarding path must work

**Test: `get_effective_course_attendance` ignores attendance before `lastDataFetchTime`**

- **Purpose**: Attendance marked at 9 AM, snapshot from 10 AM → should not double-count
- **Protects against**: Double-counting attendance events
- **Why necessary**: Prevents inflation of attendance numbers

**Test: `get_effective_course_attendance` correctly adds new classes from timetableRecords**

- **Purpose**: Firebase shows course A (5 classes), timetable now has 8 classes total → returns 8
- **Protects against**: Stale total class counts
- **Why necessary**: Attendance percentage would be wrong otherwise

**Test: `get_effective_course_attendance` handles deleted courses gracefully**

- **Purpose**: Firebase shows course B, but user unenrolled → should not crash
- **Protects against**: Stale enrollment data causing RPC failures
- **Why necessary**: User can unenroll in the app while bot is open

**Test: `get_effective_course_attendance` respects course isolation**

- **Purpose**: Marking attendance in course A does not affect course B's counts
- **Protects against**: Cross-course contamination bugs
- **Why necessary**: Per-course attendance is the core data model

### 1.3 Status Check RPCs

**Test: `get_attendance_status_bulk` correctly identifies attended classes**

- **Purpose**: User marked class X → status returns "attended" for X
- **Protects against**: False negatives in UI state
- **Why necessary**: Inline keyboard checkmarks must be accurate

**Test: `check_attendance_exists` returns true after `mark_attendance_bulk`**

- **Purpose**: Immediate consistency check within same transaction
- **Protects against**: Write-read race conditions
- **Why necessary**: Users expect instant feedback

### 1.4 Cron Payload RPCs

**Test: `get_daily_brief_payloads` prevents duplicate sends**

- **Purpose**: Running twice in same day returns zero rows the second time
- **Protects against**: Spamming users with duplicate briefs
- **Why necessary**: Cron systems may double-trigger

**Test: `get_daily_brief_payloads` only returns opted-in users**

- **Purpose**: User with `daily_brief_enabled = false` is excluded
- **Protects against**: Sending unsolicited notifications
- **Why necessary**: Compliance with user preferences

**Test: `get_pending_class_reminders` prevents duplicate notifications**

- **Purpose**: Reminder for class X sent once → subsequent calls exclude X
- **Protects against**: Notification spam
- **Why necessary**: Idempotency for reminder cron

**Test: `get_pending_class_reminders` respects reminder time window**

- **Purpose**: Only returns classes within 30-60 minute window
- **Protects against**: Early or late reminders
- **Why necessary**: User expectation of "upcoming" class definition

---

## 2. Domain-Level Tests (Deno)

These tests validate business logic orchestration without touching Telegram or database clients.

### 2.1 Attendance Domain

**Test: `markAttendance()` maps command indices to correct class IDs**

- **Purpose**: User selects indices [0, 2] → domain resolves to correct timetable class IDs
- **Protects against**: Marking wrong classes due to index misalignment
- **Why necessary**: Selection bitmask must map to actual schedule

**Test: `markAttendance()` returns user-friendly messages for all outcomes**

- **Purpose**: Success, partial success, all-already, error → all return actionable text
- **Protects against**: Raw error messages shown to users
- **Why necessary**: UX requirement for graceful degradation

**Test: `markAttendance()` logs actions for undo after successful mutations**

- **Purpose**: Marking 3 classes successfully → action log contains all 3 class IDs
- **Protects against**: Undo unavailability after valid actions
- **Why necessary**: Undo feature depends on action log

**Test: `markAttendance()` does not log actions on failures**

- **Purpose**: RPC fails → no action log entry created
- **Protects against**: Invalid undo state from failed operations
- **Why necessary**: Undo should only revert successful actions

**Test: `markAbsent()` follows same guarantees as `markAttendance()`**

- **Purpose**: Deletion path has equivalent safety and logging
- **Protects against**: Asymmetric behavior between attend/absent
- **Why necessary**: User mental model expects symmetry

### 2.2 Schedule Domain

**Test: `getTodaySchedule()` returns empty array when no classes scheduled**

- **Purpose**: Sunday or holiday → returns [] without error
- **Protects against**: Null pointer errors on empty days
- **Why necessary**: Inline keyboard must handle empty state

**Test: `getTodaySchedule()` attaches attendance status to all classes**

- **Purpose**: Every class has `isAttended` boolean field populated
- **Protects against**: UI rendering errors from missing status
- **Why necessary**: Checkmark display depends on this field

**Test: `getTodaySchedule()` respects user enrollment isolation**

- **Purpose**: User A's schedule does not include user B's classes
- **Protects against**: Multi-tenancy leakage
- **Why necessary**: Authorization boundary

### 2.3 User Courses Domain (Single Source of Truth)

**Test: `getUserCourseAttendance()` returns per-course attendance only**

- **Purpose**: Response contains course-wise stats, never overall percentage
- **Protects against**: Reintroducing overall attendance semantics
- **Why necessary**: Architectural invariant enforcement

**Test: `getUserCourseAttendance()` calls `get_effective_course_attendance` RPC**

- **Purpose**: Verify function delegates to authoritative RPC, not direct queries
- **Protects against**: Bypassing the single source of truth
- **Why necessary**: Centralization requirement

**Test: `getUserCourseAttendance()` handles empty enrollment gracefully**

- **Purpose**: New user with no courses → returns empty array, not error
- **Protects against**: Crash on `/status` for new users
- **Why necessary**: Onboarding path correctness

### 2.4 Undo Domain

**Test: `undoLastAction()` rejects actions from previous days**

- **Purpose**: Action from yesterday → returns "too late" error
- **Protects against**: Stale undo attempts corrupting data
- **Why necessary**: Time-bounded undo is intentional design

**Test: `undoLastAction()` correctly reverts "attend" actions**

- **Purpose**: Last action was marking 3 classes → undo deletes those 3 records
- **Protects against**: Incorrect reversion logic
- **Why necessary**: Core undo functionality

**Test: `undoLastAction()` correctly reverts "absent" actions conservatively**

- **Purpose**: Last action was deleting 2 classes → undo only restores if classes still exist
- **Protects against**: Re-inserting attendance for deleted classes
- **Why necessary**: Conservative safety requirement

**Test: `undoLastAction()` returns clear message when no recent action exists**

- **Purpose**: User never used bot today → friendly message, not error
- **Protects against**: Confusing error messages
- **Why necessary**: UX expectation

### 2.5 Account Reset Domain

**Test: `resetAccount()` removes Telegram mapping only**

- **Purpose**: After reset, user cannot use bot until `/start`, but attendance preserved
- **Protects against**: Accidental data loss
- **Why necessary**: User trust in reset safety

**Test: `resetAccount()` is idempotent**

- **Purpose**: Running reset twice → same result, no error
- **Protects against**: User confusion from retry errors
- **Why necessary**: Accidental double-tap scenarios

### 2.6 User Profile Domain

**Test: `getUserGreeting()` prefers display_name over username**

- **Purpose**: Firebase has both fields → display_name is used
- **Protects against**: Preferring less-personal identifier
- **Why necessary**: Personalization quality

**Test: `getUserGreeting()` returns null for missing profile data**

- **Purpose**: No display_name or username → returns null for neutral greeting
- **Protects against**: Crashing on incomplete profiles
- **Why necessary**: Graceful degradation requirement

### 2.7 Admin Access Domain

**Test: `assertAdmin()` throws when `isAdmin` is false**

- **Purpose**: Non-admin user → access denied error
- **Protects against**: Unauthorized diagnostic access
- **Why necessary**: Security boundary enforcement

**Test: `assertAdmin()` passes when `isAdmin` is true**

- **Purpose**: Admin user → no error thrown
- **Protects against**: False denials
- **Why necessary**: Admin functionality must work

**Test: `assertAdmin()` throws when `isAdmin` is missing**

- **Purpose**: Field not present in Firebase attrs → treated as non-admin
- **Protects against**: Default-permit security bugs
- **Why necessary**: Fail-closed security design

---

## 3. Undo & Reset Tests (Critical Safety)

### 3.1 Valid Undo Cases

**Test: Undo "attend" action deletes correct records**

- **Purpose**: User marked classes [A, B, C] → undo removes exactly those 3
- **Protects against**: Under-deletion or over-deletion
- **Why necessary**: Precision requirement for undo

**Test: Undo "absent" action restores records conservatively**

- **Purpose**: User deleted class [D] → undo restores D only if D still exists in timetable
- **Protects against**: Restoring attendance for dropped classes
- **Why necessary**: Data integrity after schedule changes

**Test: Undo removes action log entry after successful reversion**

- **Purpose**: After undo → `getLastAttendanceAction()` returns null
- **Protects against**: Double-undo or undo-redo loops
- **Why necessary**: Single-step undo enforcement

### 3.2 Invalid/Rejected Undo Cases

**Test: Undo fails when action is from previous day**

- **Purpose**: Action from yesterday at 11 PM → undo at 1 AM today fails
- **Protects against**: Stale undo corrupting historical data
- **Why necessary**: Time-boundary enforcement

**Test: Undo fails gracefully when no action exists**

- **Purpose**: User runs `/undo` without prior bot usage → friendly message
- **Protects against**: Confusing error states
- **Why necessary**: First-time user experience

**Test: Undo fails when timetable class was deleted**

- **Purpose**: User marked class X, admin deleted X from timetable → undo returns partial failure message
- **Protects against**: Restoring orphaned attendance
- **Why necessary**: Conservative safety requirement

### 3.3 Reset Safety

**Test: Reset preserves all attendance data**

- **Purpose**: After reset → attendanceRecords unchanged
- **Protects against**: Accidental data loss
- **Why necessary**: User trust in reset feature

**Test: Reset blocks all commands except `/start`**

- **Purpose**: After reset, `/status` fails with "not linked" message
- **Protects against**: Unauthorized access to old account data
- **Why necessary**: Proper re-authentication flow

**Test: Reset is reversible via `/start`**

- **Purpose**: Reset → `/start` with same Firebase UID → access restored
- **Protects against**: Permanent account lockout
- **Why necessary**: Recovery path for mistakes

---

## 4. Cron Job Safety Tests

### 4.1 Idempotency

**Test: Daily brief cron can be run twice in one day safely**

- **Purpose**: Second execution returns zero payloads from RPC
- **Protects against**: Duplicate message spam
- **Why necessary**: Cron systems may retry

**Test: Reminder cron can be run multiple times for same time window**

- **Purpose**: Running reminder job 3 times for 9:30 classes → each user gets 1 message total
- **Protects against**: Notification spam
- **Why necessary**: Cron overlap scenarios

### 4.2 Partial Failure Isolation

**Test: One user's Telegram send failure does not stop cron job**

- **Purpose**: 100 users, user 50 fails → users 51-100 still receive messages
- **Protects against**: Cascading failures
- **Why necessary**: Blast radius limitation

**Test: RPC failure in cron job exits gracefully**

- **Purpose**: `get_daily_brief_payloads` throws error → job logs and exits, no crash
- **Protects against**: Infinite retry loops or worker crashes
- **Why necessary**: Operational stability

**Test: Invalid Telegram chat ID logs error and continues**

- **Purpose**: User deleted their Telegram account → cron logs failure, processes next user
- **Protects against**: Blocking entire job on stale mappings
- **Why necessary**: Resilience to user churn

### 4.3 Rate Limiting

**Test: Cron jobs respect 50ms delay between sends**

- **Purpose**: Sending 100 messages → total time >= 5 seconds
- **Protects against**: Telegram rate limit violations
- **Why necessary**: API compliance

**Test: Cron jobs send messages sequentially, not in parallel**

- **Purpose**: No concurrent Telegram API calls from same job
- **Protects against**: Overwhelming Telegram API or exceeding burst limits
- **Why necessary**: Conservative rate control

---

## 5. Regression & Invariant Tests

These tests enforce architectural rules that must never be violated.

### 5.1 Data Model Invariants

**Test: `domain/userCourses.ts` is the only attendance read interface**

- **Purpose**: Static analysis or runtime check: no other module calls attendance RPCs directly
- **Protects against**: Bypassing single source of truth
- **Why necessary**: Centralization enforcement

**Test: No code path reads overall attendance**

- **Purpose**: Grep/lint check: no references to "overall" attendance semantics
- **Protects against**: Reintroducing removed feature
- **Why necessary**: Architectural decision enforcement

**Test: Firebase snapshot data is never mutated by bot**

- **Purpose**: Verify `firebase_data` table has no UPDATE/DELETE grants to Edge Function service role
- **Protects against**: Bot corrupting app-owned data
- **Why necessary**: Ownership boundary enforcement

**Test: `attendanceRecords` is the only attendance write target**

- **Purpose**: All attendance mutations go through `mark_attendance_bulk` or `delete_attendance_bulk`
- **Protects against**: Inconsistent event sourcing
- **Why necessary**: Authoritative log requirement

### 5.2 Layer Boundary Invariants

**Test: Domain functions never import grammY or `bot` instance**

- **Purpose**: Static import analysis: `domain/*` has zero Telegram dependencies
- **Protects against**: Layer violation and tight coupling
- **Why necessary**: Testability and architecture enforcement

**Test: Command handlers never call Supabase client directly**

- **Purpose**: All database access flows through `db/*` modules
- **Protects against**: Bypassing abstraction layer
- **Why necessary**: Centralized error handling and retries

**Test: Callback handlers always answer callback query on all code paths**

- **Purpose**: Even on error, `answerCallbackQuery()` is called
- **Protects against**: Telegram UI showing eternal loading state
- **Why necessary**: UX requirement from Telegram

### 5.3 Security Invariants

**Test: Middleware blocks unauthenticated users for all commands except `/start` and `/help`**

- **Purpose**: No telegram_user_mapping → commands return "not linked" error
- **Protects against**: Unauthorized access to attendance data
- **Why necessary**: Authorization boundary

**Test: Bulk RPCs enforce user isolation via `firebase_uid` parameter**

- **Purpose**: User A cannot mark attendance for user B's classes
- **Protects against**: Multi-tenancy violations
- **Why necessary**: Data privacy requirement

**Test: Admin commands check `isAdmin` flag before execution**

- **Purpose**: `/debug` calls `assertAdmin()` before returning diagnostics
- **Protects against**: Information disclosure to non-admin users
- **Why necessary**: Access control enforcement

### 5.4 Data Integrity Invariants

**Test: Attendance percentage never exceeds 100%**

- **Purpose**: `get_effective_course_attendance` returns attended <= total
- **Protects against**: Double-counting bugs
- **Why necessary**: Logical correctness

**Test: Class IDs in action log match classes that existed at log time**

- **Purpose**: Action log does not reference non-existent classes
- **Protects against**: Orphaned references in audit trail
- **Why necessary**: Undo correctness

**Test: Daily brief payloads contain only today's or tomorrow's classes**

- **Purpose**: RPC date filtering is correct
- **Protects against**: Sending briefs about past or distant future classes
- **Why necessary**: Feature definition compliance

---

## Test Implementation Priority

### Phase 1 (Blockers)

1. `get_effective_course_attendance` correctness tests
2. `mark_attendance_bulk` and `delete_attendance_bulk` idempotency
3. Undo domain logic tests
4. Daily brief cron idempotency

### Phase 2 (High Value)

5. Status check RPC tests
6. Schedule domain tests
7. Reset safety tests
8. Layer boundary invariant checks

### Phase 3 (Completeness)

9. Partial failure isolation tests
10. Admin access tests
11. User profile domain tests
12. Security invariant tests

---

## Test Data Requirements

### Required Test Fixtures

- **Dummy Firebase UID**: Pre-existing UID safe to mutate
- **Test Telegram chat ID**: Mapped to dummy UID
- **Test courses**: 2-3 enrolled courses with known class counts
- **Test timetable**: Classes scheduled for "today" in IST
- **Stale Firebase snapshot**: Snapshot with `lastDataFetchTime` before test attendance events

### Cleanup Strategy

- Truncate `attendance_actions` after undo tests
- Delete test attendance records after each test
- Preserve telegram_user_mappings for dummy UID (reusable)
- Do NOT delete firebase_data (read-only)

---

## Success Criteria

This test plan is complete when:

1. All RPC invariants are validated
2. Undo safety is guaranteed
3. Cron idempotency is proven
4. Architectural invariants are enforced
5. Stale Firebase scenarios are handled correctly
6. All tests can run in isolation (no interdependencies)

The plan intentionally excludes:

- UI/integration tests with real Telegram servers
- Performance/load testing
- Manual QA scenarios
- Telegram webhook delivery tests (external system)

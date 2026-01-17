# Phase 1 Tests: Blockers

Phase 1 tests validate the **core system guarantees** that prevent data corruption, duplicate operations, and unsafe undo behavior.

## Test Coverage

### 1. RPC Correctness Tests

#### `effective-course-attendance.test.ts`

**Purpose**: Validate single source of truth for attendance reads

- ✅ Merges Firebase snapshot + attendanceRecords deltas correctly
- ✅ Handles missing Firebase snapshot gracefully
- ✅ Ignores attendance before `lastDataFetchTime`
- ✅ Respects course isolation
- ✅ Returns empty array when no courses exist

**Critical**: This RPC is the authoritative source for all attendance calculations. Any bugs here would corrupt user-facing attendance percentages.

---

#### `mark-attendance-bulk.test.ts`

**Purpose**: Validate idempotency of bulk attendance marking

- ✅ Double-call returns "already" on second call (no duplicates)
- ✅ Partial success handling (mixed new + already-marked)
- ✅ Return values match input order
- ✅ Empty classIDs handled gracefully

**Critical**: Telegram webhook retries must not create duplicate attendance records.

---

#### `delete-attendance-bulk.test.ts`

**Purpose**: Validate idempotency of bulk attendance deletion

- ✅ Double-call returns `deleted: false` on second call
- ✅ Partial success (mixed existing + non-existing classes)
- ✅ Return values match input order
- ✅ User isolation (doesn't affect other users' records)

**Critical**: Webhook retries must not fail when deleting already-deleted records.

---

#### `daily-brief-payloads.test.ts`

**Purpose**: Validate cron-triggered daily brief is retry-safe

- ✅ RPC is idempotent (second call returns empty)
- ✅ `daily_brief_log` prevents duplicate sends
- ✅ Date isolation (different dates are independent)
- ✅ Multi-user isolation
- ✅ Respects user preference (`dailyBriefEnabled`)
- ✅ Payload structure correctness

**Critical**: Cron retries must not send duplicate daily briefs to users.

---

### 2. Domain Logic Tests

#### `undo.test.ts`

**Purpose**: Validate undo safety and conservative restoration

- ✅ Same-day restriction enforced (cannot undo old actions)
- ✅ Single-step undo (only most recent action)
- ✅ Conservative restoration (only if timetable exists)
- ✅ Attend action reversal (deletes records)
- ✅ Absent action reversal (restores only safe classes)
- ✅ Action log cleanup after undo
- ✅ No actions to undo handled gracefully

**Critical**: Undo must be predictable, safe, and never restore data that could be incorrect.

---

## Running Phase 1 Tests

### Prerequisites

1. **Test database setup**:

   - Update `DUMMY_FIREBASE_UID` in `fixtures/test-data.ts` to a real test user UID
   - Ensure test database has required tables and RPCs
   - Ensure test user exists in `firebase_data` and `telegram_user_mappings`

2. **Environment variables**:
   ```bash
   export SUPABASE_URL="your_supabase_url"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
   ```

### Run All Phase 1 Tests

From the Edge Function directory:

```bash
cd functions/telegram-webhook
deno test __tests__/phase1/ --allow-net --allow-env
```

### Run Specific Test Files

```bash
# RPC tests only
deno test __tests__/phase1/rpc/ --allow-net --allow-env

# Domain tests only
deno test __tests__/phase1/domain/ --allow-net --allow-env

# Single file
deno test __tests__/phase1/rpc/effective-course-attendance.test.ts --allow-net --allow-env
```

### Test Flags

- `--allow-net`: Required for Supabase client HTTP calls
- `--allow-env`: Required for environment variable access (Supabase URL/key)
- `--parallel`: Run tests in parallel (use cautiously with DB mutations)
- `--fail-fast`: Stop on first failure

---

## Test Isolation

All tests use the **dummy Firebase UID** defined in `fixtures/test-data.ts`. This ensures:

- Tests don't affect production data
- Tests can safely create/delete records
- Tests are isolated from other users

**Cleanup strategy**:

- Each test calls `fullCleanup()` before and after execution
- Cleanup functions are in `setup/cleanup.ts`
- Tests clean up even if they fail (using `try...finally`)

---

## Test Data

### Fixtures (`fixtures/test-data.ts`)

- `DUMMY_FIREBASE_UID`: Safe UID for mutation tests
- `TEST_TELEGRAM_CHAT_ID`: Telegram chat ID for dummy user
- `TEST_COURSE_IDS`: Predefined course IDs for tests
- `TEST_CLASS_IDS`: Predefined class IDs for tests
- `getTodayISTString()`: Current date in IST (YYYY-MM-DD)
- `getYesterdayISTString()`: Yesterday's date in IST

### Cleanup Utilities (`setup/cleanup.ts`)

- `cleanupAttendanceRecords()`: Delete all attendance for dummy user
- `cleanupAttendanceActions()`: Delete all action logs for dummy user
- `cleanupDailyBriefLog()`: Delete daily brief logs for dummy user
- `fullCleanup()`: Run all cleanup functions

---

## Expected Test Results

All Phase 1 tests should **pass** before any production deployment. These tests validate critical system invariants:

1. **No duplicate attendance records** (idempotency)
2. **Correct attendance calculations** (single source of truth)
3. **Safe undo behavior** (same-day, single-step, conservative)
4. **No duplicate daily briefs** (cron idempotency)

If any Phase 1 test fails, it indicates a **blocker** that must be fixed before proceeding.

---

## Next Steps

After Phase 1 passes:

- **Phase 2**: Domain orchestration tests (user flows, edge cases)
- **Phase 3**: Integration tests (end-to-end bot behavior)

See [TESTS.md](../../../TESTS.md) for the full test plan.

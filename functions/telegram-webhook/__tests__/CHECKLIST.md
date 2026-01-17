# Phase 1 Implementation Checklist

## ✅ Test Infrastructure Created

- [x] Test folder structure: `__tests__/phase1/`
- [x] Fixtures: `test-data.ts` (dummy UID, test course/class IDs, date helpers)
- [x] Cleanup utilities: `cleanup.ts` (attendance, actions, daily brief, full cleanup)
- [x] Test runner script: `run-tests.sh` (with flags for watch/fail-fast)

---

## ✅ RPC Correctness Tests Implemented

### `effective-course-attendance.test.ts` (6 tests)

- [x] Merges snapshot + deltas correctly
- [x] Handles missing Firebase snapshot
- [x] Ignores attendance before `lastDataFetchTime`
- [x] Respects course isolation
- [x] Returns empty array when no courses exist

### `mark-attendance-bulk.test.ts` (4 tests)

- [x] Idempotent double-call (returns "already" on retry)
- [x] Partial success (mixed new + already-marked)
- [x] Return order matches input order
- [x] Empty classIDs handled gracefully

### `delete-attendance-bulk.test.ts` (5 tests)

- [x] Idempotent double-call (returns `deleted: false` on retry)
- [x] Partial success (mixed existing + non-existing)
- [x] Return order matches input order
- [x] Empty classIDs handled gracefully
- [x] User isolation (doesn't affect other users)

### `daily-brief-payloads.test.ts` (5 tests)

- [x] Idempotent (second call returns empty)
- [x] Date isolation (different dates independent)
- [x] Multi-user isolation
- [x] Respects user preference (`dailyBriefEnabled`)
- [x] Payload structure correctness

---

## ✅ Domain Logic Tests Implemented

### `undo.test.ts` (6 tests)

- [x] Same-day restriction enforced
- [x] Single-step undo (only most recent)
- [x] Conservative restoration (only if timetable exists)
- [x] Attend action reversal (deletes records)
- [x] Absent action reversal (restores safe classes)
- [x] No actions to undo handled gracefully

---

## 📋 Before Running Tests

### Required Setup

1. **Update test fixtures** (`fixtures/test-data.ts`):

   ```typescript
   // Update this to a real test user UID in your database:
   export const DUMMY_FIREBASE_UID = "test_user_12345_safe_to_mutate";
   ```

2. **Ensure test user exists in database**:

   - `firebase_data` table: Must have entry for `DUMMY_FIREBASE_UID`
   - `telegram_user_mappings`: Must map `DUMMY_FIREBASE_UID` to `TEST_TELEGRAM_CHAT_ID`
   - `userProfile`: Create profile for test user (optional, will be created by tests if needed)

3. **Set environment variables**:

   ```bash
   export SUPABASE_URL="your_supabase_url"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
   ```

4. **Verify RPCs exist**:
   - Run this in your Supabase project to confirm RPCs:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_type = 'FUNCTION'
   AND routine_schema = 'public'
   AND routine_name IN (
     'get_effective_course_attendance',
     'mark_attendance_bulk',
     'delete_attendance_bulk',
     'get_daily_brief_payloads'
   );
   ```
   Should return all 4 RPCs.

---

## 🚀 Running Phase 1 Tests

### Quick Start

```bash
cd functions/telegram-webhook/__tests__
./run-tests.sh
```

### Options

```bash
# Run with watch mode (re-run on file changes)
./run-tests.sh --watch

# Stop on first failure
./run-tests.sh --fail-fast

# Run specific test file
./run-tests.sh phase1/rpc/effective-course-attendance.test.ts

# Run only RPC tests
./run-tests.sh phase1/rpc/

# Run only domain tests
./run-tests.sh phase1/domain/
```

### Manual Deno Command

```bash
cd functions/telegram-webhook
deno test __tests__/phase1/ --allow-net --allow-env
```

---

## 🎯 Success Criteria

Phase 1 tests are **blocking**. All tests must pass before:

- Deploying to production
- Proceeding to Phase 2 tests
- Making structural changes to attendance logic

**Expected output**:

```
✓ All Phase 1 Tests Passed
```

If any test fails, it indicates a critical bug that must be fixed immediately.

---

## 📊 Test Statistics

| Category        | Tests  | Files | Coverage                             |
| --------------- | ------ | ----- | ------------------------------------ |
| RPC Correctness | 20     | 4     | Idempotency, correctness, edge cases |
| Domain Logic    | 6      | 1     | Undo safety, single-step, same-day   |
| **Total**       | **26** | **5** | **Phase 1 Blockers**                 |

---

## 🐛 Troubleshooting

### "DUMMY_FIREBASE_UID not found in database"

- Create a test user in your Supabase database
- Update `DUMMY_FIREBASE_UID` in `fixtures/test-data.ts`

### "RPC not found"

- Check that migrations have been applied to your test database
- Verify RPC names match exactly (case-sensitive)

### "Permission denied"

- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (not the anon key)
- Service role key has full database access

### Tests timeout

- Check network connectivity to Supabase
- Verify Supabase project is running (not paused)

### Tests interfere with each other

- Ensure `fullCleanup()` is called in `finally` blocks
- Don't run tests in parallel if they mutate the same data

---

## 📝 Next Steps

After Phase 1 passes:

1. **Phase 2**: Implement domain orchestration tests

   - User course attendance flow
   - Schedule retrieval
   - Reminder generation

2. **Phase 3**: Implement integration tests

   - End-to-end bot behavior
   - Command handlers
   - Callback handlers

3. **CI/CD**: Set up automated test runs
   - GitHub Actions workflow
   - Pre-deployment test gate

See [TESTS.md](../../TESTS.md) for full test plan.

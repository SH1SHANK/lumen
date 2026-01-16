# Telegram Bot Architecture (Supabase Edge Function)

This repository implements a Telegram bot using a single Supabase Edge Function written for the Deno runtime with grammY. The system is structured into layers that separate Telegram routing, domain orchestration, and database access via RPCs.

## Request Flow

```
Telegram Update
  → Edge Function HTTP entrypoint (functions/telegram-webhook/index.ts)
    → Bot middleware (auth)
    → Bot routing (commands + callbacks)
      → Domain layer (business orchestration)
        → DB layer (Supabase RPCs / queries)
          → Postgres
      → Telegram response
```

## Folder Responsibilities

### functions/telegram-webhook/

This is the Edge Function root. Only one HTTP entrypoint exists.

- bot/ – grammY bot instance, middleware, and router wiring.
- commands/ – command handlers that register with the bot.
- callbacks/ – (not present yet) callback handlers for inline keyboard actions.
- domain/ – business orchestration using db layer only.
- db/ – Supabase RPC and query wrappers only.
- jobs/ – scheduled job logic invoked by cron-triggered execution.
- utils/ – environment validation and date helpers.

## Architecture Invariants (Current Contract)

These are the intended rules for the codebase. The implementation generally follows them, with known exceptions listed below.

- Commands and callbacks should not call Supabase directly; they should call domain functions.
- Domain modules must not import Telegram types or access the bot instance.
- Database access should be isolated to db/ and should prefer RPCs for heavy computation.
- The Edge Function entrypoint should only validate environment, wire middleware/routes, and start the server.
- Jobs must not import bot/, commands/, or callbacks/, and must be safe to retry.

### Known Exceptions in Current Implementation

These are deviations observed in the current code and should be resolved in future refactors:

- commands/start.ts calls Supabase directly to resolve the user mapping.
- bot/router.ts still contains direct Supabase queries for schedule reads and class lookups.

## File-Level Documentation

### functions/telegram-webhook/index.ts

This is the single HTTP entrypoint. It validates environment via utils/env.ts side effects, wires middleware and routes, and starts the webhook server. It must not contain business logic or database access.

### functions/telegram-webhook/bot/bot.ts

Creates and exports the grammY `bot` instance using the Telegram token. It must not register middleware or handlers.

### functions/telegram-webhook/bot/middleware.ts

Defines authentication middleware. It resolves Telegram chat IDs to Firebase UIDs and sets `ctx.state.firebaseUid`. It must not contain command handling logic. It currently uses a direct Supabase query for the mapping.

### functions/telegram-webhook/bot/router.ts

Registers all commands and callback handlers. It formats responses and invokes domain functions. It should not contain database access, but currently includes schedule/enrollment queries and class lookups that should move to db/domain layers.

### functions/telegram-webhook/commands/start.ts

Registers the `/start` command. It checks whether the user is already linked and returns a link button when needed. It currently queries Supabase directly for the user mapping; this should move to domain/db in future steps.

### functions/telegram-webhook/commands/help.ts

Registers the `/help` command and returns the static help text. No database access.

### functions/telegram-webhook/domain/attendance.ts

Orchestrates attendance write actions. It maps command indices to class IDs, chooses bulk RPCs, and returns result objects for the router to render. It must not import Telegram or the Supabase client.

### functions/telegram-webhook/domain/schedule.ts

Orchestrates schedule read paths. It fetches enrollment and classes via db/schedule.ts and attaches attendance status via db/attendance.ts bulk status RPC. It must not import Telegram or the Supabase client.

### functions/telegram-webhook/domain/stats.ts

Orchestrates attendance summary retrieval for `/status`. It uses db/stats.ts and db/schedule.ts, returning compact totals to the router. It must not compute totals itself beyond trivial formatting.

### functions/telegram-webhook/db/client.ts

Creates and exports the Supabase client using the service role key. This is the only place the client should be instantiated.

### functions/telegram-webhook/db/attendance.ts

Wraps attendance RPCs. It must not include business logic or Telegram-specific logic. Current RPCs used: `mark_attendance_bulk`, `delete_attendance_bulk`, `get_attendance_status_bulk`, and `check_attendance_exists`.

### functions/telegram-webhook/db/schedule.ts

Wraps schedule and enrollment queries. It must not contain business logic.

### functions/telegram-webhook/db/stats.ts

Wraps the `get_attendance_summary` RPC. It returns a compact object with total classes, attended classes, and percentage.

### functions/telegram-webhook/jobs/reminders.ts

Defines `runReminders()`, a cron-triggered job entrypoint placeholder. It must not import Telegram or bot routing and should only use domain/db modules when implemented.

### functions/telegram-webhook/jobs/dailyBrief.ts

Defines `runDailyBrief()`, a cron-triggered job entrypoint placeholder. It must not import Telegram or bot routing and should only use domain/db modules when implemented.

### functions/telegram-webhook/utils/env.ts

Validates required environment variables and provides accessors. It must not import other modules.

### functions/telegram-webhook/utils/date.ts

IST date helpers (`getTodayIST`, `getTomorrowIST`) and the `TIMEZONE` constant. Pure functions only.

## RPC Usage Summary

Attendance aggregation and status are performed in Postgres RPCs to avoid heavy computation in the Edge Function.

- `mark_attendance_bulk` – batch insert attendance rows with idempotent status output.
- `delete_attendance_bulk` – batch delete attendance rows.
- `get_attendance_status_bulk` – returns per-class attendance status for a user.
- `get_attendance_summary` – returns total classes, attended classes, and percentage.

## Where to Add Features

- New commands: add a file in commands/ and register it in bot/router.ts.
- New domain logic: add in domain/ and call it from commands/callbacks.
- New database interactions: add RPC wrappers in db/ and call from domain/.
- Scheduled tasks: add in jobs/.

If a requirement cannot be expressed using current RPCs, add a new RPC in Postgres and wrap it in db/.

## Cron-Triggered vs Telegram-Triggered Execution

Telegram-triggered execution starts at the webhook and routes through grammY. Cron-triggered execution should invoke job functions directly (either via a dedicated Edge Function entrypoint or a controlled switch in the existing entrypoint) and must not register or use bot routing.

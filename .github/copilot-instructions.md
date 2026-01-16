# Copilot Instructions for Supabase & GramMY Bot Project

## Project Architecture
This project is a **Telegram Bot** hosted as a single **Supabase Edge Function** (`functions/telegram-webhook`). It uses the **Deno** runtime and **grammY** framework.

### Service Boundaries & Layers
Strictly adhere to this layered architecture:

1.  **Entrypoint (`index.ts`)**:
    - Handles incoming HTTP requests.
    - Routes based on `x-execution-mode`: "job" (cron tasks) vs default (Telegram webhook).
    - **Rule**: Minimal logic here. Just routing and initialization.
2.  **Bot Layer (`bot/`, `commands/`)**:
    - **Responsibility**: Handle Telegram updates, parse commands/callbacks, format responses.
    - **Dependencies**: Can import `domain`. **Never** import `db` directly (except for unavoidable auth middleware).
3.  **Domain Layer (`domain/`)**:
    - **Responsibility**: Pure business logic and orchestration.
    - **Rule**: **MUST NOT** import grammY types (`Context`, `NextFunction`) or specific bot instances.
    - **Input/Output**: Receives primitive types/objects, returns data structures.
4.  **Data Layer (`db/`)**:
    - **Responsibility**: Direct interaction with Supabase.
    - **Pattern**: Wraps Supabase RPCs and queries.
    - **Client**: Uses `db/client.ts` which initializes the client with the **Service Role Key** (admin access).

## Coding Conventions

### Deno & TypeScript
- **Imports**: Use explicit URL imports (`https://esm.sh/...`, `https://deno.land/...`) or relative paths with `.ts` extensions.
- **No `package.json`**: Dependencies are managed via direct imports.
- **Environment**: Use `utils/env.ts` getters (e.g., `getSupabaseUrl()`) instead of accessing `Deno.env` directly.

### Database Access
- **Location**: All DB logic resides in `db/`.
- **Pattern**: Prefer Supabase RPCs (Stored Procedures) for complex logic. Use client-side queries for simple CRUD.
- **Bulk Operations**: Prefer performing bulk inserts/updates in a single DB call (see `db/attendance.ts`).

### Edge Function Specifics
- **Execution Mode**: The function handles both webhooks and scheduled jobs.
- **Jobs**: Located in `jobs/`. Triggered via HTTP requests with `x-execution-mode: job` and `x-job-name`.
- **Timeouts**: Webhook handlers must respond quickly (<10s) to avoid Telegram retries.

## Critical Workflows

- **Running Locally**:
  `supabase functions serve telegram-webhook --no-verify-jwt`
  (Pass environment variables via `.env` file or CLI flags).

- **Deployment**:
  `supabase functions deploy telegram-webhook`

- **Debugging**:
  - Use `console.log` for Edge Function logs (viewable in Supabase Dashboard or CLI output).
  - Common issue: Telegram timeouts. Ensure heavy logic is optimized or offloaded.

## Example: Adding a New Command
1.  **`db/myFeature.ts`**: Create DB wrappers.
2.  **`domain/myFeature.ts`**: specific business logic (calling `db/`).
3.  **`commands/myFeature.ts`**: Register command, parse input, call domain, reply to user.
4.  **`bot/router.ts`**: Register the new command file.

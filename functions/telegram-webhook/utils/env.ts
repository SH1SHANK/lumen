// Environment variable validation and access

const requiredEnvVars = [
  "TELEGRAM_BOT_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// Validate all required environment variables on module load
for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export function getTelegramBotToken(): string {
  return Deno.env.get("TELEGRAM_BOT_TOKEN")!;
}

export function getSupabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL")!;
}

export function getSupabaseServiceRoleKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

export const APP_BASE_URL =
  "https://attendrix-beta.flutterflow.app/connectWithTelegram";

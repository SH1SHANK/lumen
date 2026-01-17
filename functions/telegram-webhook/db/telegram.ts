import { supabase } from "./client.ts";

/**
 * Unlinks a Telegram account by removing the chat_id → firebase_uid mapping.
 * This does NOT delete any Attendrix data or Firebase data.
 * Idempotent: safe to call even if already unlinked.
 */
export async function unlinkTelegramAccount(chatId: number): Promise<void> {
  const { error } = await supabase
    .from("telegram_user_mappings")
    .delete()
    .eq("chat_id", chatId);

  if (error) {
    throw new Error(`Failed to unlink Telegram account: ${error.message}`);
  }
}

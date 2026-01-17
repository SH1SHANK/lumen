import { unlinkTelegramAccount } from "../db/telegram.ts";

/**
 * Resets the Telegram link for a user.
 * Removes the Telegram ↔ Firebase UID mapping.
 * Does NOT delete any Attendrix data or Firebase data.
 * User must run /start again to re-link.
 */
export async function resetTelegramLink(chatId: number): Promise<void> {
  await unlinkTelegramAccount(chatId);
}

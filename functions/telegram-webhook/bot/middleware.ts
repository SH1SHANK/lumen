import { supabase } from "../db/client.ts";

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

// Authentication middleware
export async function authMiddleware(ctx: any, next: any) {
  const excludedCommands = ["/start", "/help"];
  const command = ctx.message?.text?.split(" ")[0];

  if (command && excludedCommands.includes(command)) {
    return next();
  }

  // Skip middleware for callback queries
  if (ctx.callbackQuery) {
    return next();
  }

  const uid = await getUserUid(ctx.chat?.id || 0);
  if (!uid) {
    return ctx.reply(
      "⚠️ You need to connect your account first.\n\nUse /start to link your Telegram with Attendrix."
    );
  }

  ctx.state = { firebaseUid: uid };
  return next();
}

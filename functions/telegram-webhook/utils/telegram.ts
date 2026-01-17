import type { Context } from "https://esm.sh/grammy@1.34.0";

export type TypingOptions = {
  intermediateMessage?: string;
  intermediateDelayMs?: number;
};

export async function withTyping<T>(
  ctx: Context,
  handler: () => Promise<T>,
  options: TypingOptions = {}
): Promise<T> {
  const chatId = ctx.chat?.id;

  // Immediate typing indicator
  if (chatId) {
    ctx.api.sendChatAction(chatId, "typing").catch(() => {
      // UX helper must never crash commands
    });
  }

  let completed = false;
  const delayMs = options.intermediateDelayMs ?? 3000; // 3 seconds
  const message =
    options.intermediateMessage ?? "⏳ Still working… almost there";

  const timerId = chatId
    ? setTimeout(() => {
        if (completed) return;
        ctx.reply(message).catch(() => {
          // Ignore UX helper failures
        });
      }, delayMs)
    : undefined;

  try {
    return await handler();
  } finally {
    completed = true;
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

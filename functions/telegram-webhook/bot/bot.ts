import { Bot } from "https://esm.sh/grammy@1.34.0";
import { getTelegramBotToken } from "../utils/env.ts";

export const bot = new Bot(getTelegramBotToken());
// Increase Bot API timeout to reduce transient webhook failures
bot.api.config.timeout = 20000;

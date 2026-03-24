import { Bot } from "grammy";
import { env } from "../config/env";
import { handleCallbackQuery } from "./handlers/callback";
import { handleMessage } from "./handlers/message";
import { handleSettings } from "./handlers/settings";
import { handleStart } from "./handlers/start";
import { handleVoice } from "./handlers/voice";

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", handleStart);
  bot.command("settings", handleSettings);
  bot.on("message:voice", handleVoice);
  bot.on("message:text", handleMessage);
  bot.on("callback_query:data", handleCallbackQuery);

  return bot;
}

export async function startBot(): Promise<Bot> {
  const bot = createBot();
  await bot.start();
  console.log("LangBistro bot is running...");
  return bot;
}

import { Bot } from "grammy";
import { env } from "../config/env";
import { handleMessage } from "./handlers/message";
import { handleStart } from "./handlers/start";
import { handleVoice } from "./handlers/voice";

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", handleStart);
  bot.on("message:voice", handleVoice);
  bot.on("message:text", handleMessage);

  return bot;
}

export async function startBot(): Promise<void> {
  const bot = createBot();
  await bot.start();
  console.log("LangBistro bot is running...");
}

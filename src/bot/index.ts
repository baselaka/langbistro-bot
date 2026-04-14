import { Bot } from "grammy";
import { env } from "../config/env";
import { startInactivityJob } from "../jobs/inactivityJob";
import { startWordDeliveryJob } from "../jobs/wordDelivery";
import { handleCallbackQuery } from "./handlers/callback";
import { handleMessage } from "./handlers/message";
import { handleSettings } from "./handlers/settings";
import { handleStart } from "./handlers/start";
import { handleSubscribe } from "./handlers/subscribe";
import { handleVoice } from "./handlers/voice";

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", handleStart);
  bot.command("settings", handleSettings);
  bot.command("subscribe", handleSubscribe);
  bot.on("message:voice", handleVoice);
  bot.on("message:text", handleMessage);
  bot.on("callback_query:data", handleCallbackQuery);

  return bot;
}

export function startScheduledJobs(bot: Bot): void {
  startWordDeliveryJob(bot);
  startInactivityJob(bot);
}

export async function startBot(): Promise<Bot> {
  const bot = createBot();
  process.on("SIGTERM", async () => {
    console.log("[Bot] SIGTERM received — stopping bot gracefully");
    bot.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[Bot] SIGINT received — stopping bot gracefully");
    bot.stop();
    process.exit(0);
  });
  await bot.start();
  console.log("LangBistro bot is running...");
  return bot;
}

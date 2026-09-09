import { Bot, GrammyError } from "grammy";
import { env } from "../config/env";
import { startInactivityJob } from "../jobs/inactivityJob";
import { startWordDeliveryJob } from "../jobs/wordDelivery";
import { handleCallbackQuery } from "./handlers/callback";
import { handleDone } from "./handlers/done";
import { handleGrant } from "./handlers/grant";
import { handleInterfaceCommand } from "./handlers/interface";
import { handleLanguageCommand } from "./handlers/language";
import { handleMessage } from "./handlers/message";
import { handleSettings } from "./handlers/settings";
import { handleStart } from "./handlers/start";
import { handleSubscribe } from "./handlers/subscribe";
import { handleUnban } from "./handlers/unban";
import { handleVoice } from "./handlers/voice";

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", handleStart);
  bot.command("language", handleLanguageCommand);
  bot.command("interface", handleInterfaceCommand);
  bot.command("settings", handleSettings);
  bot.command("done", handleDone);
  bot.command("subscribe", handleSubscribe);
  bot.command("grant", handleGrant);
  bot.command("unban", handleUnban);
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
  async function startBot(): Promise<void> {
    try {
      await bot.start();
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 409) {
        console.warn("[Bot] 409 conflict — another instance still connected. Waiting 35s before retry...");
        await new Promise((resolve) => setTimeout(resolve, 35_000));
        return startBot();
      }
      throw err;
    }
  }

  await startBot();
  console.log("LangBistro bot is running...");
  return bot;
}

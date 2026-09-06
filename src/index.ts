import { createBot, startScheduledJobs } from "./bot";
import { syncBotCommands } from "./bot/commands";
import { startServer } from "./server";

async function main(): Promise<void> {
  const bot = createBot();
  bot.catch((err) => {
    const safeUpdate = JSON.stringify(err.ctx?.update)
      ?.replace(/\d{8,}:[A-Za-z0-9_-]{35}/g, "[REDACTED_TOKEN]");
    console.error("Bot error:", err.message, safeUpdate);
  });
  startScheduledJobs(bot);
  startServer();
  console.log("Starting LangBistro bot...");
  bot.start({
    onStart: async () => {
      try {
        await syncBotCommands(bot);
      } catch (error) {
        console.error("Failed to sync Telegram command menu:", error);
      }
      console.log("LangBistro bot is running...");
    },
  });
}

main().catch((error) => {
  console.error("Failed to start LangBistro bot:", error);
  process.exit(1);
});

import { isRailwayPrEnvironment } from "./config/runtime";
import { startHealthServer } from "./server/health";

async function main(): Promise<void> {
  if (isRailwayPrEnvironment()) {
    console.log("[Boot] Railway PR environment — health check only (no Telegram polling or cron)");
    startHealthServer();
    return;
  }

  const { GrammyError } = await import("grammy");
  const { createBot, startScheduledJobs } = await import("./bot");
  const { syncBotCommands } = await import("./bot/commands");
  const { startServer } = await import("./server");

  const bot = createBot();
  bot.catch((err) => {
    const safeUpdate = JSON.stringify(err.ctx?.update)?.replace(
      /\d{8,}:[A-Za-z0-9_-]{35}/g,
      "[REDACTED_TOKEN]"
    );
    console.error("Bot error:", err.message, safeUpdate);
  });
  startScheduledJobs(bot);
  startServer();
  console.log("Starting LangBistro bot...");

  const startPolling = async (): Promise<void> => {
    try {
      await bot.start({
        onStart: async () => {
          try {
            await syncBotCommands(bot);
          } catch (error) {
            console.error("Failed to sync Telegram command menu:", error);
          }
          console.log("LangBistro bot is running...");
        },
      });
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 409) {
        console.warn("[Bot] 409 conflict — another instance still connected. Waiting 35s before retry...");
        await new Promise((resolve) => setTimeout(resolve, 35_000));
        return startPolling();
      }
      throw err;
    }
  };

  await startPolling();
}

main().catch((error) => {
  console.error("Failed to start LangBistro bot:", error);
  process.exit(1);
});

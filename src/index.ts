import { createBot } from "./bot";
import { startWordDeliveryJob } from "./jobs/wordDelivery";

async function main(): Promise<void> {
  const bot = createBot();
  startWordDeliveryJob(bot);
  console.log("Starting LangBistro bot...");
  bot.start({
    onStart: () => console.log("LangBistro bot is running..."),
  });
}

main().catch((error) => {
  console.error("Failed to start LangBistro bot:", error);
  process.exit(1);
});

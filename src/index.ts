import { startBot } from "./bot";

startBot().catch((error) => {
  console.error("Failed to start LangBistro bot:", error);
  process.exit(1);
});

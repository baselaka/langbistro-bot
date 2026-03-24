import "dotenv/config";
import { seedVocabulary } from "./vocabulary";

seedVocabulary().catch((error) => {
  console.error(error);
  process.exit(1);
});

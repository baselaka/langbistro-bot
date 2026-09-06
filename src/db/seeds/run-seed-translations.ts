import "dotenv/config";
import { seedVocabularyTranslations } from "./vocabulary-translations";

seedVocabularyTranslations()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

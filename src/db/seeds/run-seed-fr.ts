import "dotenv/config";
import { seedVocabularyFr } from "./vocabulary-fr";

seedVocabularyFr()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

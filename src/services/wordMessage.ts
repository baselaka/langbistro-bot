import { InlineKeyboard } from "grammy";
import { t, tMd2, type InterfaceLanguage } from "../i18n";
import { escapeMarkdownV2 } from "../utils/markdown";
import type { DailyWord } from "./srs";

function keycapForIndex(index: number): string {
  const n = index + 1;
  if (n === 10) {
    return "1️⃣0️⃣";
  }
  return `${n}️⃣`;
}

export function buildWordMessage(
  words: DailyWord[],
  locale: InterfaceLanguage = "en"
): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const blocks: string[] = [tMd2(locale, "daily.wordsHeader"), ""];

  words.forEach((w, index) => {
    const emoji = keycapForIndex(index);
    const word = escapeMarkdownV2(w.word);
    const translation = escapeMarkdownV2(w.translation ?? "");
    const example = escapeMarkdownV2(w.example_sentence ?? "");
    const dueMark = w.kind === "due" ? " 🔁" : "";
    blocks.push(`${emoji} *${word}*${dueMark} — ${translation}\n   _"${example}"_`);
    blocks.push("");
  });

  blocks.push(escapeMarkdownV2(t(locale, "daily.goalLine")));

  const keyboard = new InlineKeyboard();
  words.forEach((w, i) => {
    keyboard.text(`🔊 ${w.word}`, `listen_word:${w.id}`);
    if ((i + 1) % 3 === 0 && i < words.length - 1) {
      keyboard.row();
    }
  });

  return {
    text: blocks.join("\n").trimEnd(),
    keyboard,
  };
}

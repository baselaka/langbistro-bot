import { InlineKeyboard } from "grammy";
import { t, type InterfaceLanguage } from "../i18n";

const TIME_SLOTS = [
  { callback: "08:00", key: "button.time0800" },
  { callback: "11:00", key: "button.time1100" },
  { callback: "14:00", key: "button.time1400" },
  { callback: "17:00", key: "button.time1700" },
  { callback: "20:00", key: "button.time2000" },
  { callback: "23:00", key: "button.time2300" },
] as const;

export function timePickerKeyboard(
  locale: InterfaceLanguage,
  prefix: "onboarding_time" | "settings_time"
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  TIME_SLOTS.forEach((slot, index) => {
    keyboard.text(t(locale, slot.key), `${prefix}:${slot.callback}`);
    if (index % 2 === 1 && index < TIME_SLOTS.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
}

export function levelPickerKeyboard(
  locale: InterfaceLanguage,
  prefix: "onboarding_level" | "settings_level"
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text(t(locale, "button.beginner"), `${prefix}:beginner`)
    .text(t(locale, "button.intermediate"), `${prefix}:intermediate`);
  if (prefix === "settings_level") {
    keyboard.text(t(locale, "button.advanced"), `${prefix}:advanced`);
  } else {
    keyboard.row().text(t(locale, "button.advanced"), `${prefix}:advanced`);
  }
  return keyboard;
}

export function interfaceLanguageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("English", "settings_interface:en")
    .text("Español", "settings_interface:es")
    .row()
    .text("Português", "settings_interface:pt")
    .text("Русский", "settings_interface:ru");
}

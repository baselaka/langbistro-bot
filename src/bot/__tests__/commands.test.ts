import { describe, expect, it } from "vitest";
import { botCommandsFor, COMMAND_SCOPES } from "../commands";
import { interfaceLanguageKeyboard } from "../keyboards";

describe("bot command menu", () => {
  it("lists interface next to language in every locale", () => {
    for (const locale of ["en", "es", "pt", "ru"] as const) {
      const commands = botCommandsFor(locale);
      expect(commands.map((item) => item.command)).toEqual([
        "start",
        "language",
        "interface",
        "settings",
        "done",
        "subscribe",
      ]);
      expect(commands.every((item) => item.description.length > 0)).toBe(true);
    }
  });

  it("uses locale-specific command descriptions", () => {
    expect(botCommandsFor("en").find((item) => item.command === "interface")?.description).toContain(
      "hints"
    );
    expect(botCommandsFor("ru").find((item) => item.command === "interface")?.description).toContain(
      "подсказок"
    );
  });

  it("publishes commands to private chats, not only the default scope", () => {
    expect(COMMAND_SCOPES.map((scope) => scope.type)).toEqual(["default", "all_private_chats"]);
  });
});

describe("interface language keyboard", () => {
  it("marks the current locale and keeps settings_interface callbacks", () => {
    const buttons = interfaceLanguageKeyboard("pt").inline_keyboard.flat();
    expect(buttons.map((button) => button.callback_data)).toEqual([
      "settings_interface:en",
      "settings_interface:es",
      "settings_interface:pt",
      "settings_interface:ru",
    ]);
    expect(buttons.find((button) => button.callback_data === "settings_interface:pt")?.text).toBe(
      "Português ✓"
    );
    expect(buttons.find((button) => button.callback_data === "settings_interface:en")?.text).toBe(
      "English"
    );
  });
});

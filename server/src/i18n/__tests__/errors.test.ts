import { describe, expect, it } from "vitest";
import errorsMessages from "../errors.json" with { type: "json" };
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  hasErrorCode,
  listErrorCodes,
  resolveLocale,
  tError,
} from "../index.js";

type MessageTable = Record<string, string>;

const tables = errorsMessages as Record<string, MessageTable>;

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/{{\s*([A-Za-z0-9_.-]+)\s*}}/g), (match) => match[1]).sort();
}

describe("server i18n errors dictionary", () => {
  it("ships a message table for every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(tables[locale], `missing errors table for ${locale}`).toBeTypeOf("object");
      expect(Object.keys(tables[locale]).length).toBeGreaterThan(0);
    }
  });

  it("keeps identical error codes across every locale (locale-validation parity)", () => {
    const referenceKeys = Object.keys(tables[DEFAULT_LOCALE]).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(tables[locale]).sort(), `key drift in ${locale}`).toEqual(referenceKeys);
    }
  });

  it("keeps interpolation placeholders aligned across locales", () => {
    for (const [code, reference] of Object.entries(tables[DEFAULT_LOCALE])) {
      const expected = placeholders(reference);
      for (const locale of SUPPORTED_LOCALES) {
        expect(placeholders(tables[locale][code]), `${locale}:${code}`).toEqual(expected);
      }
    }
  });

  it("translates known codes and falls back to the code for unknown ones", () => {
    expect(tError("notFound", "en")).toBe("Resource not found.");
    expect(tError("notFound", "zh-CN")).toBe("未找到资源。");
    expect(tError("unauthorized", "zh-CN")).toBe("您尚未登录。");
    expect(tError("does_not_exist_code", "zh-CN")).toBe("does_not_exist_code");
    expect(hasErrorCode("unauthorized")).toBe(true);
    expect(hasErrorCode("does_not_exist_code")).toBe(false);
    expect(listErrorCodes()).toContain("serverError");
  });

  it("interpolates params in both locales", () => {
    expect(tError("interactionUnresolved", "en", { id: "i-1" })).toBe(
      "Interaction i-1 has no authorized resolver.",
    );
    expect(tError("interactionUnresolved", "zh-CN", { id: "i-1" })).toBe(
      "交互 i-1 没有已授权的处理人。",
    );
  });

  it("resolves locale ids and Accept-Language headers", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-CN");
    expect(resolveLocale("zh-Hans-CN,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
    expect(resolveLocale("en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale("fr-FR,fr;q=0.9")).toBeNull();
    expect(resolveLocale(undefined)).toBeNull();
    expect(resolveLocale(null)).toBeNull();
  });

  it("falls back to English when the requested locale is unsupported", () => {
    expect(tError("notFound", "fr-FR")).toBe("Resource not found.");
  });
});

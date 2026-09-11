/**
 * 各 locale 的母语显示名(供语言切换器渲染)。
 * 覆盖 ui/src/i18n/locales/ 下的全部语言;缺失时回退到 locale 代码本身。
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  ar: "العربية",
  bn: "বাংলা",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fa: "فارسی",
  fi: "Suomi",
  fil: "Filipino",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  mr: "मराठी",
  ms: "Bahasa Melayu",
  nb: "Norsk Bokmål",
  nl: "Nederlands",
  pa: "ਪੰਜਾਬੀ",
  pl: "Polski",
  "pt-BR": "Português (Brasil)",
  "pt-PT": "Português (Portugal)",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  sw: "Kiswahili",
  ta: "தமிழ்",
  te: "తెలుగు",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  ur: "اردو",
  vi: "Tiếng Việt",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

/** 返回 locale 的显示名,缺失时回退到代码本身。 */
export function languageName(locale: string): string {
  return LANGUAGE_NAMES[locale] ?? locale;
}

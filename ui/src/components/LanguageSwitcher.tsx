import { useEffect, useState } from "react";
import { Languages } from "lucide-react";

import { getCurrentLocale, setLocale, supportedLocales, useTranslation } from "@/i18n";
import { languageName } from "@/i18n/language-names";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** 排序后的受支持语言列表(按母语显示名)。 */
function sortedLocales(): string[] {
  return [...supportedLocales].sort((a, b) => languageName(a).localeCompare(languageName(b)));
}

/**
 * 界面语言切换器。切换后调用 setLocale(持久化到 localStorage + i18n.changeLanguage)。
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [current, setCurrent] = useState<string>(() => getCurrentLocale());

  // 跟随外部语言变化(如其它入口触发的切换)
  useEffect(() => {
    const handler = (lng: string) => setCurrent(lng);
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, [i18n]);

  const locales = sortedLocales();

  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
      <Select
        value={current}
        onValueChange={(value) => {
          void setLocale(value);
        }}
      >
        <SelectTrigger aria-label="Interface language" className="w-56 font-sans">
          <SelectValue>{languageName(current)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {locales.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {languageName(locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

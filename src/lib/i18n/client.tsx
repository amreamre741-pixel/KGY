"use client";

import { createContext, useContext, type ReactNode } from "react";
import { dictionaries, type Lang } from "./dict";

const I18nContext = createContext<Lang>("ar");

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <I18nContext value={lang}>{children}</I18nContext>;
}

export function useI18n() {
  const lang = useContext(I18nContext);
  return { lang, t: dictionaries[lang] };
}

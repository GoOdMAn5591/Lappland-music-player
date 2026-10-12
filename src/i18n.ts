import { useSyncExternalStore } from "react";
import { EN } from "./i18n.en";

/**
 * Two languages: Chinese (the source text) and English.
 *
 * UI strings are written in Chinese and wrapped in t(); the English table
 * (i18n.en.ts) is keyed by that same Chinese text, with {name}-style
 * placeholders. A missing entry falls back to the Chinese.
 */
export type Lang = "zh" | "en";

const KEY = "tavern-lang";
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* no saved choice */
  }
  // The host's own bar stays Chinese until switched; a friend arriving from an
  // invite link gets their browser's language.
  const invited = new URLSearchParams(location.search).has("room");
  if (!invited) return "zh";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => /^zh\b/i.test(l || "")) ? "zh" : "en";
}

let current: Lang = detect();
applyDocumentLang(current);

function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.title = lang === "en" ? "Lappland's Tavern · Music Bar" : "无序酒馆菜单播放器";
}

export function getLang() {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* choice lasts this session */
  }
  applyDocumentLang(lang);
  listeners.forEach((listener) => listener());
}

/** Re-render on language change. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLang,
    getLang,
  );
}

export type Vars = Record<string, string | number | undefined>;

export function t(zh: string, vars?: Vars): string {
  let text = current === "en" ? (EN[zh] ?? zh) : zh;
  if (vars)
    text = text.replace(/\{(\w+)\}/g, (_, key: string) =>
      vars[key] === undefined ? "" : String(vars[key]),
    );
  return text;
}

/** Joins a list the way each language does ("、" vs ", "). */
export const listJoin = (items: string[]) => items.join(current === "en" ? ", " : "、");

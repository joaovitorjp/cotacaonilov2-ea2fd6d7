import { DICTIONARY, LANGS, type Lang } from "./dictionary";

export { LANGS };
export type { Lang };

const STORAGE_KEY = "cotarme_lang";
const ORIGINAL = Symbol("i18n-original");

type Carrier = { [ORIGINAL]?: string };

let current: Lang = readStored();
const listeners = new Set<(l: Lang) => void>();
let observer: MutationObserver | null = null;
let scheduled = false;

function readStored(): Lang {
  if (typeof localStorage === "undefined") return "pt";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "es" || v === "pt" ? v : "pt";
}

export function getLang(): Lang {
  return current;
}

export function subscribeLang(cb: (l: Lang) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Traduz um texto avulso (usado em código quando necessário). */
export function t(text: string, lang: Lang = current): string {
  if (lang === "pt") return text;
  const key = text.trim();
  const entry = DICTIONARY[key];
  if (!entry) return text;
  const translated = entry[lang];
  // preserva espaços em volta
  return text.replace(key, translated);
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE"]);

function translateTextNode(node: Text) {
  const carrier = node as unknown as Carrier;
  const original = carrier[ORIGINAL] ?? node.nodeValue ?? "";
  const key = original.trim();
  if (!key || key.length > 220) return;
  if (current === "pt") {
    if (carrier[ORIGINAL] !== undefined && node.nodeValue !== original) node.nodeValue = original;
    return;
  }
  const entry = DICTIONARY[key];
  if (!entry) return;
  const next = original.replace(key, entry[current as "en" | "es"]);
  if (next !== node.nodeValue) {
    carrier[ORIGINAL] = original;
    node.nodeValue = next;
  }
}

function translateAttributes(el: Element) {
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    const store = `data-i18n-${attr}`;
    const original = el.getAttribute(store) ?? value;
    const key = original.trim();
    if (!key) continue;
    if (current === "pt") {
      if (el.hasAttribute(store)) {
        el.setAttribute(attr, original);
        el.removeAttribute(store);
      }
      continue;
    }
    const entry = DICTIONARY[key];
    if (!entry) continue;
    const next = original.replace(key, entry[current as "en" | "es"]);
    if (next !== value) {
      el.setAttribute(store, original);
      el.setAttribute(attr, next);
    }
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName)) return;

  translateAttributes(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has((node as Element).tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node as Text);
    else translateAttributes(node as Element);
    node = walker.nextNode();
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    if (document.body) walk(document.body);
  });
}

/** Inicia a tradução automática de toda a interface. */
export function startI18n() {
  if (typeof document === "undefined" || observer) return;
  document.documentElement.lang = current;
  observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === "characterData" || m.addedNodes.length || m.type === "attributes") {
        schedule();
        return;
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  schedule();
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignora */
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    // Em pt precisamos restaurar os textos originais antes de continuar.
    if (document.body) walk(document.body);
  }
  listeners.forEach(cb => cb(lang));
  schedule();
}

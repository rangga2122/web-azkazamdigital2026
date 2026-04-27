"use client";

import { useEffect, useId, useRef } from "react";
import type { EmbeddedHtmlDocument, EmbeddedHtmlScript } from "@/lib/utils";

type EmbeddedHtmlPageProps = {
  document: EmbeddedHtmlDocument;
};

export function EmbeddedHtmlPage({ document }: EmbeddedHtmlPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/:/g, "-");
  const scopeSelector = `[data-embedded-html-scope="${instanceId}"]`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.setAttribute("data-embedded-html-scope", instanceId);
    host.innerHTML = document.bodyHtml;
    ensureLegacyScriptTargets(host);

    const cleanupHeadAssets = syncHeadAssets(document.headHtml);
    const cleanupStyles = syncStyleAssets(
      document.styles,
      instanceId,
      scopeSelector
    );
    const cleanupScripts = executeEmbeddedScripts(host, document.scripts);
    const cleanupFallbackInteractions =
      document.scripts.length === 0
        ? attachFallbackInteractions(host)
        : () => {};

    return () => {
      cleanupScripts();
      cleanupFallbackInteractions();
      cleanupStyles();
      cleanupHeadAssets();
      host.innerHTML = "";
    };
  }, [
    document.bodyHtml,
    document.headHtml,
    document.scripts,
    document.styles,
    instanceId,
    scopeSelector,
  ]);

  return (
    <div
      ref={hostRef}
      className="block w-full bg-white"
      suppressHydrationWarning
    />
  );
}

function ensureLegacyScriptTargets(root: HTMLElement) {
  ensureHiddenElement(root, "navToggle");
  ensureHiddenElement(root, "mainNav");
}

function ensureHiddenElement(root: HTMLElement, id: string) {
  if (root.querySelector(`#${cssEscape(id)}`) || window.document.getElementById(id)) {
    return;
  }

  const element = window.document.createElement("div");
  element.id = id;
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  root.prepend(element);
}

function syncHeadAssets(headHtml: string) {
  if (!headHtml) {
    return () => {};
  }

  const template = window.document.createElement("template");
  template.innerHTML = headHtml;

  const createdNodes: HTMLElement[] = [];

  template.content.querySelectorAll("link[rel]").forEach((sourceLink) => {
    const href = sourceLink.getAttribute("href");
    const rel = sourceLink.getAttribute("rel");
    if (!href || !rel) return;

    const existing = window.document.head.querySelector(
      `link[rel="${cssEscape(rel)}"][href="${cssEscape(href)}"]`
    );

    if (existing) return;

    const link = window.document.createElement("link");
    Array.from(sourceLink.attributes).forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) return;
      link.setAttribute(attribute.name, attribute.value);
    });

    if (link.getAttribute("media")?.toLowerCase() === "print") {
      link.setAttribute("media", "all");
    }

    link.setAttribute("data-embedded-html-asset", "true");
    window.document.head.appendChild(link);
    createdNodes.push(link);
  });

  return () => {
    createdNodes.forEach((node) => node.remove());
  };
}

function syncStyleAssets(
  styles: string,
  instanceId: string,
  scopeSelector: string
) {
  if (!styles.trim()) {
    return () => {};
  }

  const style = window.document.createElement("style");
  style.setAttribute("data-embedded-html-style", instanceId);
  style.textContent = `
${scopeSelector} img {
  display: inline-block;
}

${scopeEmbeddedStyles(styles, scopeSelector)}
`;
  window.document.head.appendChild(style);

  return () => {
    style.remove();
  };
}

function scopeEmbeddedStyles(styles: string, scopeSelector: string) {
  return transformCssBlocks(styles, scopeSelector);
}

function transformCssBlocks(css: string, scopeSelector: string): string {
  let output = "";
  let cursor = 0;

  while (cursor < css.length) {
    const openBrace = css.indexOf("{", cursor);
    if (openBrace === -1) {
      output += css.slice(cursor);
      break;
    }

    const selectorChunk = css.slice(cursor, openBrace);
    const closeBrace = findMatchingBrace(css, openBrace);

    if (closeBrace === -1) {
      output += css.slice(cursor);
      break;
    }

    const blockContent = css.slice(openBrace + 1, closeBrace);
    const trimmedSelector = selectorChunk.trim();

    if (!trimmedSelector) {
      output += `${selectorChunk}{${blockContent}}`;
      cursor = closeBrace + 1;
      continue;
    }

    if (
      trimmedSelector.startsWith("@media") ||
      trimmedSelector.startsWith("@supports") ||
      trimmedSelector.startsWith("@container") ||
      trimmedSelector.startsWith("@layer")
    ) {
      output += `${selectorChunk}{${transformCssBlocks(
        blockContent,
        scopeSelector
      )}}`;
      cursor = closeBrace + 1;
      continue;
    }

    if (trimmedSelector.startsWith("@")) {
      output += `${selectorChunk}{${blockContent}}`;
      cursor = closeBrace + 1;
      continue;
    }

    output += `${scopeSelectorList(
      selectorChunk,
      scopeSelector
    )}{${blockContent}}`;
    cursor = closeBrace + 1;
  }

  return output;
}

function findMatchingBrace(css: string, openBraceIndex: number) {
  let depth = 0;

  for (let index = openBraceIndex; index < css.length; index += 1) {
    const char = css[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function scopeSelectorList(selectorText: string, scopeSelector: string) {
  const selectors: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of selectorText) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;

    if (char === "," && depth === 0) {
      selectors.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) {
    selectors.push(current);
  }

  return selectors
    .map((selector) => scopeSingleSelector(selector, scopeSelector))
    .join(", ");
}

function scopeSingleSelector(selector: string, scopeSelector: string) {
  const trimmedSelector = selector.trim();
  if (!trimmedSelector) return trimmedSelector;

  if (
    trimmedSelector === "html" ||
    trimmedSelector === "body" ||
    trimmedSelector === ":root"
  ) {
    return scopeSelector;
  }

  if (trimmedSelector.includes(":root")) {
    return trimmedSelector.replaceAll(":root", scopeSelector);
  }

  if (/^html(?=[\s.#:[>~+]|$)/.test(trimmedSelector)) {
    return trimmedSelector.replace(/^html\b/, scopeSelector);
  }

  if (/^body(?=[\s.#:[>~+]|$)/.test(trimmedSelector)) {
    return trimmedSelector.replace(/^body\b/, scopeSelector);
  }

  if (trimmedSelector.startsWith(scopeSelector)) {
    return trimmedSelector;
  }

  return `${scopeSelector} ${trimmedSelector}`;
}

function cssEscape(value: string) {
  if (
    typeof window !== "undefined" &&
    typeof window.CSS?.escape === "function"
  ) {
    return window.CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

function attachFallbackInteractions(root: HTMLElement) {
  const navToggle = root.querySelector<HTMLElement>(".nav-toggle");
  const navLinks = root.querySelector<HTMLElement>(".nav-links");

  const handleNavToggle = () => {
    navToggle?.classList.toggle("active");
    navLinks?.classList.toggle("active");
  };

  navToggle?.addEventListener("click", handleNavToggle);

  const anchorHandlers = new Map<
    HTMLAnchorElement,
    (event: MouseEvent) => void
  >();

  root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    const handler = (event: MouseEvent) => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;

      const target =
        root.querySelector<HTMLElement>(targetId) ||
        window.document.querySelector<HTMLElement>(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      navToggle?.classList.remove("active");
      navLinks?.classList.remove("active");
    };

    anchorHandlers.set(anchor, handler);
    anchor.addEventListener("click", handler);
  });

  return () => {
    navToggle?.removeEventListener("click", handleNavToggle);
    anchorHandlers.forEach((handler, anchor) => {
      anchor.removeEventListener("click", handler);
    });
  };
}

function executeEmbeddedScripts(
  root: HTMLElement,
  scripts: EmbeddedHtmlScript[]
) {
  if (scripts.length === 0) {
    return () => {};
  }

  const cleanupTasks: Array<() => void> = [];
  let cancelled = false;

  const run = async () => {
    for (const script of scripts) {
      if (cancelled) break;

      const source = await resolveScriptSource(script);
      if (!source) continue;

      const cleanup = executeDocumentScript(source, root);
      cleanupTasks.push(cleanup);
    }
  };

  void run();

  return () => {
    cancelled = true;
    cleanupTasks.forEach((cleanup) => cleanup());
  };
}

async function resolveScriptSource(script: EmbeddedHtmlScript) {
  if (script.content?.trim()) {
    return script.content;
  }

  if (!script.src) {
    return null;
  }

  try {
    const response = await fetch(script.src);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function executeDocumentScript(code: string, root: HTMLElement) {
  const cleanupTasks: Array<() => void> = [];
  const timeoutIds = new Set<number>();
  const intervalIds = new Set<number>();
  const animationFrameIds = new Set<number>();

  const setScopedTimeout = (...args: Parameters<typeof window.setTimeout>) => {
    const id = window.setTimeout(...args);
    timeoutIds.add(id);
    return id;
  };

  const clearScopedTimeout = (id?: number) => {
    if (typeof id !== "number") return;
    timeoutIds.delete(id);
    window.clearTimeout(id);
  };

  const setScopedInterval = (
    ...args: Parameters<typeof window.setInterval>
  ) => {
    const id = window.setInterval(...args);
    intervalIds.add(id);
    return id;
  };

  const clearScopedInterval = (id?: number) => {
    if (typeof id !== "number") return;
    intervalIds.delete(id);
    window.clearInterval(id);
  };

  const requestScopedAnimationFrame = (
    callback: FrameRequestCallback
  ) => {
    const id = window.requestAnimationFrame(callback);
    animationFrameIds.add(id);
    return id;
  };

  const cancelScopedAnimationFrame = (id?: number) => {
    if (typeof id !== "number") return;
    animationFrameIds.delete(id);
    window.cancelAnimationFrame(id);
  };

  const scopedDocument = createDocumentProxy(root, cleanupTasks);
  const scopedWindow = createWindowProxy({
    document: scopedDocument,
    self: null,
    window: null,
    setTimeout: setScopedTimeout,
    clearTimeout: clearScopedTimeout,
    setInterval: setScopedInterval,
    clearInterval: clearScopedInterval,
    requestAnimationFrame: requestScopedAnimationFrame,
    cancelAnimationFrame: cancelScopedAnimationFrame,
    scrollTo: (...args: Parameters<typeof window.scrollTo>) =>
      window.scrollTo(...args),
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) => {
      window.addEventListener(type, listener, options);
      cleanupTasks.push(() =>
        window.removeEventListener(type, listener, options)
      );
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) => {
      window.removeEventListener(type, listener, options);
    },
  });

  const runner = new Function(
    "window",
    "document",
    "root",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    code
  );

  runner(
    scopedWindow,
    scopedDocument as Document,
    root,
    setScopedTimeout,
    clearScopedTimeout,
    setScopedInterval,
    clearScopedInterval,
    requestScopedAnimationFrame,
    cancelScopedAnimationFrame
  );

  return () => {
    cleanupTasks.forEach((cleanup) => cleanup());
    timeoutIds.forEach((id) => window.clearTimeout(id));
    intervalIds.forEach((id) => window.clearInterval(id));
    animationFrameIds.forEach((id) => window.cancelAnimationFrame(id));
    timeoutIds.clear();
    intervalIds.clear();
    animationFrameIds.clear();
  };
}

function createWindowProxy(
  overrides: Record<string, unknown>
): Window & typeof globalThis {
  const scopedWindow = new Proxy(window, {
    get(target, property, receiver) {
      if (property === "window" || property === "self") {
        return scopedWindow;
      }

      if (property in overrides) {
        return overrides[property as string];
      }

      return Reflect.get(target, property, receiver);
    },
    set(target, property, value, receiver) {
      if (property === "window" || property === "self") {
        return true;
      }

      if (property in overrides) {
        overrides[property as string] = value;
        return true;
      }

      return Reflect.set(target, property, value, receiver);
    },
  });

  return scopedWindow as Window & typeof globalThis;
}

function createDocumentProxy(
  root: HTMLElement,
  cleanupTasks: Array<() => void>
) {
  const actualDocument = window.document;

  const queryWithinRoot = <T extends Element>(selector: string) => {
    if (selector === "html") {
      return actualDocument.documentElement as unknown as T;
    }
    if (selector === "body") {
      return actualDocument.body as unknown as T;
    }
    if (selector === "head") {
      return actualDocument.head as unknown as T;
    }

    return root.querySelector<T>(selector);
  };

  return {
    readyState: "complete",
    defaultView: window,
    location: actualDocument.location,
    referrer: actualDocument.referrer,
    title: actualDocument.title,
    body: actualDocument.body,
    head: actualDocument.head,
    documentElement: actualDocument.documentElement,
    querySelector: (selector: string) =>
      queryWithinRoot(selector) || actualDocument.querySelector(selector),
    querySelectorAll: (selector: string) => {
      if (selector === "html" || selector === "body" || selector === "head") {
        return actualDocument.querySelectorAll(selector);
      }

      return root.querySelectorAll(selector);
    },
    getElementById: (id: string) =>
      root.querySelector<HTMLElement>(`#${cssEscape(id)}`) ||
      actualDocument.getElementById(id),
    getElementsByClassName: (className: string) =>
      root.getElementsByClassName(className),
    getElementsByTagName: (tagName: string) => {
      if (tagName.toLowerCase() === "body") {
        return actualDocument.getElementsByTagName(tagName);
      }

      return root.getElementsByTagName(tagName);
    },
    createElement: actualDocument.createElement.bind(actualDocument),
    createElementNS: actualDocument.createElementNS.bind(actualDocument),
    createTextNode: actualDocument.createTextNode.bind(actualDocument),
    createDocumentFragment:
      actualDocument.createDocumentFragment.bind(actualDocument),
    addEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) => {
      if (type === "DOMContentLoaded") {
        const event = new Event("DOMContentLoaded");
        queueMicrotask(() => {
          if (typeof listener === "function") {
            listener.call(actualDocument, event);
            return;
          }

          listener.handleEvent(event);
        });
        return;
      }

      actualDocument.addEventListener(type, listener, options);
      cleanupTasks.push(() =>
        actualDocument.removeEventListener(type, listener, options)
      );
    },
    removeEventListener: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) => {
      if (type === "DOMContentLoaded") return;
      actualDocument.removeEventListener(type, listener, options);
    },
  };
}

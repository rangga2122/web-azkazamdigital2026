"use client";

import { useEffect, useRef } from "react";
import {
  buildScopedEmbeddedStyles,
  type EmbeddedHtmlDocument,
  type EmbeddedHtmlScript,
} from "@/lib/utils";
import type { CSSProperties, HTMLAttributes } from "react";

type EmbeddedHtmlPageProps = {
  document: EmbeddedHtmlDocument;
  scopeId: string;
};

export function EmbeddedHtmlPage({
  document,
  scopeId,
}: EmbeddedHtmlPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scopeSelector = `[data-embedded-html-scope="${scopeId}"]`;
  const initialHostProps = buildInitialHostProps(document.bodyAttributes);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.setAttribute("data-embedded-html-scope", scopeId);
    if (host.innerHTML !== document.bodyHtml) {
      host.innerHTML = document.bodyHtml;
    }
    applyHostAttributes(host, document.bodyAttributes);
    ensureLegacyScriptTargets(host);

    const cleanupHeadAssets = syncHeadAssets(document.headHtml);
    const cleanupTitle = syncDocumentTitle(document.title);
    const cleanupStyles = syncStyleAssets(
      document.styles,
      scopeId,
      scopeSelector
    );
    const cleanupInternalAnchors = attachInternalAnchorNavigation(host);
    const cleanupScripts = executeEmbeddedScripts(host, document.scripts);
    const cleanupFallbackInteractions =
      document.scripts.length === 0
        ? attachFallbackInteractions(host)
        : () => {};

    return () => {
      cleanupScripts();
      cleanupFallbackInteractions();
      cleanupInternalAnchors();
      cleanupStyles();
      cleanupTitle();
      cleanupHeadAssets();
      host.innerHTML = "";
    };
  }, [
    document.bodyHtml,
    document.bodyAttributes,
    document.headHtml,
    document.scripts,
    document.styles,
    document.title,
    scopeId,
    scopeSelector,
  ]);

  return (
    <div
      ref={hostRef}
      {...initialHostProps}
      data-embedded-html-scope={scopeId}
      dangerouslySetInnerHTML={{ __html: document.bodyHtml }}
      suppressHydrationWarning
    />
  );
}

function buildInitialHostProps(
  attributes: Record<string, string | true>
): HTMLAttributes<HTMLDivElement> {
  const props: HTMLAttributes<HTMLDivElement> = {
    className: "block w-full bg-white",
  };

  const className = typeof attributes.class === "string" ? attributes.class : "";
  if (className) {
    props.className = `${props.className} ${className}`.trim();
  }

  const styleText = typeof attributes.style === "string" ? attributes.style : "";
  if (styleText) {
    props.style = parseInlineStyle(styleText);
  }

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class" || name === "style" || name === "id") continue;

    if (value === true) {
      props[name as keyof HTMLAttributes<HTMLDivElement>] = "";
      continue;
    }

    props[name as keyof HTMLAttributes<HTMLDivElement>] = value;
  }

  return props;
}

function parseInlineStyle(styleText: string): CSSProperties {
  const style: CSSProperties = {};
  const styleMap = style as Record<string, string>;

  styleText.split(";").forEach((declaration) => {
    const [rawProperty, ...rawValueParts] = declaration.split(":");
    const property = rawProperty?.trim();
    const value = rawValueParts.join(":").trim();

    if (!property || !value) return;

    const camelProperty = property.replace(/-([a-z])/g, (_, char: string) =>
      char.toUpperCase()
    );

    styleMap[camelProperty] = value;
  });

  return style;
}

function syncDocumentTitle(title: string | null) {
  if (!title) {
    return () => {};
  }

  const previousTitle = window.document.title;
  window.document.title = title;

  return () => {
    window.document.title = previousTitle;
  };
}

function applyHostAttributes(
  host: HTMLElement,
  attributes: Record<string, string | true>
) {
  host.className = "block w-full bg-white";
  host.removeAttribute("style");

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "id") continue;

    if (value === true) {
      host.setAttribute(name, "");
      continue;
    }

    host.setAttribute(name, value);
  }
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

    const existing = window.document.querySelector(
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

  const existing = window.document.querySelector(
    `style[data-embedded-html-style="${cssEscape(instanceId)}"]`
  );
  if (existing) {
    return () => {};
  }

  const style = window.document.createElement("style");
  style.setAttribute("data-embedded-html-style", instanceId);
  style.textContent = buildScopedEmbeddedStyles(styles, scopeSelector);
  window.document.head.appendChild(style);

  return () => {
    style.remove();
  };
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

function attachInternalAnchorNavigation(root: HTMLElement) {
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
      event.stopImmediatePropagation();
      scrollEmbeddedTargetIntoView(target, root);
    };

    anchorHandlers.set(anchor, handler);
    anchor.addEventListener("click", handler, true);
  });

  return () => {
    anchorHandlers.forEach((handler, anchor) => {
      anchor.removeEventListener("click", handler, true);
    });
  };
}

function scrollEmbeddedTargetIntoView(target: HTMLElement, root: HTMLElement) {
  const scrollContainer = findScrollableContainer(target, root);

  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top =
      targetRect.top - containerRect.top + scrollContainer.scrollTop - 16;

    scrollContainer.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
    return;
  }

  const top = target.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function findScrollableContainer(
  target: HTMLElement,
  root: HTMLElement
): HTMLElement | null {
  let current: HTMLElement | null = target.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY.toLowerCase();
    const canScroll =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight;

    if (canScroll) {
      return current;
    }

    if (current === root) {
      break;
    }

    current = current.parentElement;
  }

  return null;
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
    const inlineBuffer: string[] = [];

    const flushInlineBuffer = () => {
      if (inlineBuffer.length === 0) {
        return;
      }

      cleanupTasks.push(executeDocumentScript(inlineBuffer.join("\n;\n"), root));
      inlineBuffer.length = 0;
    };

    for (const script of scripts) {
      if (cancelled) break;

      const source = await resolveScriptSource(script);
      if (!source) continue;

      if (source.type === "inline") {
        inlineBuffer.push(source.content);
        continue;
      }

      flushInlineBuffer();
      cleanupTasks.push(
        await injectExternalScript(source.src, source.attributes)
      );
    }

    flushInlineBuffer();
  };

  void run();

  return () => {
    cancelled = true;
    cleanupTasks.forEach((cleanup) => cleanup());
  };
}

async function resolveScriptSource(script: EmbeddedHtmlScript) {
  if (script.content?.trim()) {
    return {
      type: "inline" as const,
      content: script.content,
    };
  }

  if (!script.src) {
    return null;
  }

  return {
    type: "external" as const,
    src: script.src,
    attributes: script.attributes,
  };
}

async function injectExternalScript(
  src: string,
  attributes: Record<string, string | true>
) {
  const existing = window.document.head.querySelector<HTMLScriptElement>(
    `script[src="${cssEscape(src)}"]`
  );

  if (existing) {
    return () => {};
  }

  const script = window.document.createElement("script");
  script.src = src;

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "src") continue;
    if (value === true) {
      script.setAttribute(name, "");
      continue;
    }
    script.setAttribute(name, value);
  }

  script.setAttribute("data-embedded-html-script", "true");

  await new Promise<void>((resolve) => {
    script.onload = () => resolve();
    script.onerror = () => resolve();
    window.document.head.appendChild(script);
  });

  return () => {
    script.remove();
  };
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
  const globalNames = extractGlobalDeclarationNames(code);
  const previousGlobals = new Map<
    string,
    { existed: boolean; value: unknown }
  >();

  globalNames.forEach((name) => {
    previousGlobals.set(name, {
      existed: Object.prototype.hasOwnProperty.call(window, name),
      value: (window as unknown as Record<string, unknown>)[name],
    });
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
    `${code}\n;${buildGlobalExposureScript(globalNames)}`
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
    previousGlobals.forEach((previous, name) => {
      if (previous.existed) {
        (window as unknown as Record<string, unknown>)[name] = previous.value;
        return;
      }

      delete (window as unknown as Record<string, unknown>)[name];
    });
    timeoutIds.clear();
    intervalIds.clear();
    animationFrameIds.clear();
  };
}

function extractGlobalDeclarationNames(code: string) {
  const names = new Set<string>();
  const declarationRegex =
    /(?:^|[\n;])\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(|(?:^|[\n;])\s*class\s+([A-Za-z_$][\w$]*)\b|(?:^|[\n;])\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;

  for (const match of code.matchAll(declarationRegex)) {
    const name = match[1] || match[2] || match[3];
    if (!name) continue;
    names.add(name);
  }

  return names;
}

function buildGlobalExposureScript(names: Set<string>) {
  if (names.size === 0) {
    return "";
  }

  return Array.from(names)
    .map(
      (name) =>
        `try { window[${JSON.stringify(name)}] = ${name}; } catch (_) {}`
    )
    .join("\n");
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
    body: root,
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
        return [root] as unknown as HTMLCollectionOf<Element>;
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

"use client";

import { useEffect } from "react";

type ExternalHeadLinksProps = {
  html: string;
};

export function ExternalHeadLinks({ html }: ExternalHeadLinksProps) {
  useEffect(() => {
    if (!html) return;

    const template = window.document.createElement("template");
    template.innerHTML = html;

    const createdNodes: HTMLElement[] = [];

    template.content
      .querySelectorAll("link[rel]")
      .forEach((sourceLink) => {
        const href = sourceLink.getAttribute("href");
        const rel = sourceLink.getAttribute("rel");
        if (!href || !rel) return;
        if (!/^(stylesheet|preconnect|preload)$/i.test(rel)) return;

        const selector = `link[rel="${cssEscape(rel)}"][href="${cssEscape(href)}"]`;
        if (window.document.head.querySelector(selector)) return;

        const link = window.document.createElement("link");
        Array.from(sourceLink.attributes).forEach((attribute) => {
          if (attribute.name.toLowerCase().startsWith("on")) return;
          link.setAttribute(attribute.name, attribute.value);
        });

        if (link.getAttribute("media")?.toLowerCase() === "print") {
          link.setAttribute("media", "all");
        }

        link.setAttribute("data-external-head-link", "true");
        window.document.head.appendChild(link);
        createdNodes.push(link);
      });

    return () => {
      createdNodes.forEach((node) => node.remove());
    };
  }, [html]);

  return null;
}

function cssEscape(value: string) {
  if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
    return window.CSS.escape(value);
  }

  return value.replace(/["\\]/g, "\\$&");
}

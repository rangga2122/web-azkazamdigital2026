"use client";

import { useEffect, useRef } from "react";
import type { EmbeddedHtmlDocument } from "@/lib/utils";

type EmbeddedHtmlPageProps = {
  document: EmbeddedHtmlDocument;
};

export function EmbeddedHtmlPage({ document }: EmbeddedHtmlPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      ${document.headHtml}
      <style>
        ${buildShadowStyles(document.styles)}
      </style>
      ${document.bodyHtml}
    `;

    const preloader = shadow.querySelector<HTMLElement>(".preloader");
    if (preloader) {
      preloader.classList.add("fade-out");
      window.setTimeout(() => {
        preloader.style.setProperty("display", "none", "important");
        preloader.style.setProperty("visibility", "hidden", "important");
      }, 150);
    }

    shadow.querySelectorAll<HTMLElement>(".product-card").forEach((card) => {
      card.classList.add("animate-in");
    });

    shadow.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => {
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.removeAttribute("data-src");
      }
    });

    const navToggle = shadow.querySelector<HTMLElement>(".nav-toggle");
    const navLinks = shadow.querySelector<HTMLElement>(".nav-links");
    navToggle?.addEventListener("click", () => {
      navToggle.classList.toggle("active");
      navLinks?.classList.toggle("active");
    });

    shadow.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const targetId = anchor.getAttribute("href");
        if (!targetId || targetId === "#") return;

        const target = shadow.querySelector(targetId);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
        navToggle?.classList.remove("active");
        navLinks?.classList.remove("active");
      });
    });
  }, [document.bodyHtml, document.headHtml, document.styles]);

  return (
    <div
      ref={hostRef}
      className="block w-full bg-white"
      suppressHydrationWarning
    />
  );
}

function buildShadowStyles(styles: string) {
  const rootDeclarations = collectDeclarations(styles, ":root");
  const htmlDeclarations = collectDeclarations(styles, "html");
  const bodyDeclarations = collectDeclarations(styles, "body");

  return `
    :host {
      display: block;
      width: 100%;
      background: #fff;
      ${rootDeclarations}
      ${htmlDeclarations}
      ${bodyDeclarations}
    }
    ${styles}
  `;
}

function collectDeclarations(styles: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, "gi");
  const declarations: string[] = [];

  for (const match of styles.matchAll(regex)) {
    declarations.push(match[1].trim());
  }

  return declarations.join("\n");
}

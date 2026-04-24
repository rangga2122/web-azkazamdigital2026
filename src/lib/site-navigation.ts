export const NAV_ITEMS = [
  { key: "home", defaultLabel: "Beranda", defaultHref: "/" },
  { key: "products", defaultLabel: "Produk", defaultHref: "/produk" },
  { key: "about", defaultLabel: "Tentang", defaultHref: "/tentang-kami" },
  { key: "contact", defaultLabel: "Kontak", defaultHref: "/kontak" },
  { key: "affiliate", defaultLabel: "Afiliasi", defaultHref: "/affiliate" },
] as const;

export type NavItemKey = (typeof NAV_ITEMS)[number]["key"];

export type SiteNavLink = {
  key: NavItemKey;
  label: string;
  href: string;
};

export function resolveSiteNavLinks(
  socialLinks?: Record<string, unknown> | null
): SiteNavLink[] {
  return NAV_ITEMS.map((item) => {
    const label = socialLinks?.[`nav_${item.key}_label`];
    const href = socialLinks?.[`nav_${item.key}_href`];

    return {
      key: item.key,
      label:
        typeof label === "string" && label.trim()
          ? label
          : item.defaultLabel,
      href:
        typeof href === "string" && href.trim()
          ? href
          : item.defaultHref,
    };
  });
}

export function getNavDefaults(key: NavItemKey) {
  return NAV_ITEMS.find((item) => item.key === key) || NAV_ITEMS[0];
}

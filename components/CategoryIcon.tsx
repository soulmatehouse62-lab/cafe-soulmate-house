// Category look: an icon + accent colour, so each part of the menu is recognisable at a glance.

type IconKey = "coffee" | "tea" | "cold" | "snack" | "dessert" | "bakery" | "meal" | "other";

export interface CategoryStyle {
  icon: IconKey;
  /** strong accent (stripe, icon) */
  accent: string;
  /** soft tint (chip / card wash) */
  soft: string;
}

const KNOWN: { match: RegExp; style: CategoryStyle }[] = [
  { match: /coffee|espresso|latte|brew/i, style: { icon: "coffee", accent: "#83573a", soft: "#f1e3d3" } },
  { match: /tea|chai|matcha/i, style: { icon: "tea", accent: "#5f7f3f", soft: "#e6eedb" } },
  { match: /cold|shake|juice|smoothie|cooler|beverage|drink|soda|mocktail/i, style: { icon: "cold", accent: "#2f7ea0", soft: "#dcecf4" } },
  { match: /dessert|cake|sweet|ice ?cream|waffle|brownie/i, style: { icon: "dessert", accent: "#a8456b", soft: "#f6dfe8" } },
  { match: /bak|bread|croissant|pastr|muffin|cookie/i, style: { icon: "bakery", accent: "#b7791f", soft: "#f7e8cf" } },
  { match: /meal|main|pasta|pizza|burger|bowl|rice|breakfast/i, style: { icon: "meal", accent: "#9a3b2a", soft: "#f5dcd4" } },
  { match: /snack|sandwich|fries|wrap|bite|starter/i, style: { icon: "snack", accent: "#c2583a", soft: "#f8e0d5" } },
];

const FALLBACK: CategoryStyle[] = [
  { icon: "other", accent: "#6a4229", soft: "#efe2d2" },
  { icon: "other", accent: "#5b6b8c", soft: "#e2e7f1" },
  { icon: "other", accent: "#7a6a2a", soft: "#efe9cf" },
  { icon: "other", accent: "#6b4a7a", soft: "#ebe0f0" },
];

export function categoryStyle(category: string): CategoryStyle {
  const known = KNOWN.find((k) => k.match.test(category));
  if (known) return known.style;
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

const paths: Record<IconKey, React.ReactNode> = {
  coffee: (
    <>
      <path d="M17 9h1.5a3 3 0 0 1 0 6H17" />
      <path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M8 2.5c-.6.8-.6 1.7 0 2.5M12 2.5c-.6.8-.6 1.7 0 2.5" />
    </>
  ),
  tea: (
    <>
      <path d="M5 21c.5-7 4-12 14-14-1 8-5 12-11 12" />
      <path d="M5 21c2-4 5-7 9-9" />
    </>
  ),
  cold: (
    <>
      <path d="M6 7h12l-1.5 13a1.5 1.5 0 0 1-1.5 1.3H9a1.5 1.5 0 0 1-1.5-1.3Z" />
      <path d="M13 7l2-5h3" />
      <path d="M7 12h10" />
    </>
  ),
  snack: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M4 11h16v3H4Z" />
      <path d="M5 14v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </>
  ),
  dessert: (
    <>
      <path d="M4 20h16" />
      <path d="M5 20v-7h14v7" />
      <path d="M5 16c2 1.5 4 1.5 7 0s5-1.5 7 0" />
      <path d="M12 13V9M12 6.5c.8-.6.8-1.6 0-2.5-.8.9-.8 1.9 0 2.5Z" />
    </>
  ),
  bakery: (
    <>
      <path d="M4 15c0-5 3.6-9 8-9s8 4 8 9c0 2-1.5 3-3 3H7c-1.5 0-3-1-3-3Z" />
      <path d="M9 9.5 10.5 17M15 9.5 13.5 17" />
    </>
  ),
  meal: (
    <>
      <path d="M3 12h18a9 9 0 0 1-18 0Z" />
      <path d="M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4" />
    </>
  ),
  other: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 12h6M12 9v6" />
    </>
  ),
};

export function CategoryIcon({ category, className = "h-5 w-5" }: { category: string; className?: string }) {
  const { icon } = categoryStyle(category);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[icon]}
    </svg>
  );
}

/** Brand mark: a cup whose steam curls into a heart. */
export function SoulmateMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#d08636" />
      <path d="M20 14.2c-1.3-2.2-4.6-1.6-4.6.9 0 2 2.4 3.4 4.6 5 2.2-1.6 4.6-3 4.6-5 0-2.5-3.3-3.1-4.6-.9Z" fill="#24150d" />
      <path d="M10.5 21.5h17v3.2a6.3 6.3 0 0 1-6.3 6.3h-4.4a6.3 6.3 0 0 1-6.3-6.3Z" fill="#fcf8f2" />
      <path d="M27.5 22.8h1.2a2.6 2.6 0 0 1 0 5.2h-1.6" fill="none" stroke="#fcf8f2" strokeWidth="1.8" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SoulmateMark } from "./CategoryIcon";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

const icons = {
  order: ({ className }: IconProps) => (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  dues: ({ className }: IconProps) => (
    <Svg className={className}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  ),
  history: ({ className }: IconProps) => (
    <Svg className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </Svg>
  ),
  analytics: ({ className }: IconProps) => (
    <Svg className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  menu: ({ className }: IconProps) => (
    <Svg className={className}>
      <path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M3 3v6a4 4 0 0 0 4 4" />
      <path d="M17 21V3c2.5 1.5 4 4.5 4 8h-4" />
    </Svg>
  ),
};

const links = [
  { href: "/", label: "New order", icon: icons.order },
  { href: "/dues", label: "Dues", icon: icons.dues },
  { href: "/history", label: "History", icon: icons.history },
  { href: "/analytics", label: "Analytics", icon: icons.analytics },
  { href: "/menu", label: "Menu", icon: icons.menu },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/history") return pathname.startsWith("/history") || pathname.startsWith("/orders");
  return pathname.startsWith(href);
}

export interface NavUser {
  name: string;
  isAdmin: boolean;
}

export function TopNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const accountActive = pathname.startsWith("/account") || pathname.startsWith("/users");
  return (
    <header className="roast-surface sticky top-0 z-30 text-cream-50 shadow-[0_6px_20px_-12px_rgb(0_0_0/0.6)] print:hidden">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <SoulmateMark className="h-10 w-10 shrink-0" />
          <span className="leading-none">
            <span className="font-display block text-xl font-semibold italic tracking-tight">Soulmate House</span>
            <span className="mt-1 block text-[10px] font-semibold tracking-[0.32em] text-caramel-300 uppercase">Café · Counter</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 rounded-full bg-black/20 p-1 ring-1 ring-white/10 md:flex" aria-label="Main">
          {links.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active ? "bg-caramel-500 text-espresso-900 shadow" : "text-cream-100 hover:bg-white/10"
                }`}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/account"
          aria-current={accountActive ? "page" : undefined}
          title={`Signed in as ${user.name}${user.isAdmin ? " (admin)" : ""}`}
          className={`flex min-h-11 items-center gap-2 rounded-full p-1 text-sm font-semibold ring-1 transition md:pr-3 ${
            accountActive ? "bg-caramel-500 text-espresso-900 ring-caramel-400" : "text-cream-100 ring-white/15 hover:bg-white/10"
          }`}
        >
          <span className="hidden max-w-32 truncate md:order-2 md:inline">{user.name}</span>
          <span
            className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold md:order-1 ${accountActive ? "bg-espresso-900/15" : "bg-white/10"}`}
            aria-hidden
          >
            {user.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="sr-only md:hidden">Account</span>
        </Link>
      </div>
    </header>
  );
}

/** Floating bar on phones; the new-order button sits raised in the middle. */
export function BottomNav() {
  const pathname = usePathname();
  const [order, ...rest] = links;
  const left = rest.slice(0, 2);
  const right = rest.slice(2);
  const orderActive = isActive(pathname, order.href);

  const item = (l: (typeof links)[number]) => {
    const active = isActive(pathname, l.href);
    return (
      <li key={l.href}>
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide ${
            active ? "text-caramel-300" : "text-cream-200/70"
          }`}
        >
          <l.icon className="h-[22px] w-[22px]" />
          {l.label}
          <span className={`h-1 w-1 rounded-full ${active ? "bg-caramel-400" : "bg-transparent"}`} aria-hidden />
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 px-3 md:hidden print:hidden">
      <div className="roast-surface relative mb-3 rounded-[28px] shadow-[0_18px_40px_-12px_rgb(36_21_13/0.6)] ring-1 ring-white/10">
        <ul className="grid grid-cols-5 items-center">
          {left.map(item)}
          <li className="flex justify-center">
            <Link
              href={order.href}
              aria-label={order.label}
              aria-current={orderActive ? "page" : undefined}
              className={`-mt-7 grid h-16 w-16 place-items-center rounded-full border-4 border-cream-50 shadow-lg transition active:scale-95 ${
                orderActive ? "bg-caramel-500 text-espresso-900" : "bg-caramel-400 text-espresso-900"
              }`}
            >
              <order.icon className="h-7 w-7" />
            </Link>
          </li>
          {right.map(item)}
        </ul>
      </div>
    </nav>
  );
}

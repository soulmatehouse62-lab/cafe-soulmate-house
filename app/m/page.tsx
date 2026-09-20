import type { Metadata } from "next";
import { getPublicMenu, type PublicMenuItem } from "@/lib/public-menu";
import { formatINR } from "@/lib/money";
import { CategoryIcon, SoulmateMark, categoryStyle } from "@/components/CategoryIcon";

// Public page for customers who scan the table QR code. No sign-in (see middleware.ts) and
// read-only: it shows available items and prices, nothing else.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu · Soulmate House Cafe",
  description: "Today’s menu at Soulmate House Cafe",
};

const slug = (category: string) => `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function Price({ item }: { item: PublicMenuItem }) {
  if (item.variants.length === 0) {
    return <span className="tabular shrink-0 font-display text-lg font-semibold text-espresso-900">{formatINR(item.price)}</span>;
  }
  return (
    <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {item.variants.map((v) => (
        <span key={v.name} className="tabular rounded-lg bg-cream-100 px-2 py-1 text-sm font-semibold text-espresso-800 ring-1 ring-cream-200">
          <span className="text-espresso-500">{v.name}</span> {formatINR(v.price)}
        </span>
      ))}
    </span>
  );
}

export default async function PublicMenuPage() {
  const items = await getPublicMenu();
  const grouped = new Map<string, PublicMenuItem[]>();
  for (const item of items) grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);
  const categories = [...grouped.keys()];

  return (
    <div className="mx-auto max-w-2xl">
      <header className="roast-surface -mx-4 -mt-4 px-5 pt-8 pb-7 text-cream-50 md:mx-0 md:mt-0 md:rounded-3xl">
        <div className="flex items-center gap-3">
          <SoulmateMark className="h-14 w-14 shrink-0" />
          <div className="leading-none">
            <h1 className="font-display text-3xl font-semibold italic tracking-tight">Soulmate House</h1>
            <p className="mt-1.5 text-[11px] font-semibold tracking-[0.32em] text-caramel-300 uppercase">Café · Menu</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-cream-100/85">Have a look, then order at the counter. Everything listed is available right now.</p>
      </header>

      {categories.length > 1 ? (
        <nav aria-label="Menu sections" className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-cream-50/95 px-4 py-3 backdrop-blur md:mx-0">
          <ul className="flex gap-2">
            {categories.map((c) => {
              const st = categoryStyle(c);
              return (
                <li key={c} className="shrink-0">
                  <a
                    href={`#${slug(c)}`}
                    className="flex min-h-10 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-espresso-800 ring-1 ring-cream-300"
                  >
                    <span style={{ color: st.accent }}>
                      <CategoryIcon category={c} className="h-4 w-4" />
                    </span>
                    {c}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {items.length === 0 ? (
        <p className="py-16 text-center text-espresso-500">The menu is being updated. Please ask at the counter.</p>
      ) : (
        <div className="mt-4 space-y-7">
          {categories.map((category) => {
            const st = categoryStyle(category);
            const list = grouped.get(category)!;
            return (
              <section key={category} id={slug(category)} className="scroll-mt-20">
                <h2 className="mb-2 flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: st.soft, color: st.accent }}>
                    <CategoryIcon category={category} className="h-5 w-5" />
                  </span>
                  <span className="font-display text-2xl font-semibold text-espresso-900">{category}</span>
                </h2>
                <ul className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-200">
                  {list.map((item, idx) => (
                    <li
                      key={item.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3.5 ${idx ? "border-t border-dashed border-cream-200" : ""}`}
                    >
                      <span className="min-w-0 font-semibold text-espresso-900">{item.name}</span>
                      <Price item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-espresso-400">Prices in ₹. Menu updates live as items sell out.</p>
    </div>
  );
}

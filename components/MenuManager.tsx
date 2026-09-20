"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createMenuItem, deleteMenuItem, setMenuItemAvailability, updateMenuItem } from "@/app/actions/menu";
import { DEFAULT_SIZES, formatINR } from "@/lib/money";
import { CategoryIcon, categoryStyle } from "./CategoryIcon";
import { ConfirmSheet } from "./OrderActions";
import { Sheet } from "./Sheet";
import { EmptyState, ErrorText, PageHeader, btn, inputClass, labelClass } from "./ui";

export interface ManagedItem {
  id: string;
  name: string;
  price: number;
  category: string;
  isAvailable: boolean;
  variants: { name: string; price: number }[];
  timesOrdered: number;
}

type Editing = { mode: "create" } | { mode: "edit"; item: ManagedItem };

const DRINK_RE = /coffee|tea|chai|drink|beverage|shake|juice|smoothie|cooler|latte|cold|soda|mocktail/i;

/** `canEdit` (admins): add, edit and delete items. Everyone can switch availability. */
export function MenuManager({ items, canEdit }: { items: ManagedItem[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<ManagedItem | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, ManagedItem[]>();
    for (const item of items) {
      if (q && !item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) continue;
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [items, search]);

  const availableCount = items.filter((i) => i.isAvailable).length;

  function toggle(item: ManagedItem) {
    setBusyId(item.id);
    setToggleError("");
    startTransition(async () => {
      const res = await setMenuItemAvailability(item.id, !item.isAvailable);
      if (!res.ok) setToggleError(res.error);
      setBusyId(null);
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setDeleteError("");
    startTransition(async () => {
      const res = await deleteMenuItem(deleting.id);
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      setDeleting(null);
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Kitchen board"
        title="Menu"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · ${availableCount} on the counter today`}
        actions={
          <>
            <Link href="/menu/qr" className={btn.secondary}>
              Table QR
            </Link>
            {canEdit ? (
              <button type="button" onClick={() => setEditing({ mode: "create" })} className={btn.accent}>
                + Add item
              </button>
            ) : null}
          </>
        }
      />

      {items.length > 0 ? (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items or categories"
          aria-label="Search menu"
          className={`${inputClass} mb-5`}
        />
      ) : null}

      <ErrorText>{toggleError}</ErrorText>

      {items.length === 0 ? (
        <EmptyState title="Your menu is empty">{canEdit ? "Add your first item to start taking orders." : "Ask an admin to add menu items."}</EmptyState>
      ) : grouped.length === 0 ? (
        <p className="py-10 text-center text-espresso-500">No items match “{search}”.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, list]) => {
            const st = categoryStyle(category);
            return (
              <section key={category}>
                <h2 className="mb-2 flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: st.soft, color: st.accent }}>
                    <CategoryIcon category={category} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="font-display text-xl font-semibold">{category}</span>
                  <span className="text-sm text-espresso-400">{list.length}</span>
                </h2>
                <ul className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-200">
                  {list.map((item, idx) => (
                    <li
                      key={item.id}
                      className={`flex flex-wrap items-center gap-3 p-3 pl-4 sm:flex-nowrap ${idx ? "border-t border-dashed border-cream-200" : ""}`}
                      style={{ boxShadow: `inset 4px 0 0 ${item.isAvailable ? st.accent : "#dfc6a5"}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold ${item.isAvailable ? "text-espresso-900" : "text-espresso-400 line-through"}`}>{item.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                          {item.variants.length ? (
                            item.variants.map((v) => (
                              <span key={v.name} className="rounded-lg px-2 py-0.5 font-mono text-xs font-semibold text-espresso-800" style={{ background: st.soft }}>
                                {v.name} {formatINR(v.price)}
                              </span>
                            ))
                          ) : (
                            <span className="font-mono font-semibold text-espresso-700">{formatINR(item.price)}</span>
                          )}
                          {item.isAvailable ? null : <span className="text-xs font-semibold text-espresso-400">· Hidden</span>}
                        </div>
                      </div>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-espresso-600">
                        <span className="sr-only sm:not-sr-only">{item.isAvailable ? "On counter" : "Hidden"}</span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={item.isAvailable}
                          disabled={busyId === item.id}
                          onChange={() => toggle(item)}
                          aria-label={`${item.name} available`}
                          className="peer sr-only"
                        />
                        <span className="relative h-7 w-12 rounded-full bg-cream-300 transition peer-checked:bg-emerald-600 peer-disabled:opacity-50 peer-focus-visible:ring-4 peer-focus-visible:ring-caramel-400/40 after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
                      </label>
                      {canEdit ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing({ mode: "edit", item })}
                            className="min-h-11 rounded-xl px-3 text-sm font-bold text-espresso-700 hover:bg-cream-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError("");
                              setDeleting(item);
                            }}
                            className="min-h-11 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {editing ? (
        <MenuItemForm
          key={editing.mode === "edit" ? editing.item.id : "new"}
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmSheet
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "item"}?`}
        message={deleting ? <>{deleting.category} · {deleting.variants.length ? deleting.variants.map((v) => `${v.name} ${formatINR(v.price)}`).join(" / ") : formatINR(deleting.price)}</> : null}
        consequences={
          deleting
            ? [
                "It is removed from the menu, the order screen and the customer QR menu",
                deleting.timesOrdered > 0
                  ? `${deleting.timesOrdered} past order line${deleting.timesOrdered === 1 ? "" : "s"} keep their name and price, so history and analytics stay correct`
                  : "It has never been ordered",
              ]
            : undefined
        }
        note="Just sold out for today? Switch off availability instead."
        confirmLabel="Delete item"
        pending={pending}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

interface SizeRow {
  key: number;
  name: string;
  price: string;
}

function MenuItemForm({ editing, categories, onClose }: { editing: Editing; categories: string[]; onClose: () => void }) {
  const initial = editing.mode === "edit" ? editing.item : null;
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial && !initial.variants.length ? String(initial.price / 100) : "");
  const [category, setCategory] = useState(initial?.category ?? categories[0] ?? "");
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [sizesOn, setSizesOn] = useState(initial ? initial.variants.length > 0 : DRINK_RE.test(categories[0] ?? ""));
  const sizesTouched = useRef(Boolean(initial));
  const nextKey = useRef(10);
  const [sizes, setSizes] = useState<SizeRow[]>(
    initial?.variants.length
      ? initial.variants.map((v, i) => ({ key: i, name: v.name, price: String(v.price / 100) }))
      : DEFAULT_SIZES.map((n, i) => ({ key: i, name: n, price: "" })),
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onCategory(value: string) {
    setCategory(value);
    // New drinks get Medium / Large automatically until staff choose otherwise.
    if (!sizesTouched.current) setSizesOn(DRINK_RE.test(value));
  }

  function updateSize(key: number, patch: Partial<SizeRow>) {
    setSizes((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Name is required");
    if (!category.trim()) return setError("Category is required");
    const variants = sizesOn ? sizes.map((s) => ({ name: s.name.trim(), price: Number(s.price) })) : [];
    if (sizesOn) {
      if (variants.length < 2) return setError("Add at least two sizes, or switch sizes off");
      if (variants.some((v) => !v.name)) return setError("Each size needs a name");
      if (variants.some((v) => !Number.isFinite(v.price) || v.price <= 0)) return setError("Enter a price for every size");
    } else if (!(Number(price) > 0)) {
      return setError("Enter a price greater than zero");
    }
    const input = { name, price: sizesOn ? 0 : Number(price), category, isAvailable, variants };
    startTransition(async () => {
      const res = editing.mode === "edit" ? await updateMenuItem(editing.item.id, input) : await createMenuItem(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={editing.mode === "edit" ? "Edit item" : "Add menu item"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="mi-name" className={labelClass}>
            Name
          </label>
          <input id="mi-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" required />
        </div>
        <div>
          <label htmlFor="mi-category" className={labelClass}>
            Category
          </label>
          <input
            id="mi-category"
            list="mi-categories"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            className={inputClass}
            autoComplete="off"
            required
          />
          <datalist id="mi-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="rounded-2xl bg-white p-3 ring-1 ring-cream-200">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block font-bold text-espresso-800">Sizes</span>
              <span className="block text-xs text-espresso-500">For drinks, e.g. Medium and Large at different prices</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={sizesOn}
              onChange={(e) => {
                sizesTouched.current = true;
                setSizesOn(e.target.checked);
              }}
              aria-label="Offer sizes"
              className="peer sr-only"
            />
            <span className="relative h-7 w-12 shrink-0 rounded-full bg-cream-300 transition peer-checked:bg-espresso-800 peer-focus-visible:ring-4 peer-focus-visible:ring-caramel-400/40 after:absolute after:top-1 after:left-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          </label>

          {sizesOn ? (
            <div className="mt-3 space-y-2">
              {sizes.map((s, idx) => (
                <div key={s.key} className="flex items-center gap-2">
                  <input
                    aria-label={`Size ${idx + 1} name`}
                    value={s.name}
                    onChange={(e) => updateSize(s.key, { name: e.target.value })}
                    placeholder="Size"
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-espresso-400">₹</span>
                    <input
                      aria-label={`${s.name || `Size ${idx + 1}`} price`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={s.price}
                      onChange={(e) => updateSize(s.key, { price: e.target.value })}
                      className={`${inputClass} tabular pl-7`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSizes((rows) => rows.filter((r) => r.key !== s.key))}
                    disabled={sizes.length <= 2}
                    aria-label={`Remove ${s.name || "size"}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg text-espresso-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
              {sizes.length < 6 ? (
                <button
                  type="button"
                  onClick={() => setSizes((rows) => [...rows, { key: nextKey.current++, name: "", price: "" }])}
                  className="min-h-10 rounded-xl px-3 text-sm font-bold text-caramel-600 hover:bg-cream-100"
                >
                  + Add another size
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              <label htmlFor="mi-price" className={labelClass}>
                Price (₹)
              </label>
              <input
                id="mi-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={`${inputClass} tabular`}
              />
            </div>
          )}
        </div>

        <label className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-3 ring-1 ring-cream-200">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="h-5 w-5 accent-emerald-600" />
          <span className="font-semibold">Available for new orders</span>
        </label>
        {editing.mode === "edit" && editing.item.timesOrdered > 0 ? (
          <p className="text-sm text-espresso-500">Price and size changes apply to new orders only; past bills keep what they were charged.</p>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} className={`${btn.accent} w-full`}>
          {pending ? "Saving…" : editing.mode === "edit" ? "Save changes" : "Add item"}
        </button>
      </form>
    </Sheet>
  );
}

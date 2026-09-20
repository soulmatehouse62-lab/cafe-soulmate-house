"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createOrder, lookupCustomer, updateOrder, type CustomerLookup, type CustomerSuggestion } from "@/app/actions/orders";
import { CustomerSuggestionList, useCustomerSuggestions } from "./CustomerSuggestions";
import {
  computeBill,
  formatINR,
  formatOrderNumber,
  lineLabel,
  normalizePhone,
  rupeesToPaise,
  type DiscountTypeValue,
  type OrderStatusValue,
  type PaymentMethodValue,
} from "@/lib/money";
import { CategoryIcon, categoryStyle } from "./CategoryIcon";
import { MethodPicker } from "./MethodPicker";
import { Sheet } from "./Sheet";
import { ErrorText, btn, inputClass, labelClass } from "./ui";

export interface MenuOption {
  id: string;
  name: string;
  price: number;
  category: string;
  variants: { name: string; price: number }[];
}

export interface BuilderLine {
  key: string;
  orderItemId?: string;
  menuItemId: string | null;
  variantName: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface EditableOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  tableNumber: string;
  discountType: DiscountTypeValue | null;
  discountValue: number | null;
  amountPaid: number;
  lines: BuilderLine[];
}

export interface TodaySnapshot {
  greeting: string;
  dateLabel: string;
  collected: number;
  orders: number;
  openDues: number;
  openDueAmount: number;
}

const lineKey = (menuItemId: string, variantName: string | null) => `new-${menuItemId}|${variantName ?? ""}`;
const shortSize = (name: string) => (/^(small|medium|large|regular)$/i.test(name) ? name[0].toUpperCase() : name);

export function OrderBuilder({ menu, order, today }: { menu: MenuOption[]; order?: EditableOrder; today?: TodaySnapshot }) {
  const router = useRouter();
  const isEdit = Boolean(order);

  const [lines, setLines] = useState<BuilderLine[]>(order?.lines ?? []);
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState(order?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(order?.customerPhone ?? "");
  const [tableNumber, setTableNumber] = useState(order?.tableNumber ?? "");
  const [discountType, setDiscountType] = useState<DiscountTypeValue | null>(order?.discountType ?? null);
  const [discountInput, setDiscountInput] = useState(order?.discountValue ? String(order.discountValue) : "");
  const [saveStatus, setSaveStatus] = useState<OrderStatusValue>("PAID");
  const [received, setReceived] = useState("");
  const [method, setMethod] = useState<PaymentMethodValue | null>("CASH");
  const [error, setError] = useState("");
  const [billOpen, setBillOpen] = useState(false);
  const [bumped, setBumped] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerLookup | null>(null);
  const [pending, startTransition] = useTransition();
  /** Name last filled in by the phone lookup, so a later lookup may replace it but never a name staff typed. */
  const autoName = useRef<string | null>(null);
  /** Set when a suggestion is picked: look the phone up at once instead of waiting for typing to stop. */
  const lookupNow = useRef(false);

  const categories = useMemo(() => ["All", ...Array.from(new Set(menu.map((m) => m.category))).sort()], [menu]);

  const visibleMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(
      (m) => (category === "All" || m.category === category) && (!q || m.name.toLowerCase().includes(q)),
    );
  }, [menu, category, search]);

  /** qty per "menuItemId|size" and per menuItemId */
  const qty = useMemo(() => {
    const bySize = new Map<string, number>();
    const byItem = new Map<string, number>();
    for (const l of lines) {
      if (!l.menuItemId) continue;
      const k = `${l.menuItemId}|${l.variantName ?? ""}`;
      bySize.set(k, (bySize.get(k) ?? 0) + l.quantity);
      byItem.set(l.menuItemId, (byItem.get(l.menuItemId) ?? 0) + l.quantity);
    }
    return { bySize, byItem };
  }, [lines]);

  // Returning-customer lookup by phone (debounced).
  const phoneDigits = normalizePhone(customerPhone).replace(/\D/g, "");
  const phoneIncomplete = phoneDigits.length > 0 && phoneDigits.length < 10;
  useEffect(() => {
    if (phoneDigits.length < 10) {
      setCustomer(null);
      return;
    }
    let cancelled = false;
    const delay = lookupNow.current ? 0 : 300;
    lookupNow.current = false;
    const t = setTimeout(async () => {
      const found = await lookupCustomer(customerPhone);
      if (cancelled) return;
      setCustomer(found);
      if (found?.name) {
        const foundName = found.name;
        setCustomerName((current) => {
          if (current.trim() && current !== autoName.current) return current;
          autoName.current = foundName;
          return foundName;
        });
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneDigits]);

  // Name / partial-phone suggestions. A full 10-digit phone is handled by the exact lookup above.
  const [suggestFor, setSuggestFor] = useState<"name" | "phone" | null>(null);
  const [highlight, setHighlight] = useState(0);
  const suggestQuery =
    suggestFor === "name" ? customerName : suggestFor === "phone" && phoneDigits.length < 10 ? customerPhone : "";
  const suggestions = useCustomerSuggestions(suggestQuery);
  const alreadyPicked =
    suggestions.length === 1 &&
    suggestions[0].name === customerName.trim() &&
    suggestions[0].phone.replace(/\D/g, "").slice(-10) === phoneDigits.slice(-10);
  const showSuggestions = suggestions.length > 0 && !alreadyPicked;

  function openSuggestions(field: "name" | "phone") {
    setSuggestFor(field);
    setHighlight(0);
  }

  function pickCustomer(c: CustomerSuggestion) {
    autoName.current = c.name;
    lookupNow.current = true;
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setSuggestFor(null);
  }

  function onSuggestKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || !suggestFor) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickCustomer(suggestions[Math.min(highlight, suggestions.length - 1)]);
    } else if (e.key === "Escape") {
      setSuggestFor(null);
    }
  }

  const discountValue = discountType ? Number(discountInput) || 0 : null;
  const bill = computeBill(lines, discountType, discountValue);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const receivedPaise = rupeesToPaise(Number(received) || 0);

  function addItem(m: MenuOption, variantName: string | null) {
    setError("");
    const unitPrice = variantName ? (m.variants.find((v) => v.name === variantName)?.price ?? m.price) : m.price;
    setBumped(`${m.id}|${variantName ?? ""}`);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === m.id && (l.variantName ?? null) === variantName);
      if (idx >= 0) return prev.map((l, i) => (i === idx ? { ...l, quantity: Math.min(999, l.quantity + 1) } : l));
      return [...prev, { key: lineKey(m.id, variantName), menuItemId: m.id, variantName, name: m.name, unitPrice, quantity: 1 }];
    });
  }

  function changeQty(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(999, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function decrementMenuItem(menuItemId: string) {
    const line = [...lines].reverse().find((l) => l.menuItemId === menuItemId);
    if (line) changeQty(line.key, -1);
  }

  function resetForm() {
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setTableNumber("");
    setDiscountType(null);
    setDiscountInput("");
    setSaveStatus("PAID");
    setReceived("");
    setMethod("CASH");
    setError("");
    setCustomer(null);
    autoName.current = null;
  }

  function validate(): string | null {
    if (lines.length === 0) return "Add at least one item to the order";
    if (phoneIncomplete || phoneDigits.length > 13) return "Enter a full 10-digit mobile number (or leave it empty)";
    if (discountType === "PERCENT" && (discountValue ?? 0) > 100) return "Percentage discount cannot exceed 100%";
    if (discountType && (discountValue ?? 0) < 0) return "Discount cannot be negative";
    if (isEdit || bill.total === 0) return null;
    if (saveStatus !== "UNPAID" && !method) return "Choose how the customer paid";
    if (saveStatus === "PAID" && received && receivedPaise < bill.total) {
      return `Amount received is less than ${formatINR(bill.total)}. Choose Partial instead.`;
    }
    if (saveStatus === "PARTIAL") {
      if (receivedPaise <= 0) return "Enter the amount received";
      if (receivedPaise >= bill.total) return "That covers the full bill — choose Paid instead";
    }
    return null;
  }

  function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      setBillOpen(true);
      return;
    }
    setError("");
    const fields = {
      lines: lines.map((l) =>
        l.orderItemId
          ? { orderItemId: l.orderItemId, quantity: l.quantity }
          : { menuItemId: l.menuItemId ?? undefined, variantName: l.variantName, quantity: l.quantity },
      ),
      customerName,
      customerPhone,
      tableNumber,
      discountType,
      discountValue,
    };

    startTransition(async () => {
      if (order) {
        const res = await updateOrder(order.id, fields);
        if (!res.ok) {
          setError(res.error);
          setBillOpen(true);
          return;
        }
        router.push(`/orders/${order.id}`);
        return;
      }
      const res = await createOrder({
        ...fields,
        paymentStatus: saveStatus,
        paymentAmount: saveStatus === "UNPAID" ? null : received ? Number(received) : null,
        paymentMethod: saveStatus === "UNPAID" ? null : method,
      });
      if (!res.ok) {
        setError(res.error);
        setBillOpen(true);
        return;
      }
      resetForm();
      router.push(`/orders/${res.orderId}?new=1`);
    });
  }

  const renderBill = (idp: string) => (
    <div className="space-y-4">
      {/* Ticket */}
      <div className="receipt rounded-t-2xl px-4 pt-4 shadow-card ring-1 ring-cream-200">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-display text-lg font-semibold">{order ? `Ticket ${formatOrderNumber(order.orderNumber)}` : "Order ticket"}</p>
          <p className="font-mono text-xs text-espresso-400">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
        </div>
        <div className="receipt-rule" />
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-espresso-400">Tap items on the menu to start the ticket.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-cream-200">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-espresso-900">{l.name}</p>
                  <p className="flex items-center gap-1.5 font-mono text-xs text-espresso-400">
                    {l.variantName ? (
                      <span className="rounded-md bg-espresso-800 px-1.5 py-px font-sans text-[10px] font-bold tracking-wider text-cream-50 uppercase">
                        {l.variantName}
                      </span>
                    ) : null}
                    {formatINR(l.unitPrice)} × {l.quantity}
                  </p>
                </div>
                <QtyStepper quantity={l.quantity} onDec={() => changeQty(l.key, -1)} onInc={() => changeQty(l.key, 1)} label={lineLabel(l.name, l.variantName)} />
                <p className="w-20 text-right font-mono text-sm font-semibold">{formatINR(l.unitPrice * l.quantity)}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="receipt-rule mt-1" />
        <dl className="space-y-1 pt-3 font-mono text-sm">
          <div className="flex justify-between">
            <dt className="text-espresso-500">Subtotal</dt>
            <dd>{formatINR(bill.subtotal)}</dd>
          </div>
          {bill.discountAmount > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <dt>Discount{discountType === "PERCENT" ? ` ${discountValue}%` : ""}</dt>
              <dd>−{formatINR(bill.discountAmount)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-xs font-bold tracking-[0.2em] text-espresso-500 uppercase">Total</span>
          <span className="font-display text-3xl font-semibold">{formatINR(bill.total)}</span>
        </div>
      </div>

      {/* Customer */}
      <section className="rounded-2xl bg-white p-3 ring-1 ring-cream-200">
        <p className="mb-2 flex items-center justify-between text-sm font-bold text-espresso-700">
          Customer <span className="text-xs font-medium text-espresso-400">optional</span>
        </p>
        <div className="grid grid-cols-5 gap-2">
          <div className="col-span-3">
            <label htmlFor={`${idp}-phone`} className={labelClass}>
              Phone
            </label>
            <input
              id={`${idp}-phone`}
              type="tel"
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                openSuggestions("phone");
              }}
              onFocus={() => openSuggestions("phone")}
              onBlur={() => setSuggestFor(null)}
              onKeyDown={onSuggestKey}
              placeholder="10-digit mobile"
              maxLength={16}
              role="combobox"
              aria-expanded={suggestFor === "phone" && showSuggestions}
              aria-controls={`${idp}-suggest`}
              aria-activedescendant={suggestFor === "phone" && showSuggestions ? `${idp}-suggest-${highlight}` : undefined}
              aria-invalid={phoneIncomplete || undefined}
              aria-describedby={phoneIncomplete ? `${idp}-phone-hint` : undefined}
              className={`${inputClass} ${phoneIncomplete ? "border-amber-400" : ""}`}
              autoComplete="off"
            />
            {phoneIncomplete ? (
              <p id={`${idp}-phone-hint`} className="mt-1 text-xs font-semibold text-amber-700">
                {phoneDigits.length}/10 digits
              </p>
            ) : null}
          </div>
          <div className="col-span-2">
            <label htmlFor={`${idp}-table`} className={labelClass}>
              Table
            </label>
            <input id={`${idp}-table`} value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className={inputClass} autoComplete="off" />
          </div>
          {suggestFor === "phone" && showSuggestions ? (
            <div className="col-span-5 -mt-1">
              <CustomerSuggestionList id={`${idp}-suggest`} items={suggestions} highlight={highlight} onPick={pickCustomer} onHover={setHighlight} />
            </div>
          ) : null}
          <div className="col-span-5">
            <label htmlFor={`${idp}-name`} className={labelClass}>
              Name
            </label>
            <input
              id={`${idp}-name`}
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                openSuggestions("name");
              }}
              onFocus={() => openSuggestions("name")}
              onBlur={() => setSuggestFor(null)}
              onKeyDown={onSuggestKey}
              placeholder="Type a name to find a regular"
              role="combobox"
              aria-expanded={suggestFor === "name" && showSuggestions}
              aria-controls={`${idp}-suggest`}
              aria-activedescendant={suggestFor === "name" && showSuggestions ? `${idp}-suggest-${highlight}` : undefined}
              className={inputClass}
              autoComplete="off"
            />
            {suggestFor === "name" && showSuggestions ? (
              <CustomerSuggestionList id={`${idp}-suggest`} items={suggestions} highlight={highlight} onPick={pickCustomer} onHover={setHighlight} />
            ) : null}
          </div>
        </div>
        {customer ? (
          <div
            className={`mt-3 flex items-start gap-3 rounded-xl p-3 text-sm ring-1 ${
              customer.due > 0 ? "bg-red-50 ring-red-200" : "bg-emerald-50 ring-emerald-200"
            }`}
            role="status"
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-base font-bold ${customer.due > 0 ? "bg-red-600 text-white" : "bg-emerald-700 text-white"}`}>
              {(customer.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-espresso-900">
                Returning customer{customer.name ? ` · ${customer.name}` : ""}
              </p>
              {customer.name && customerName.trim() && customerName.trim() !== customer.name ? (
                <button
                  type="button"
                  onClick={() => {
                    autoName.current = customer.name;
                    setCustomerName(customer.name ?? "");
                  }}
                  className="my-1 min-h-9 rounded-lg bg-white px-3 text-xs font-bold text-espresso-800 ring-1 ring-cream-300 hover:bg-cream-100"
                >
                  Use “{customer.name}”
                </button>
              ) : null}
              <p className="text-espresso-600">
                {customer.orders} visit{customer.orders === 1 ? "" : "s"} · spent {formatINR(customer.totalSpent)}
              </p>
              {customer.due > 0 ? (
                <p className="font-bold text-red-700">
                  Owes {formatINR(customer.due)} on {customer.openOrders} order{customer.openOrders === 1 ? "" : "s"} ·{" "}
                  <Link href={`/dues?phone=${encodeURIComponent(normalizePhone(customerPhone))}`} className="underline">
                    collect
                  </Link>
                </p>
              ) : (
                <p className="font-semibold text-emerald-800">No pending dues</p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Discount */}
      <section className="rounded-2xl bg-white p-3 ring-1 ring-cream-200">
        <p className="mb-2 text-sm font-bold text-espresso-700">Discount</p>
        <div className="flex gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-2xl bg-cream-100 p-1" role="radiogroup" aria-label="Discount type">
            {([
              [null, "None"],
              ["FLAT", "₹ Flat"],
              ["PERCENT", "%"],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={discountType === value}
                onClick={() => setDiscountType(value)}
                className={`min-h-10 rounded-xl text-sm font-bold ${discountType === value ? "bg-white text-espresso-900 shadow-sm" : "text-espresso-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {discountType ? (
            <div className="w-24 shrink-0">
              <input
                aria-label={discountType === "FLAT" ? "Discount in rupees" : "Discount percent"}
                type="number"
                inputMode="decimal"
                min="0"
                max={discountType === "PERCENT" ? 100 : undefined}
                step="0.01"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={discountType === "FLAT" ? "₹" : "%"}
                className={`${inputClass} tabular`}
              />
            </div>
          ) : null}
        </div>
      </section>

      {isEdit && order ? (
        order.amountPaid > 0 ? (
          <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-espresso-700">
            Already paid <span className="font-mono font-semibold">{formatINR(order.amountPaid)}</span> · balance after saving{" "}
            <span className="font-mono font-semibold">{formatINR(Math.max(0, bill.total - order.amountPaid))}</span>. Payments are managed on the
            order page.
          </p>
        ) : null
      ) : (
        <section className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-cream-200">
          <p className="text-sm font-bold text-espresso-700">Payment</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment status">
            {(["PAID", "PARTIAL", "UNPAID"] as const).map((s) => {
              const selected = saveStatus === s;
              const tone =
                s === "PAID"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : s === "PARTIAL"
                    ? "border-amber-500 bg-amber-400 text-espresso-900"
                    : "border-red-600 bg-red-600 text-white";
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSaveStatus(s)}
                  className={`min-h-12 rounded-2xl border-2 text-sm font-bold transition ${selected ? tone : "border-cream-200 bg-cream-50 text-espresso-600"}`}
                >
                  {s === "PAID" ? "Paid" : s === "PARTIAL" ? "Partial" : "Unpaid"}
                </button>
              );
            })}
          </div>

          {saveStatus !== "UNPAID" && bill.total > 0 ? (
            <>
              <div>
                <label htmlFor={`${idp}-received`} className={labelClass}>
                  {saveStatus === "PAID" ? "Cash received (optional, for change)" : "Amount received (₹)"}
                </label>
                <input
                  id={`${idp}-received`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder={saveStatus === "PAID" ? String(bill.total / 100) : "0"}
                  className={`${inputClass} tabular text-lg`}
                />
                {saveStatus === "PAID" && receivedPaise > bill.total ? (
                  <p className="mt-1.5 text-sm font-bold text-emerald-700">Return change: {formatINR(receivedPaise - bill.total)}</p>
                ) : null}
                {saveStatus === "PARTIAL" && receivedPaise > 0 && receivedPaise < bill.total ? (
                  <p className="mt-1.5 text-sm font-bold text-amber-800">Balance due: {formatINR(bill.total - receivedPaise)}</p>
                ) : null}
              </div>
              <MethodPicker value={method} onChange={setMethod} />
            </>
          ) : null}
        </section>
      )}

      <ErrorText>{error}</ErrorText>

      <button type="button" onClick={save} disabled={pending || lines.length === 0} className={`${btn.accent} w-full text-lg`}>
        {pending ? "Saving…" : isEdit ? "Save changes" : `Save order · ${formatINR(bill.total)}`}
      </button>
      {isEdit && order ? (
        <Link href={`/orders/${order.id}`} className={`${btn.secondary} w-full`}>
          Cancel
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
      <section aria-label="Menu" className="pb-28 lg:pb-0">
        {today && !isEdit ? (
          <div className="roast-surface mb-5 overflow-hidden rounded-3xl p-4 text-cream-50 shadow-lift md:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-[0.28em] text-caramel-300 uppercase">{today.dateLabel}</p>
                <h1 className="font-display text-2xl font-semibold italic md:text-3xl">{today.greeting}</h1>
              </div>
              {lines.length > 0 ? (
                <button type="button" onClick={resetForm} className="min-h-10 rounded-full bg-white/10 px-4 text-sm font-semibold text-cream-100 ring-1 ring-white/15 hover:bg-white/20">
                  Clear ticket
                </button>
              ) : null}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <HeroStat label="Collected today" value={formatINR(today.collected)} />
              <HeroStat label="Orders today" value={String(today.orders)} />
              <Link href="/dues" className="rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10 hover:bg-white/10">
                <dt className="text-[11px] font-medium text-cream-200/80">Open dues</dt>
                <dd className={`font-display text-lg font-semibold md:text-xl ${today.openDues ? "text-amber-300" : ""}`}>
                  {today.openDues ? formatINR(today.openDueAmount) : "None"}
                </dd>
              </Link>
            </dl>
          </div>
        ) : (
          <div className="mb-4">
            <p className="mb-1 text-[11px] font-bold tracking-[0.28em] text-caramel-600 uppercase">Editing</p>
            <h1 className="font-display text-3xl font-semibold">{order ? `Order ${formatOrderNumber(order.orderNumber)}` : "New order"}</h1>
          </div>
        )}

        <div className="sticky top-16 z-10 -mx-4 mb-4 space-y-3 bg-cream-50/90 px-4 pt-2 pb-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-espresso-400" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu" aria-label="Search menu" className={`${inputClass} pl-11`} />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Categories">
            {categories.map((c) => {
              const active = category === c;
              const st = c === "All" ? null : categoryStyle(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition ${
                    active ? "bg-espresso-800 text-cream-50 shadow" : "bg-white text-espresso-700 ring-1 ring-cream-200 hover:bg-cream-100"
                  }`}
                >
                  {st ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: active ? "rgb(255 255 255 / 0.14)" : st.soft, color: active ? "#efc48f" : st.accent }}>
                      <CategoryIcon category={c} className="h-4 w-4" />
                    </span>
                  ) : null}
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {menu.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-cream-300 bg-white/60 px-6 py-10 text-center text-espresso-600">
            No items are available.{" "}
            <Link href="/menu" className="font-semibold text-caramel-600 underline">
              Add menu items
            </Link>
          </div>
        ) : visibleMenu.length === 0 ? (
          <p className="py-10 text-center text-espresso-500">No items match “{search}”.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibleMenu.map((m) => (
              <MenuCard
                key={m.id}
                item={m}
                total={qty.byItem.get(m.id) ?? 0}
                sizeQty={(v) => qty.bySize.get(`${m.id}|${v ?? ""}`) ?? 0}
                bumped={bumped}
                onAdd={(v) => addItem(m, v)}
                onRemove={() => decrementMenuItem(m.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-3xl bg-cream-100/70 p-4 ring-1 ring-cream-200 lg:block" aria-label="Current bill">
        {renderBill("d")}
      </aside>

      {/* Phone/tablet: ticket summary above the floating nav */}
      <div className="fixed inset-x-3 bottom-[5.75rem] z-20 md:bottom-4 lg:hidden print:hidden" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-3xl bg-white/95 p-2 pl-4 shadow-lift ring-1 ring-cream-200 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-espresso-500">{itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"} on ticket` : "Ticket is empty"}</p>
            <p key={bill.total} className="font-display animate-pop origin-left text-2xl leading-tight font-semibold">
              {formatINR(bill.total)}
            </p>
          </div>
          <button type="button" onClick={() => setBillOpen(true)} disabled={lines.length === 0 && !isEdit} className={btn.accent}>
            {isEdit ? "Review & save" : "Bill & pay"}
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06L8.26 15.8a.75.75 0 1 1-1.06-1.06L11.94 10 7.2 5.26a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <Sheet open={billOpen} onClose={() => setBillOpen(false)} title={isEdit ? "Review changes" : "Bill & payment"} wide>
        {renderBill("m")}
      </Sheet>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <dt className="text-[11px] font-medium text-cream-200/80">{label}</dt>
      <dd className="font-display text-lg font-semibold md:text-xl">{value}</dd>
    </div>
  );
}

function MenuCard({
  item,
  total,
  sizeQty,
  bumped,
  onAdd,
  onRemove,
}: {
  item: MenuOption;
  total: number;
  sizeQty: (variant: string | null) => number;
  bumped: string | null;
  onAdd: (variant: string | null) => void;
  onRemove: () => void;
}) {
  const st = categoryStyle(item.category);
  const hasSizes = item.variants.length > 0;
  const selected = total > 0;

  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-card transition ${
        selected ? "ring-2 ring-caramel-500" : "ring-1 ring-cream-200"
      }`}
    >
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: st.accent }} aria-hidden />
      {hasSizes ? (
        <div className="flex flex-1 flex-col p-3 pt-4">
          <CardHead item={item} total={total} bumpedKey={bumped} />
          <div className={`mt-auto grid gap-1.5 pt-3 ${item.variants.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
            {item.variants.map((v) => {
              const q = sizeQty(v.name);
              return (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => onAdd(v.name)}
                  aria-label={`Add ${item.name} ${v.name}, ${formatINR(v.price)}${q ? `, ${q} in order` : ""}`}
                  className={`relative flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 text-center transition active:scale-95 ${
                    q ? "bg-espresso-800 text-cream-50" : "text-espresso-800 hover:brightness-95"
                  }`}
                  style={q ? undefined : { background: st.soft }}
                >
                  <span className="text-[11px] font-bold tracking-widest uppercase opacity-80">{shortSize(v.name)}</span>
                  <span className="font-mono text-sm font-bold">{formatINR(v.price)}</span>
                  {q ? (
                    <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-caramel-500 px-1 text-[11px] font-bold text-espresso-900">
                      {q}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAdd(null)}
          className="flex flex-1 flex-col p-3 pt-4 text-left active:bg-cream-50"
          aria-label={`Add ${item.name}, ${formatINR(item.price)}${total ? `, ${total} in order` : ""}`}
        >
          <CardHead item={item} total={total} bumpedKey={bumped} />
          <span className="mt-auto flex items-end justify-between pt-3">
            <span className="font-display text-xl font-semibold text-espresso-800">{formatINR(item.price)}</span>
            {!selected ? (
              <span className="grid h-9 w-9 place-items-center rounded-full text-xl font-bold" style={{ background: st.soft, color: st.accent }} aria-hidden>
                +
              </span>
            ) : null}
          </span>
        </button>
      )}
      {selected && !hasSizes ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove one ${item.name}`}
          className="absolute right-3 bottom-3 grid h-9 w-9 place-items-center rounded-full bg-white text-xl font-bold text-espresso-700 shadow ring-1 ring-cream-300"
        >
          −
        </button>
      ) : null}
    </li>
  );
}

function CardHead({ item, total, bumpedKey }: { item: MenuOption; total: number; bumpedKey: string | null }) {
  const st = categoryStyle(item.category);
  const hasSizes = item.variants.length > 0;
  return (
    <div className="flex items-start gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: st.soft, color: st.accent }}>
        <CategoryIcon category={item.category} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-espresso-900">{item.name}</span>
      {total > 0 ? (
        <span
          key={bumpedKey ?? ""}
          className="animate-pop grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-caramel-500 px-1.5 text-sm font-bold text-espresso-900"
        >
          {total}
        </span>
      ) : null}
    </div>
  );
}

function QtyStepper({ quantity, onDec, onInc, label }: { quantity: number; onDec: () => void; onInc: () => void; label: string }) {
  return (
    <div className="flex items-center rounded-full bg-cream-100 ring-1 ring-cream-200">
      <button type="button" onClick={onDec} aria-label={`Decrease ${label}`} className="grid h-10 w-10 place-items-center rounded-full text-lg font-bold text-espresso-700 hover:bg-cream-200">
        −
      </button>
      <span className="tabular w-6 text-center font-bold" aria-live="polite">
        {quantity}
      </span>
      <button type="button" onClick={onInc} aria-label={`Increase ${label}`} className="grid h-10 w-10 place-items-center rounded-full text-lg font-bold text-espresso-700 hover:bg-cream-200">
        +
      </button>
    </div>
  );
}

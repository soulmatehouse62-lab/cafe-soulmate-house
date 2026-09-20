"use client";

import { useEffect, useRef, useState } from "react";
import { searchCustomers, type CustomerSuggestion } from "@/app/actions/orders";

/** Server returns at most this many; a shorter list is complete for that query. */
const LIMIT = 6;
const DEBOUNCE_MS = 120;

type Query = { kind: "name"; words: string[]; key: string } | { kind: "phone"; digits: string; key: string };

function parse(raw: string): Query | null {
  const q = raw.trim();
  if (!q) return null;
  if (/^[+\d\s-]+$/.test(q)) {
    let digits = q.replace(/\D/g, "");
    if (q.startsWith("+91") || (digits.length > 10 && digits.startsWith("91"))) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    return digits.length >= 3 ? { kind: "phone", digits, key: `p:${digits}` } : null;
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return { kind: "name", words, key: `n:${words.join(" ")}` };
}

/** Same rule as the server (searchCustomers), used to narrow cached results without a round trip. */
function matches(c: CustomerSuggestion, q: Query): boolean {
  if (q.kind === "phone") return c.phone.replace(/\D/g, "").slice(-10).startsWith(q.digits);
  const nameWords = c.name.toLowerCase().split(/\s+/);
  return q.words.every((w) => nameWords.some((n) => n.startsWith(w)));
}

/**
 * Customer suggestions for a name or partial phone. Results are cached per query, and when a
 * shorter query already returned a complete (< LIMIT) list, longer queries are filtered locally
 * with no request at all, so typing feels instant.
 */
export function useCustomerSuggestions(raw: string): CustomerSuggestion[] {
  const cache = useRef(new Map<string, CustomerSuggestion[]>());
  const [results, setResults] = useState<CustomerSuggestion[]>([]);

  useEffect(() => {
    const q = parse(raw);
    if (!q) {
      setResults([]);
      return;
    }
    const hit = cache.current.get(q.key);
    if (hit) {
      setResults(hit);
      return;
    }
    // A complete result for a shorter version of this query contains every possible match.
    for (const [key, list] of cache.current) {
      if (list.length < LIMIT && key[0] === q.key[0] && q.key.startsWith(key)) {
        const narrowed = list.filter((c) => matches(c, q));
        cache.current.set(q.key, narrowed);
        setResults(narrowed);
        return;
      }
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      const list = await searchCustomers(raw).catch(() => []);
      cache.current.set(q.key, list);
      if (!cancelled) setResults(list);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [raw]);

  return results;
}

export function CustomerSuggestionList({
  id,
  items,
  highlight,
  onPick,
  onHover,
}: {
  id: string;
  items: CustomerSuggestion[];
  highlight: number;
  onPick: (c: CustomerSuggestion) => void;
  onHover: (i: number) => void;
}) {
  return (
    <ul id={id} role="listbox" aria-label="Matching customers" className="mt-2 overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-cream-300">
      {items.map((c, i) => (
        <li
          key={c.phone}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === highlight}
          // mousedown (not click) so the input keeps focus and doesn't close the list first
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(c);
          }}
          onMouseEnter={() => onHover(i)}
          className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 ${i ? "border-t border-dashed border-cream-200" : ""} ${
            i === highlight ? "bg-cream-100" : ""
          }`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-espresso-800 text-sm font-bold text-cream-50" aria-hidden>
            {c.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-espresso-900">{c.name}</span>
          <span className="tabular shrink-0 font-mono text-sm text-espresso-500">{c.phone}</span>
        </li>
      ))}
    </ul>
  );
}

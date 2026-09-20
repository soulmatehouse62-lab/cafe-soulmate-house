"use client";

import { METHOD_LABEL, PAYMENT_METHODS, type PaymentMethodValue } from "@/lib/money";

export function MethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethodValue | null;
  onChange: (m: PaymentMethodValue) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
      {PAYMENT_METHODS.map((m) => {
        const selected = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m)}
            className={`min-h-12 rounded-2xl border-2 text-sm font-bold transition ${
              selected
                ? "border-espresso-800 bg-espresso-800 text-cream-50"
                : "border-cream-200 bg-cream-50 text-espresso-700 hover:bg-cream-100"
            }`}
          >
            {METHOD_LABEL[m]}
          </button>
        );
      })}
    </div>
  );
}

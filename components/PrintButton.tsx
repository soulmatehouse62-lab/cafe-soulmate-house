"use client";

import { btn } from "./ui";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btn.primary}>
      {label}
    </button>
  );
}

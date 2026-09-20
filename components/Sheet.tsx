"use client";

import { useEffect, useId, type ReactNode } from "react";

/**
 * Bottom sheet on phones, centred dialog on larger screens.
 * `icon` switches to the alert layout used for confirmations: centred icon and title, no header bar.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide = false,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6 print:hidden">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-espresso-900/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role={icon ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-[2rem] bg-cream-50 shadow-2xl md:rounded-[2rem] ${
          wide ? "md:max-w-2xl" : "md:max-w-md"
        }`}
      >
        {icon ? (
          <div className="relative px-6 pt-7 text-center">
            <span className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-cream-300 md:hidden" aria-hidden />
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full text-espresso-500 hover:bg-cream-200"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
            <div className="mx-auto mb-3 w-fit">{icon}</div>
            <h2 id={titleId} className="font-display text-2xl font-semibold text-balance text-espresso-900">
              {title}
            </h2>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-b border-dashed border-cream-300 px-5 py-3">
            <span className="absolute top-2 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-cream-300 md:hidden" aria-hidden />
            <h2 id={titleId} className="font-display text-xl font-semibold text-espresso-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-full text-espresso-600 hover:bg-cream-200"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        {/* Bottom gap: at least 1.75rem, more on phones with a home indicator (safe-area inset). */}
        <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))]">{children}</div>
      </div>
    </div>
  );
}

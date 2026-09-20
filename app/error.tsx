"use client";

import { btn } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 text-espresso-500">
        {error.message.includes("database") || error.message.includes("prisma")
          ? "Could not reach the database. Check the connection and try again."
          : "Please try again. If it keeps happening, reload the page."}
      </p>
      <button type="button" onClick={reset} className={`${btn.primary} mt-6`}>
        Try again
      </button>
    </div>
  );
}

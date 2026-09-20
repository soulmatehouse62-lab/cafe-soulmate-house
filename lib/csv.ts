import { CAFE_TZ } from "./dates";

const stampFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAFE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026-09-19 16:52" in cafe time — sorts correctly in spreadsheets. */
export function csvTimestamp(d: Date): string {
  const parts = Object.fromEntries(stampFormatter.formatToParts(d).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}`;
}

export function csvRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralise spreadsheet formula injection from free-text fields
  // (a leading +/- is allowed when the rest is a plain number, e.g. "+91 98765 43210").
  if (typeof value === "string" && (/^[=@\t\r]/.test(s) || /^[+-](?![\d\s]*$)/.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

/**
 * Streams a CSV built from keyset-paginated batches so large exports never
 * hold every row in memory at once.
 */
export function csvStreamResponse<T extends { id: string }>(
  filename: string,
  header: string[],
  fetchBatch: (cursor: string | undefined) => Promise<T[]>,
  toRow: (item: T) => (string | number | null | undefined)[],
): Response {
  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let started = false;
  let done = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          // BOM so Excel opens UTF-8 (₹, names) correctly.
          controller.enqueue(encoder.encode("﻿" + csvRow(header)));
          return;
        }
        if (done) {
          controller.close();
          return;
        }
        const batch = await fetchBatch(cursor);
        if (batch.length === 0) {
          done = true;
          controller.close();
          return;
        }
        cursor = batch[batch.length - 1].id;
        controller.enqueue(encoder.encode(batch.map((item) => csvRow(toRow(item))).join("")));
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

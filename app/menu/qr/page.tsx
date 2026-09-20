import { networkInterfaces } from "node:os";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { SoulmateMark } from "@/components/CategoryIcon";
import { PrintButton } from "@/components/PrintButton";
import { PageHeader, btn } from "@/components/ui";

export const dynamic = "force-dynamic";

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

/**
 * Where phones should open the menu. PUBLIC_BASE_URL wins (e.g. https://menu.mycafe.in);
 * otherwise the address this page was opened on, swapping localhost for this computer's
 * Wi-Fi address, since a phone can't reach "localhost".
 */
async function menuUrl(): Promise<{ url: string; note: string | null }> {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (configured) return { url: `${configured}/m`, note: null };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!LOCAL_HOSTS.test(host)) return { url: `${proto}://${host}/m`, note: null };

  const ip = lanAddress();
  const port = host.match(/:(\d+)$/)?.[1];
  if (!ip) return { url: `${proto}://${host}/m`, note: "This computer has no network address, so phones can’t open this link." };
  return {
    url: `http://${ip}${port ? `:${port}` : ""}/m`,
    note: "Using this computer’s Wi-Fi address. Phones must be on the same Wi-Fi, and this computer must keep the app running. If the address changes, reprint the code, or set PUBLIC_BASE_URL.",
  };
}

export default async function MenuQrPage() {
  await requireUser();
  const { url, note } = await menuUrl();
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#24150d", light: "#ffffff" },
  });

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow="For the tables"
        title="Menu QR code"
        subtitle="Customers scan it to see today’s menu. They can’t order or see anything else."
        actions={
          <Link href="/menu" className={btn.secondary}>
            Back
          </Link>
        }
      />

      {/* The printable card */}
      <div className="receipt mx-auto rounded-t-3xl p-6 text-center shadow-card print:shadow-none">
        <div className="flex items-center justify-center gap-2.5">
          <SoulmateMark className="h-10 w-10" />
          <span className="font-display text-2xl font-semibold italic tracking-tight text-espresso-900">Soulmate House</span>
        </div>
        <p className="mt-4 font-display text-xl font-semibold text-espresso-800">Scan for our menu</p>
        {/* SVG generated server-side by the qrcode library from our own URL */}
        <div className="mx-auto mt-3 w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 font-mono text-xs break-all text-espresso-500">{url}</p>
        <p className="mt-2 text-sm text-espresso-600">Order at the counter</p>
      </div>

      <div className="mt-5 space-y-3 print:hidden">
        {note ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{note}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <PrintButton />
          <a href={url} target="_blank" rel="noopener" className={btn.secondary}>
            Open menu
          </a>
        </div>
      </div>
    </div>
  );
}

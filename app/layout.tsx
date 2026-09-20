import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { BottomNav, TopNav } from "@/components/Nav";
import { getCurrentUser } from "@/lib/auth";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-serif",
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Soulmate House Cafe",
  description: "Orders, payments and dues for Soulmate House Cafe",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3a2215",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Only decides whether to show the navigation; each page enforces access itself.
  const user = await getCurrentUser();
  const navUser = user ? { name: user.name, isAdmin: user.role === "ADMIN" } : null;

  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {navUser ? <TopNav user={navUser} /> : null}
        <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-36 md:px-6 md:pt-8 md:pb-14 print:max-w-none print:p-0">
          {children}
        </main>
        {navUser ? <BottomNav /> : null}
      </body>
    </html>
  );
}

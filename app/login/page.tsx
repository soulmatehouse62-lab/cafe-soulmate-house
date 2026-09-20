import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { SoulmateMark } from "@/components/CategoryIcon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in · Soulmate House Cafe" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center py-8">
      <div className="roast-surface mb-6 flex items-center gap-3 rounded-3xl p-5 text-cream-50 shadow-lift">
        <SoulmateMark className="h-12 w-12 shrink-0" />
        <div className="leading-none">
          <p className="font-display text-2xl font-semibold italic tracking-tight">Soulmate House</p>
          <p className="mt-1.5 text-[10px] font-semibold tracking-[0.32em] text-caramel-300 uppercase">Café · Counter</p>
        </div>
      </div>
      <h1 className="font-display mb-1 text-3xl font-semibold tracking-tight text-espresso-900">Sign in</h1>
      <p className="mb-5 text-sm text-espresso-500">Use the account your cafe admin gave you.</p>
      <LoginForm next={next} />
    </div>
  );
}

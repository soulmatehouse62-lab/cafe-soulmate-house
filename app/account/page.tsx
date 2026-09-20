import Link from "next/link";
import { isAdmin, requireUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { ChangePasswordForm, SignOutOtherDevices } from "@/components/AccountForms";
import { PageHeader, btn, cardClass } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader eyebrow="Signed in" title={user.name} subtitle={`@${user.username} · ${isAdmin(user) ? "Admin" : "Staff"}`} />

      {isAdmin(user) ? (
        <Link href="/users" className={`${cardClass} flex items-center justify-between gap-3 p-4 hover:bg-cream-50`}>
          <span>
            <span className="font-display block text-lg font-semibold">Staff accounts</span>
            <span className="text-sm text-espresso-500">Add people, reset passwords, disable access</span>
          </span>
          <span aria-hidden className="text-2xl text-espresso-400">
            ›
          </span>
        </Link>
      ) : null}

      <section className={`${cardClass} p-4`}>
        <h2 className="font-display mb-3 text-lg font-semibold">Change password</h2>
        <ChangePasswordForm />
      </section>

      <section className={`${cardClass} space-y-3 p-4`}>
        <h2 className="font-display text-lg font-semibold">Sessions</h2>
        <SignOutOtherDevices />
        <form action={logout}>
          <button type="submit" className={`${btn.primary} w-full`}>
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

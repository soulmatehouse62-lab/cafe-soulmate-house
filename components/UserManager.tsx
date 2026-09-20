"use client";

import { useState, useTransition } from "react";
import { createUser, resetUserPassword, signOutUser, updateUser } from "@/app/actions/users";
import { formatDateTime } from "@/lib/dates";
import { Sheet } from "./Sheet";
import { EmptyState, ErrorText, PageHeader, btn, inputClass, labelClass } from "./ui";

type Role = "ADMIN" | "STAFF";

export interface ManagedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Unexpired sessions (devices signed in) */
  sessions: number;
}

type Dialog = { kind: "create" } | { kind: "edit"; user: ManagedUser } | { kind: "password"; user: ManagedUser };

export function UserManager({ users, meId }: { users: ManagedUser[]; meId: string }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [rowError, setRowError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function signOut(user: ManagedUser) {
    setRowError("");
    setBusyId(user.id);
    startTransition(async () => {
      const res = await signOutUser(user.id);
      if (!res.ok) setRowError(res.error);
      setBusyId(null);
    });
  }

  const close = () => setDialog(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Admin"
        title="Staff accounts"
        subtitle="Everyone signs in with their own account. Admins can also edit the menu, delete orders and payments, and manage staff."
        actions={
          <button type="button" onClick={() => setDialog({ kind: "create" })} className={btn.accent}>
            + Add person
          </button>
        }
      />
      <ErrorText>{rowError}</ErrorText>

      {users.length === 0 ? (
        <EmptyState title="No accounts yet" />
      ) : (
        <ul className="mt-3 overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-cream-200">
          {users.map((u, idx) => (
            <li key={u.id} className={`flex flex-wrap items-center gap-3 p-4 ${idx ? "border-t border-dashed border-cream-200" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className={`font-semibold ${u.isActive ? "text-espresso-900" : "text-espresso-400 line-through"}`}>
                  {u.name}
                  {u.id === meId ? <span className="ml-1.5 text-xs font-bold text-caramel-600">(you)</span> : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-espresso-500">
                  <span className="font-mono">@{u.username}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold ring-1 ring-inset ${
                      u.role === "ADMIN" ? "bg-caramel-300/30 text-espresso-800 ring-caramel-500/40" : "bg-cream-100 text-espresso-600 ring-cream-300"
                    }`}
                  >
                    {u.role === "ADMIN" ? "Admin" : "Staff"}
                  </span>
                  {u.isActive ? null : <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700 ring-1 ring-red-200 ring-inset">Disabled</span>}
                  <span>{u.lastLoginAt ? `Last sign-in ${formatDateTime(u.lastLoginAt)}` : "Never signed in"}</span>
                  {u.sessions > 0 ? <span>· {u.sessions} device{u.sessions === 1 ? "" : "s"}</span> : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setDialog({ kind: "edit", user: u })} className="min-h-11 rounded-xl px-3 text-sm font-bold text-espresso-700 hover:bg-cream-100">
                  Edit
                </button>
                <button type="button" onClick={() => setDialog({ kind: "password", user: u })} className="min-h-11 rounded-xl px-3 text-sm font-bold text-espresso-700 hover:bg-cream-100">
                  Reset password
                </button>
                {u.sessions > 0 && u.id !== meId ? (
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => signOut(u)}
                    className="min-h-11 rounded-xl px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "create" ? <CreateUserSheet onClose={close} /> : null}
      {dialog?.kind === "edit" ? <EditUserSheet key={dialog.user.id} user={dialog.user} isMe={dialog.user.id === meId} onClose={close} /> : null}
      {dialog?.kind === "password" ? <ResetPasswordSheet key={dialog.user.id} user={dialog.user} onClose={close} /> : null}
    </div>
  );
}

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className={labelClass}>Role</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["STAFF", "ADMIN"] as const).map((r) => (
          <label
            key={r}
            className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border text-sm font-semibold transition has-disabled:cursor-not-allowed has-disabled:opacity-60 ${
              value === r ? "border-espresso-800 bg-espresso-800 text-cream-50" : "border-cream-300 bg-white text-espresso-700"
            }`}
          >
            <input type="radio" name="role" value={r} checked={value === r} onChange={() => onChange(r)} className="sr-only" />
            {r === "ADMIN" ? "Admin" : "Staff"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PasswordFields({
  password,
  setPassword,
  confirm,
  setConfirm,
}: {
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
}) {
  return (
    <>
      <div>
        <label htmlFor="u-password" className={labelClass}>
          Password
        </label>
        <input
          id="u-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-espresso-500">At least 10 characters. Share it with the person privately; they can change it under Account.</p>
      </div>
      <div>
        <label htmlFor="u-confirm" className={labelClass}>
          Repeat password
        </label>
        <input
          id="u-confirm"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>
    </>
  );
}

function CreateUserSheet({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The passwords don’t match");
      return;
    }
    startTransition(async () => {
      const res = await createUser({ name, username, role, password });
      if (!res.ok) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title="Add a person">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="u-name" className={labelClass}>
            Name
          </label>
          <input id="u-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="u-username" className={labelClass}>
            Username
          </label>
          <input
            id="u-username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-espresso-500">Letters, numbers, dot, dash or underscore, 3–32 characters.</p>
        </div>
        <RolePicker value={role} onChange={setRole} />
        <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
          {pending ? "Saving…" : "Create account"}
        </button>
      </form>
    </Sheet>
  );
}

function EditUserSheet({ user, isMe, onClose }: { user: ManagedUser; isMe: boolean; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await updateUser(user.id, { name, role, isActive });
      if (!res.ok) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={`Edit @${user.username}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="e-name" className={labelClass}>
            Name
          </label>
          <input id="e-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <RolePicker value={role} onChange={setRole} disabled={isMe} />
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl border border-cream-300 bg-white px-4 has-disabled:cursor-not-allowed has-disabled:opacity-60">
          <span className="font-semibold text-espresso-800">Can sign in</span>
          <input type="checkbox" checked={isActive} disabled={isMe} onChange={(e) => setIsActive(e.target.checked)} className="h-5 w-5 accent-emerald-700" />
        </label>
        {isMe ? <p className="text-xs text-espresso-500">You can’t change your own role or disable yourself. Ask another admin.</p> : null}
        {!isMe && (role !== user.role || !isActive) ? (
          <p className="text-xs text-espresso-500">Saving signs this person out on every device.</p>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </Sheet>
  );
}

function ResetPasswordSheet({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The passwords don’t match");
      return;
    }
    startTransition(async () => {
      const res = await resetUserPassword(user.id, password);
      if (!res.ok) setError(res.error);
      else onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={`New password for @${user.username}`}>
      <form onSubmit={submit} className="space-y-3">
        <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
        <p className="text-xs text-espresso-500">This also signs them out everywhere and clears any sign-in lockout.</p>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
          {pending ? "Saving…" : "Set password"}
        </button>
      </form>
    </Sheet>
  );
}

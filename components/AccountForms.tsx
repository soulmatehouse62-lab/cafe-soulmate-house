"use client";

import { useState, useTransition } from "react";
import { changeOwnPassword, logoutOtherDevices } from "@/app/actions/auth";
import { ErrorText, btn, inputClass, labelClass } from "./ui";

function Success({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
      {children}
    </p>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    if (next !== confirm) {
      setError("The new passwords don’t match");
      return;
    }
    startTransition(async () => {
      const res = await changeOwnPassword({ current, next });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone("Password changed. Other devices have been signed out.");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="pw-current" className={labelClass}>
          Current password
        </label>
        <input
          id="pw-current"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="pw-new" className={labelClass}>
          New password
        </label>
        <input
          id="pw-new"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="pw-hint"
          className={inputClass}
        />
        <p id="pw-hint" className="mt-1 text-xs text-espresso-500">
          At least 10 characters. A short phrase is easier to remember than symbols.
        </p>
      </div>
      <div>
        <label htmlFor="pw-confirm" className={labelClass}>
          Repeat new password
        </label>
        <input
          id="pw-confirm"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Success>{done}</Success>
      <button type="submit" disabled={pending} className={`${btn.secondary} w-full`}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}

export function SignOutOtherDevices() {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Success>{done ? "Signed out everywhere else." : null}</Success>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await logoutOtherDevices();
            setDone(res.ok);
          })
        }
        className={`${btn.secondary} w-full`}
      >
        {pending ? "Working…" : "Sign out on all other devices"}
      </button>
    </>
  );
}

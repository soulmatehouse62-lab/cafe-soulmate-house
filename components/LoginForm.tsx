"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth";
import { ErrorText, btn, inputClass, labelClass } from "./ui";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="username" className={labelClass}>
          Username
        </label>
        <input
          id="username"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={32}
          defaultValue={state?.username ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            maxLength={128}
            className={`${inputClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-1 my-1 rounded-xl px-3 text-sm font-semibold text-espresso-600 hover:bg-cream-100"
            aria-pressed={showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <ErrorText>{state?.error}</ErrorText>
      <button type="submit" disabled={pending} className={`${btn.primary} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

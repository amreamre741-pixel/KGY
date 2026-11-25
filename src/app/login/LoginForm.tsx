"use client";

import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { IconAlert } from "@/components/icons";
import { login } from "../actions";

export default function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="stack">
      {state?.error && (
        <div className="alert alert-error" role="alert">
          <IconAlert />
          {state.error}
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor="username">
          {t.login.username}
        </label>
        <input
          className="input"
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          dir="ltr"
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">
          {t.login.password}
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
        />
      </div>
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={pending} id="login-submit">
        {pending ? "…" : t.login.submit}
      </button>
    </form>
  );
}

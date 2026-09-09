"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions/password-reset";

const fieldStyle = {
  padding: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
};

export function ResetPasswordForm({
  kind,
  token,
  loginHref,
}: {
  kind: "admin" | "customer";
  token: string;
  loginHref: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Parolele nu coincid.");
      return;
    }
    startTransition(async () => {
      const res = await resetPasswordAction({ kind, token, newPassword: password });
      if (!res.ok) setError(res.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, color: "#334155" }}>
          Parola a fost schimbată. Te poți autentifica acum.
        </p>
        <Link href={loginHref} style={{ color: "#0f172a", fontWeight: 600 }}>
          Intră în cont
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="password"
        placeholder="Parolă nouă"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={fieldStyle}
      />
      <input
        type="password"
        placeholder="Confirmă parola"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        required
        style={fieldStyle}
      />
      {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          background: "#0f172a",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        {isPending ? "Se salvează…" : "Salvează parola"}
      </button>
    </form>
  );
}

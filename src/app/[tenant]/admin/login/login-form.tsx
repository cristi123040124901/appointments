// src/app/[tenant]/admin/login/login-form.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { resendVerificationAction } from "@/lib/actions/email-verification";

export function LoginForm({ tenantSlug }: { tenantSlug: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  const callbackUrl = `/${tenantSlug}/admin`;

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // IMPORTANT: id-ul providerului s-a schimbat în 'admin-credentials'
    // (acum că există și un provider separat pentru clienți) — dacă ai
    // deja acest fișier din pasul anterior, actualizează linia de mai jos.
    const res = await signIn("admin-credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Email sau parolă greșită, sau cont neconfirmat încă.");
      return;
    }

    window.location.href = callbackUrl;
  }

  async function handleResend() {
    setResent(false);
    await resendVerificationAction({ kind: "admin", tenantSlug, email });
    setResent(true);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl })}
        style={{
          padding: "10px 16px",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Continuă cu Google
      </button>

      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        sau
      </div>

      <form
        onSubmit={handleCredentialsSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}
        />
        <input
          type="password"
          placeholder="Parolă"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 8 }}
        />
        {error && (
          <div style={{ display: "grid", gap: 4 }}>
            <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={handleResend}
              style={{
                background: "none",
                border: "none",
                color: "#64748b",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
                textAlign: "left",
              }}
            >
              Retrimite emailul de confirmare
            </button>
            {resent && (
              <p style={{ fontSize: 12, color: "#334155", margin: 0 }}>
                Dacă emailul e valid și încă neconfirmat, ți-am retrimis linkul.
              </p>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "#0f172a",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Se conectează..." : "Intră în cont"}
        </button>
      </form>

      <Link
        href={`/${tenantSlug}/admin/forgot-password`}
        style={{
          textAlign: "center",
          color: "#64748b",
          fontSize: 13,
          textDecoration: "underline",
        }}
      >
        Ai uitat parola?
      </Link>
      <Link
        href="/signup"
        style={{
          textAlign: "center",
          color: "#64748b",
          fontSize: 13,
          textDecoration: "underline",
        }}
      >
        Nu ai o afacere înregistrată? Creează una
      </Link>
    </div>
  );
}

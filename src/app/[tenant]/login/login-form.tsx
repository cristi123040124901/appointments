// src/app/[tenant]/login/login-form.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { registerCustomer } from "@/lib/actions/customer-auth";
import { resendVerificationAction } from "@/lib/actions/email-verification";

const CUSTOMER_INTENT_COOKIE = "pending_customer_tenant";

export function CustomerLoginForm({ tenantSlug }: { tenantSlug: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resent, setResent] = useState(false);

  const callbackUrl = `/${tenantSlug}/account`;

  function setCustomerIntentCookie() {
    // non-httpOnly intenționat: doar "poartă" tenant-ul peste redirect-ul
    // la Google, nu conține nimic sensibil. Expiră în 5 minute.
    document.cookie = `${CUSTOMER_INTENT_COOKIE}=${tenantSlug}; path=/; max-age=300; samesite=lax`;
  }

  async function handleGoogle() {
    setCustomerIntentCookie();
    await signIn("google", { callbackUrl });
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResent(false);

    const res = await signIn("customer-credentials", {
      tenantSlug,
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      // motivul exact (parolă greșită / cont blocat / email neconfirmat)
      // nu ne e expus de NextAuth — arătăm un mesaj generic + opțiunea de
      // a retrimite confirmarea, care nu strică nimic dacă nu e cazul
      setError("Email sau parolă greșită, sau cont neconfirmat încă.");
      return;
    }

    window.location.href = callbackUrl;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await registerCustomer({
      tenantSlug,
      name,
      phone,
      email,
      password,
    });

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // nu logăm automat — emailul trebuie confirmat mai întâi
    setRegistered(true);
  }

  async function handleResend() {
    setResent(false);
    await resendVerificationAction({ tenantSlug, email });
    setResent(true);
  }

  if (registered) {
    return (
      <p style={{ fontSize: 14, color: "#334155" }}>
        Cont creat! Ți-am trimis un email de confirmare — după ce dai click pe
        link, te poți autentifica.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        onClick={handleGoogle}
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
        onSubmit={mode === "login" ? handleLogin : handleRegister}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {mode === "register" && (
          <>
            <input
              placeholder="Nume"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                padding: 10,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            />
            <input
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={{
                padding: 10,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            />
          </>
        )}
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
            {mode === "login" && (
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
            )}
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
          {loading
            ? "Se procesează..."
            : mode === "login"
              ? "Intră în cont"
              : "Creează cont"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        style={{
          background: "none",
          border: "none",
          color: "#64748b",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        {mode === "login" ? "Nu ai cont? Creează unul" : "Ai deja cont? Intră"}
      </button>

      {mode === "login" && (
        <Link
          href={`/${tenantSlug}/forgot-password`}
          style={{
            textAlign: "center",
            color: "#64748b",
            fontSize: 13,
            textDecoration: "underline",
          }}
        >
          Ai uitat parola?
        </Link>
      )}
    </div>
  );
}

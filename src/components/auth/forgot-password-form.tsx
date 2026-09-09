"use client";

import { useState, useTransition } from "react";
import { requestPasswordResetAction } from "@/lib/actions/password-reset";

const fieldStyle = {
  padding: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
};

export function ForgotPasswordForm({
  kind,
  tenantSlug,
}: {
  kind: "admin" | "customer";
  tenantSlug: string;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await requestPasswordResetAction({ kind, tenantSlug, email });
      setSent(true);
    });
  }

  if (sent) {
    return (
      <p style={{ fontSize: 14, color: "#334155" }}>
        Dacă există un cont cu acest email, ți-am trimis un link de resetare.
        Verifică-ți inboxul.
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={fieldStyle}
      />
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
        {isPending ? "Se trimite…" : "Trimite link de resetare"}
      </button>
    </form>
  );
}

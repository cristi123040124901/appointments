"use client";

import { useState, useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import {
  checkSlugAvailableAction,
  registerTenantAction,
} from "@/lib/actions/tenant-signup";
import { slugify } from "@/lib/tenant-slug";

const OWNER_SIGNUP_INTENT_COOKIE = "pending_owner_signup";
const TIMEZONE = "Europe/Bucharest";

const fieldStyle = {
  padding: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
};

type SlugStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "unavailable"; reason?: string };

type CheckedSlug = { slug: string; available: boolean; reason?: string };

export function SignupForm() {
  const [businessName, setBusinessName] = useState("");
  const [manualSlug, setManualSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null); // slug al noii afaceri
  const [loading, setLoading] = useState(false);

  // slug-ul se derivă din numele afacerii cât timp utilizatorul nu l-a
  // editat manual el însuși — calculat direct în render, nu printr-un efect
  const slug = slugTouched ? manualSlug : slugify(businessName);

  const [checked, setChecked] = useState<CheckedSlug | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!slug) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const res = await checkSlugAvailableAction({ slug });
      if (res.ok) setChecked({ slug, available: res.data.available, reason: res.data.reason });
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  const slugStatus: SlugStatus = !slug
    ? { state: "idle" }
    : checked?.slug !== slug
      ? { state: "checking" }
      : checked.available
        ? { state: "available" }
        : { state: "unavailable", reason: checked.reason };

  function setOwnerSignupCookie() {
    const intent = JSON.stringify({ businessName, slug, timezone: TIMEZONE });
    // non-httpOnly intenționat, la fel ca CUSTOMER_INTENT_COOKIE — doar
    // "poartă" datele formularului peste redirect-ul la Google, expiră repede
    document.cookie = `${OWNER_SIGNUP_INTENT_COOKIE}=${encodeURIComponent(intent)}; path=/; max-age=300; samesite=lax`;
  }

  async function handleGoogle() {
    setError(null);
    if (!businessName.trim() || slugStatus.state !== "available") {
      setError("Completează numele afacerii și alege o adresă disponibilă mai întâi.");
      return;
    }
    setOwnerSignupCookie();
    await signIn("google", { callbackUrl: `/${slug}/admin` });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (slugStatus.state !== "available") {
      setError("Alege o adresă disponibilă pentru afacere.");
      return;
    }

    setLoading(true);
    const result = await registerTenantAction({
      businessName,
      ownerName,
      slug,
      email,
      password,
      timezone: TIMEZONE,
    });
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(result.data.slug);
  }

  if (done) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ fontSize: 14, color: "#334155" }}>
          Afacerea a fost creată! Adresa ta: <strong>/{done}</strong>
        </p>
        <p style={{ fontSize: 14, color: "#334155" }}>
          Ți-am trimis un email de confirmare — după ce dai click pe link, te
          poți autentifica și îți poți configura serviciile și echipa.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          placeholder="Numele afacerii (ex. Salon Ana)"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          style={fieldStyle}
        />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#94a3b8", fontSize: 14 }}>/</span>
            <input
              placeholder="adresa-afacerii"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setManualSlug(e.target.value.toLowerCase());
              }}
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
          {slug && (
            <p
              style={{
                fontSize: 12,
                marginTop: 4,
                color:
                  slugStatus.state === "available"
                    ? "#16a34a"
                    : slugStatus.state === "unavailable"
                      ? "#dc2626"
                      : "#94a3b8",
              }}
            >
              {slugStatus.state === "checking" && "Se verifică…"}
              {slugStatus.state === "available" && "Adresă disponibilă"}
              {slugStatus.state === "unavailable" &&
                (slugStatus.reason ?? "Adresă indisponibilă")}
            </p>
          )}
        </div>
      </div>

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

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          placeholder="Numele tău"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={fieldStyle}
        />
        <input
          type="password"
          placeholder="Parolă"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={fieldStyle}
        />

        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>
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
          {loading ? "Se creează…" : "Creează afacerea"}
        </button>
      </form>
    </div>
  );
}

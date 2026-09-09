// src/components/admin/styles.ts
//
// Stiluri inline, comune formelor din admin. Admin-ul e deliberat "unstyled"
// (vezi admin/(protected)/layout.tsx) — fără Tailwind, fără librărie de UI.
import type { CSSProperties } from "react";

export const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#334155",
};

export const input: CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 14,
};

export const primaryBtn: CSSProperties = {
  background: "#0f172a",
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};

export const secondaryBtn: CSSProperties = {
  background: "transparent",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};

export const dangerBtn: CSSProperties = {
  background: "transparent",
  color: "#dc2626",
  border: "1px solid #fecaca",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 14,
  cursor: "pointer",
};

export const card: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: 16,
};

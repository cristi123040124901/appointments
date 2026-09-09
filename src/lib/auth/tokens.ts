// src/lib/auth/tokens.ts
//
// Token-uri cu o singură folosință (resetare parolă, verificare email).
// Trimitem `raw` prin email (în URL) și stocăm doar `hash` în DB — dacă
// cineva citește tabelul, nu poate reconstitui link-ul de resetare.
import { randomBytes, createHash } from "crypto";

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

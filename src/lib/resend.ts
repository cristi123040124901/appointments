// src/lib/resend.ts
import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY nu e setat în .env");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Cât timp ești pe planul gratuit / nu ai domeniu verificat în Resend,
 * trimiți doar de pe `onboarding@resend.dev` și doar către adresa cu
 * care ești logat în Resend. Când verifici domeniul tenantului (sau al
 * tău, dacă ești tu owner-ul platformei), schimbi RESEND_FROM_EMAIL.
 */
export const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Programări <onboarding@resend.dev>";

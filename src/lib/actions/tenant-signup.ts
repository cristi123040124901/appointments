// src/lib/actions/tenant-signup.ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { sendVerificationEmail } from "@/lib/actions/email-verification";
import { isValidSlugFormat, isReservedSlug } from "@/lib/tenant-slug";
import type { ActionResult } from "@/lib/actions/admin-services";
import { pgErrorCode } from "@/lib/db-error";

const slugSchema = z.object({ slug: z.string().trim().toLowerCase() });

/** Verificare live în formular, înainte de submit. */
export async function checkSlugAvailableAction(
  raw: z.input<typeof slugSchema>,
): Promise<ActionResult<{ available: boolean; reason?: string }>> {
  const parsed = slugSchema.safeParse(raw);
  if (!parsed.success) return { ok: true, data: { available: false } };
  const { slug } = parsed.data;

  if (!isValidSlugFormat(slug)) {
    return {
      ok: true,
      data: { available: false, reason: "Doar litere mici, cifre și cratime (3-63 caractere)." },
    };
  }
  if (isReservedSlug(slug)) {
    return { ok: true, data: { available: false, reason: "Această adresă e rezervată." } };
  }

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  return {
    ok: true,
    data: existing
      ? { available: false, reason: "Adresa e deja folosită." }
      : { available: true },
  };
}

const signupSchema = z.object({
  businessName: z.string().trim().min(2, "Numele afacerii e prea scurt").max(120),
  ownerName: z.string().trim().min(2, "Numele e prea scurt").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlugFormat, "Adresă invalidă")
    .refine((s) => !isReservedSlug(s), "Această adresă e rezervată"),
  email: z.string().email("Email invalid"),
  password: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere"),
  timezone: z.string().min(1),
});

export async function registerTenantAction(
  raw: z.input<typeof signupSchema>,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { businessName, ownerName, slug, email, password, timezone } =
    parsed.data;

  const passwordHash = await hashPassword(password);

  let ownerId: string;
  try {
    ownerId = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: businessName, slug, timezone })
        .returning({ id: tenants.id });

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email,
          passwordHash,
          name: ownerName,
          role: "owner",
        })
        .returning({ id: users.id });

      return owner.id;
    });
  } catch (err) {
    // unique violation — fie slug-ul, fie emailul au fost luate chiar acum
    // (race între verificarea de disponibilitate și acest insert)
    if (pgErrorCode(err) === "23505") {
      return {
        ok: false,
        error: "Adresa sau emailul sunt deja folosite. Încearcă din nou.",
      };
    }
    throw err;
  }

  void sendVerificationEmail({
    kind: "admin",
    id: ownerId,
    tenantSlug: slug,
    tenantName: businessName,
    email,
  });

  return { ok: true, data: { slug } };
}

// src/lib/actions/email-verification.ts
"use server";

import { z } from "zod";
import { and, eq, isNull, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { customers, tenants, emailVerificationTokens } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { verifyEmailHtml } from "@/lib/email/verify-email";
import type { ActionResult } from "@/lib/actions/admin-services";
import { logger } from "@/lib/logger";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  return `${proto}://${host}`;
}

/** Apelat din registerCustomer după ce clientul e creat. Nu aruncă erori. */
export async function sendVerificationEmail(
  customerId: string,
  tenantSlug: string,
  tenantName: string,
  email: string,
): Promise<void> {
  const { raw, hash } = generateToken();

  await db.insert(emailVerificationTokens).values({
    customerId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });

  const origin = await baseUrl();
  const verifyUrl = `${origin}/${tenantSlug}/verify-email?token=${raw}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Confirmă emailul — ${tenantName}`,
      html: verifyEmailHtml({ verifyUrl, tenantName }),
    });
  } catch (err) {
    logger.error("sendVerificationEmail", err, { customerId });
  }
}

const requestSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
});

/** Retrimite verificarea. Mereu ok:true (fără enumerare de conturi). */
export async function resendVerificationAction(
  raw: z.input<typeof requestSchema>,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { ok: true, data: undefined };
  const { tenantSlug, email } = parsed.data;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) return { ok: true, data: undefined };

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenant.id), eq(customers.email, email)))
    .limit(1);
  if (!customer || !customer.email || customer.emailVerifiedAt)
    return { ok: true, data: undefined };

  await sendVerificationEmail(customer.id, tenantSlug, tenant.name, customer.email);
  return { ok: true, data: undefined };
}

const verifySchema = z.object({ token: z.string().min(10) });

export async function verifyEmailAction(
  raw: z.input<typeof verifySchema>,
): Promise<ActionResult> {
  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Link invalid." };

  const tokenHash = hashToken(parsed.data.token);
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Link invalid sau expirat." };

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));
    await tx
      .update(customers)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(customers.id, row.customerId));
  });

  return { ok: true, data: undefined };
}

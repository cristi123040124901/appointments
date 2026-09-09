// src/lib/actions/email-verification.ts
"use server";

import { z } from "zod";
import { and, eq, isNull, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { customers, users, tenants, emailVerificationTokens } from "@/db/schema";
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

/**
 * Apelat din registerCustomer / registerTenantAction după ce rândul e creat.
 * Nu aruncă erori — vezi comentariul din sendBookingConfirmationEmail.
 */
export async function sendVerificationEmail(input: {
  kind: "admin" | "customer";
  id: string; // customerId sau userId, după kind
  tenantSlug: string;
  tenantName: string;
  email: string;
}): Promise<void> {
  const { kind, id, tenantSlug, tenantName, email } = input;
  const { raw, hash } = generateToken();

  await db.insert(emailVerificationTokens).values({
    kind,
    userId: kind === "admin" ? id : null,
    customerId: kind === "customer" ? id : null,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });

  const origin = await baseUrl();
  const verifyPath = kind === "admin" ? "admin/verify-email" : "verify-email";
  const verifyUrl = `${origin}/${tenantSlug}/${verifyPath}?token=${raw}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Confirmă emailul — ${tenantName}`,
      html: verifyEmailHtml({ verifyUrl, tenantName }),
    });
  } catch (err) {
    logger.error("sendVerificationEmail", err, { kind, id });
  }
}

const requestSchema = z.object({
  kind: z.enum(["admin", "customer"]),
  tenantSlug: z.string().min(1),
  email: z.string().email(),
});

/** Retrimite verificarea. Mereu ok:true (fără enumerare de conturi). */
export async function resendVerificationAction(
  raw: z.input<typeof requestSchema>,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { ok: true, data: undefined };
  const { kind, tenantSlug, email } = parsed.data;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) return { ok: true, data: undefined };

  if (kind === "customer") {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenant.id), eq(customers.email, email)))
      .limit(1);
    if (!customer || !customer.email || customer.emailVerifiedAt)
      return { ok: true, data: undefined };

    await sendVerificationEmail({
      kind: "customer",
      id: customer.id,
      tenantSlug,
      tenantName: tenant.name,
      email: customer.email,
    });
  } else {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.email, email)))
      .limit(1);
    if (!user || user.emailVerifiedAt) return { ok: true, data: undefined };

    await sendVerificationEmail({
      kind: "admin",
      id: user.id,
      tenantSlug,
      tenantName: tenant.name,
      email: user.email,
    });
  }

  return { ok: true, data: undefined };
}

const verifySchema = z.object({
  kind: z.enum(["admin", "customer"]),
  token: z.string().min(10),
});

export async function verifyEmailAction(
  raw: z.input<typeof verifySchema>,
): Promise<ActionResult> {
  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Link invalid." };
  const { kind, token } = parsed.data;

  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        eq(emailVerificationTokens.kind, kind),
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

    if (kind === "customer" && row.customerId) {
      await tx
        .update(customers)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(customers.id, row.customerId));
    } else if (kind === "admin" && row.userId) {
      await tx
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, row.userId));
    }
  });

  return { ok: true, data: undefined };
}

// src/lib/actions/password-reset.ts
"use server";

import { z } from "zod";
import { and, eq, isNull, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { users, customers, tenants, passwordResetTokens } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { passwordResetHtml } from "@/lib/email/password-reset";
import type { ActionResult } from "@/lib/actions/admin-services";
import { logger } from "@/lib/logger";

const RESET_TTL_MS = 30 * 60 * 1000;

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  return `${proto}://${host}`;
}

const requestSchema = z.object({
  kind: z.enum(["admin", "customer"]),
  tenantSlug: z.string().min(1),
  email: z.string().email(),
});

/**
 * Întotdeauna răspunde ok:true, indiferent dacă emailul există — altfel
 * formularul de „am uitat parola" devine un oracol pentru „ce email-uri
 * există în sistem".
 */
export async function requestPasswordResetAction(
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

  const { raw: rawToken, hash } = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const origin = await baseUrl();

  if (kind === "admin") {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.tenantId, tenant.id)))
      .limit(1);
    if (!user) return { ok: true, data: undefined };

    await db.insert(passwordResetTokens).values({
      kind: "admin",
      userId: user.id,
      tokenHash: hash,
      expiresAt,
    });

    const resetUrl = `${origin}/${tenantSlug}/admin/reset-password?token=${rawToken}`;
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "Resetare parolă admin",
        html: passwordResetHtml({ resetUrl, tenantName: tenant.name }),
      });
    } catch (err) {
      // token-ul rămâne valid în DB — dacă a fost o eroare tranzitorie,
      // clientul poate cere un link nou; nu lăsăm asta să strice
      // răspunsul "ok" (evităm enumerarea conturilor)
      logger.error("requestPasswordResetAction (admin)", err);
    }
  } else {
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenant.id), eq(customers.email, email)))
      .limit(1);
    if (!customer || !customer.passwordHash) return { ok: true, data: undefined };

    await db.insert(passwordResetTokens).values({
      kind: "customer",
      customerId: customer.id,
      tokenHash: hash,
      expiresAt,
    });

    const resetUrl = `${origin}/${tenantSlug}/reset-password?token=${rawToken}`;
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "Resetare parolă",
        html: passwordResetHtml({ resetUrl, tenantName: tenant.name }),
      });
    } catch (err) {
      logger.error("requestPasswordResetAction (customer)", err);
    }
  }

  return { ok: true, data: undefined };
}

const resetSchema = z
  .object({
    kind: z.enum(["admin", "customer"]),
    token: z.string().min(10),
    newPassword: z.string().min(8, "Parola trebuie să aibă cel puțin 8 caractere"),
  })
  .strict();

export async function resetPasswordAction(
  raw: z.input<typeof resetSchema>,
): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { kind, token, newPassword } = parsed.data;

  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        eq(passwordResetTokens.kind, kind),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, error: "Link invalid sau expirat." };

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    if (kind === "admin" && row.userId) {
      await tx
        .update(users)
        .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(users.id, row.userId));
    } else if (kind === "customer" && row.customerId) {
      await tx
        .update(customers)
        .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
        .where(eq(customers.id, row.customerId));
    }
  });

  return { ok: true, data: undefined };
}

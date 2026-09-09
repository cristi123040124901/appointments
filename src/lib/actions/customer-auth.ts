// src/lib/actions/customer-auth.ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, tenants } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { sendVerificationEmail } from "@/lib/actions/email-verification";

type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerCustomer(input: {
  tenantSlug: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}): Promise<RegisterResult> {
  const { tenantSlug, name, email, phone, password } = input;

  if (password.length < 8) {
    return {
      ok: false,
      error: "Parola trebuie să aibă cel puțin 8 caractere.",
    };
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) return { ok: false, error: "Tenant inexistent." };

  const [existing] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenant.id), eq(customers.email, email)))
    .limit(1);

  if (existing) {
    return { ok: false, error: "Există deja un cont cu acest email." };
  }

  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(customers)
    .values({
      tenantId: tenant.id,
      name,
      email,
      phone,
      passwordHash,
    })
    .returning({ id: customers.id });

  // fire-and-forget, ca la confirmarea de booking — nu blocăm înregistrarea
  // dacă Resend e lent/pică
  void sendVerificationEmail({
    kind: "customer",
    id: created.id,
    tenantSlug,
    tenantName: tenant.name,
    email,
  });

  return { ok: true };
}

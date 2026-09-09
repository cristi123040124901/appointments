// src/lib/actions/admin-guard.ts
//
// Fiecare acțiune admin (services/staff/schedule/bookings) trebuie să
// verifice că cel logat e admin ȘI că aparține tenantului cerut — exact
// verificarea din admin/(protected)/layout.tsx, dar reutilizabilă din
// server actions (unde nu avem layout-ul „gratis").
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, type Tenant } from "@/db/schema";
import { auth } from "@/auth";

export type AdminGuardResult =
  | { ok: true; tenant: Tenant; userId: string }
  | { ok: false; error: string };

export async function requireAdmin(
  tenantSlug: string,
): Promise<AdminGuardResult> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) return { ok: false, error: "Tenant inexistent." };

  const session = await auth();
  const user = session?.user as
    | { id?: string; tenantId?: string; kind?: string }
    | undefined;

  if (!user || user.kind !== "admin" || user.tenantId !== tenant.id) {
    return { ok: false, error: "Neautorizat." };
  }

  return { ok: true, tenant, userId: user.id! };
}

// src/lib/actions/admin-staff.ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, staffServices, services } from "@/db/schema";
import { requireAdmin } from "@/lib/actions/admin-guard";
import type { ActionResult } from "@/lib/actions/admin-services";

const staffFields = z.object({
  name: z.string().trim().min(2, "Numele e prea scurt").max(120),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă")
    .optional(),
});

const createSchema = z.object({
  tenantSlug: z.string().min(1),
  ...staffFields.shape,
});

const updateSchema = z.object({
  tenantSlug: z.string().min(1),
  staffId: z.string().uuid(),
  ...staffFields.shape,
});

export async function createStaffAction(
  raw: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, ...fields } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const [created] = await db
    .insert(staff)
    .values({
      tenantId: guard.tenant.id,
      name: fields.name,
      bio: fields.bio || null,
      color: fields.color,
    })
    .returning({ id: staff.id });

  return { ok: true, data: { id: created.id } };
}

export async function updateStaffAction(
  raw: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, staffId, ...fields } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .update(staff)
    .set({
      name: fields.name,
      bio: fields.bio || null,
      ...(fields.color ? { color: fields.color } : {}),
    })
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
    .returning({ id: staff.id });

  if (result.length === 0) return { ok: false, error: "Membru inexistent." };
  return { ok: true, data: undefined };
}

export async function setStaffActiveAction(
  tenantSlug: string,
  staffId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .update(staff)
    .set({ isActive })
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
    .returning({ id: staff.id });

  if (result.length === 0) return { ok: false, error: "Membru inexistent." };
  return { ok: true, data: undefined };
}

export async function deleteStaffAction(
  tenantSlug: string,
  staffId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  try {
    const result = await db
      .delete(staff)
      .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
      .returning({ id: staff.id });

    if (result.length === 0) return { ok: false, error: "Membru inexistent." };
    return { ok: true, data: undefined };
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      return {
        ok: false,
        error:
          "Acest membru are rezervări asociate și nu poate fi șters — dezactivează-l în schimb.",
      };
    }
    throw err;
  }
}

/** Înlocuiește complet lista de servicii pe care le poate presta un staff. */
export async function setStaffServicesAction(
  tenantSlug: string,
  staffId: string,
  serviceIds: string[],
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  // verificăm că staff-ul și toate serviciile aparțin tenantului cerut,
  // altfel un id "împrumutat" de la alt tenant ar putea lega servicii străine
  const [ownedStaff] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
    .limit(1);
  if (!ownedStaff) return { ok: false, error: "Membru inexistent." };

  if (serviceIds.length > 0) {
    const owned = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.tenantId, guard.tenant.id));
    const ownedIds = new Set(owned.map((s) => s.id));
    if (!serviceIds.every((id) => ownedIds.has(id))) {
      return { ok: false, error: "Serviciu invalid." };
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(staffServices).where(eq(staffServices.staffId, staffId));
    if (serviceIds.length > 0) {
      await tx.insert(staffServices).values(
        serviceIds.map((serviceId) => ({
          staffId,
          serviceId,
        })),
      );
    }
  });

  return { ok: true, data: undefined };
}

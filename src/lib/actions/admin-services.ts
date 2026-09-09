// src/lib/actions/admin-services.ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requireAdmin } from "@/lib/actions/admin-guard";
import { pgErrorCode } from "@/lib/db-error";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const serviceFields = z.object({
  name: z.string().trim().min(2, "Numele e prea scurt").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  bufferMinutes: z.coerce.number().int().min(0).max(240),
  priceCents: z.coerce.number().int().min(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Culoare invalidă")
    .optional(),
});

const createSchema = z.object({
  tenantSlug: z.string().min(1),
  ...serviceFields.shape,
});

const updateSchema = z.object({
  tenantSlug: z.string().min(1),
  serviceId: z.string().uuid(),
  ...serviceFields.shape,
});

export async function createServiceAction(
  raw: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, ...fields } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const [created] = await db
    .insert(services)
    .values({
      tenantId: guard.tenant.id,
      name: fields.name,
      description: fields.description || null,
      durationMinutes: fields.durationMinutes,
      bufferMinutes: fields.bufferMinutes,
      priceCents: fields.priceCents,
      color: fields.color,
    })
    .returning({ id: services.id });

  return { ok: true, data: { id: created.id } };
}

export async function updateServiceAction(
  raw: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, serviceId, ...fields } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .update(services)
    .set({
      name: fields.name,
      description: fields.description || null,
      durationMinutes: fields.durationMinutes,
      bufferMinutes: fields.bufferMinutes,
      priceCents: fields.priceCents,
      ...(fields.color ? { color: fields.color } : {}),
    })
    .where(
      and(eq(services.id, serviceId), eq(services.tenantId, guard.tenant.id)),
    )
    .returning({ id: services.id });

  if (result.length === 0) return { ok: false, error: "Serviciu inexistent." };
  return { ok: true, data: undefined };
}

export async function setServiceActiveAction(
  tenantSlug: string,
  serviceId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .update(services)
    .set({ isActive })
    .where(
      and(eq(services.id, serviceId), eq(services.tenantId, guard.tenant.id)),
    )
    .returning({ id: services.id });

  if (result.length === 0) return { ok: false, error: "Serviciu inexistent." };
  return { ok: true, data: undefined };
}

export async function deleteServiceAction(
  tenantSlug: string,
  serviceId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  try {
    const result = await db
      .delete(services)
      .where(
        and(
          eq(services.id, serviceId),
          eq(services.tenantId, guard.tenant.id),
        ),
      )
      .returning({ id: services.id });

    if (result.length === 0)
      return { ok: false, error: "Serviciu inexistent." };
    return { ok: true, data: undefined };
  } catch (err) {
    // FK restrict — serviciul are rezervări istorice, nu poate fi șters
    if (pgErrorCode(err) === "23503") {
      return {
        ok: false,
        error:
          "Acest serviciu are rezervări asociate și nu poate fi șters — dezactivează-l în schimb.",
      };
    }
    throw err;
  }
}

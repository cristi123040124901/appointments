// src/lib/actions/admin-schedule.ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { staff, workingHours, scheduleExceptions } from "@/db/schema";
import { requireAdmin } from "@/lib/actions/admin-guard";
import type { ActionResult } from "@/lib/actions/admin-services";

const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Oră invalidă")
  .transform((v) => (v.length === 5 ? `${v}:00` : v));

const rangeSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: timeStr, endTime: timeStr })
  .refine((r) => r.endTime > r.startTime, {
    message: "Ora de sfârșit trebuie să fie după cea de început",
    path: ["endTime"],
  });

const setHoursSchema = z.object({
  tenantSlug: z.string().min(1),
  staffId: z.string().uuid(),
  ranges: z.array(rangeSchema),
});

/** Înlocuiește complet programul recurent al unui staff. */
export async function setWorkingHoursAction(
  raw: z.input<typeof setHoursSchema>,
): Promise<ActionResult> {
  const parsed = setHoursSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, staffId, ranges } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const [ownedStaff] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
    .limit(1);
  if (!ownedStaff) return { ok: false, error: "Membru inexistent." };

  await db.transaction(async (tx) => {
    await tx.delete(workingHours).where(eq(workingHours.staffId, staffId));
    if (ranges.length > 0) {
      await tx.insert(workingHours).values(
        ranges.map((r) => ({
          staffId,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
      );
    }
  });

  return { ok: true, data: undefined };
}

const exceptionSchema = z
  .object({
    tenantSlug: z.string().min(1),
    staffId: z.string().uuid().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dată invalidă"),
    isClosed: z.boolean(),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.isClosed || (v.startTime && v.endTime), {
    message: "Programul special are nevoie de oră de început și sfârșit",
    path: ["startTime"],
  })
  .refine((v) => v.isClosed || !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: "Ora de sfârșit trebuie să fie după cea de început",
    path: ["endTime"],
  });

export async function createExceptionAction(
  raw: z.input<typeof exceptionSchema>,
): Promise<ActionResult<{ id: string }>> {
  const parsed = exceptionSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, staffId, date, isClosed, startTime, endTime, reason } =
    parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  if (staffId) {
    const [ownedStaff] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.tenantId, guard.tenant.id)))
      .limit(1);
    if (!ownedStaff) return { ok: false, error: "Membru inexistent." };
  }

  const [created] = await db
    .insert(scheduleExceptions)
    .values({
      tenantId: guard.tenant.id,
      staffId,
      date,
      isClosed,
      startTime: isClosed ? null : startTime,
      endTime: isClosed ? null : endTime,
      reason: reason || null,
    })
    .returning({ id: scheduleExceptions.id });

  return { ok: true, data: { id: created.id } };
}

export async function deleteExceptionAction(
  tenantSlug: string,
  exceptionId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .delete(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.id, exceptionId),
        eq(scheduleExceptions.tenantId, guard.tenant.id),
      ),
    )
    .returning({ id: scheduleExceptions.id });

  if (result.length === 0) return { ok: false, error: "Excepție inexistentă." };
  return { ok: true, data: undefined };
}

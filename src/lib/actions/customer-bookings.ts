// src/lib/actions/customer-bookings.ts
"use server";

import { z } from "zod";
import { and, eq, gt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, tenants } from "@/db/schema";
import { auth } from "@/auth";
import type { ActionResult } from "@/lib/actions/admin-services";
import { sendBookingCancellationEmail } from "@/lib/notifications/send-booking-cancellation";

const cancelSchema = z.object({
  tenantSlug: z.string().min(1),
  bookingId: z.string().uuid(),
});

export async function cancelOwnBookingAction(
  raw: z.input<typeof cancelSchema>,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, bookingId } = parsed.data;

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
  if (!user || user.kind !== "customer" || user.tenantId !== tenant.id) {
    return { ok: false, error: "Neautorizat." };
  }

  const result = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.tenantId, tenant.id),
        eq(bookings.customerId, user.id!),
        gt(bookings.startAt, new Date()),
        notInArray(bookings.status, ["cancelled", "completed", "no_show"]),
      ),
    )
    .returning({ id: bookings.id });

  if (result.length === 0)
    return {
      ok: false,
      error: "Rezervarea nu poate fi anulată (inexistentă sau deja trecută).",
    };

  void sendBookingCancellationEmail(bookingId, "customer");
  return { ok: true, data: undefined };
}

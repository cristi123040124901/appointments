// src/lib/actions/admin-bookings.ts
"use server";

import { z } from "zod";
import { and, eq, notInArray, desc } from "drizzle-orm";
import { db } from "@/db";
import { bookings, notifications } from "@/db/schema";
import { requireAdmin } from "@/lib/actions/admin-guard";
import type { ActionResult } from "@/lib/actions/admin-services";
import { sendBookingConfirmationEmail } from "@/lib/notifications/send-booking-confirmation";
import { sendBookingCancellationEmail } from "@/lib/notifications/send-booking-cancellation";

const cancelSchema = z.object({
  tenantSlug: z.string().min(1),
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
});

export async function cancelBookingAction(
  raw: z.input<typeof cancelSchema>,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0].message };
  const { tenantSlug, bookingId, reason } = parsed.data;

  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const result = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancellationReason: reason || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.tenantId, guard.tenant.id),
        notInArray(bookings.status, ["cancelled", "completed", "no_show"]),
      ),
    )
    .returning({ id: bookings.id });

  if (result.length === 0)
    return {
      ok: false,
      error: "Rezervarea nu poate fi anulată (inexistentă sau deja închisă).",
    };

  void sendBookingCancellationEmail(bookingId, "admin");
  return { ok: true, data: undefined };
}

/** Retrimite emailul de confirmare — util când primul a eșuat (vezi tabelul notifications). */
export async function resendConfirmationAction(
  tenantSlug: string,
  bookingId: string,
): Promise<ActionResult> {
  const guard = await requireAdmin(tenantSlug);
  if (!guard.ok) return guard;

  const [row] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(eq(bookings.id, bookingId), eq(bookings.tenantId, guard.tenant.id)),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Rezervare inexistentă." };

  await sendBookingConfirmationEmail(bookingId);

  // sendBookingConfirmationEmail nu aruncă erori (vezi comentariul din
  // fișierul ei) — citim rezultatul real din notifications, ultimul rând scris
  const [latest] = await db
    .select({ status: notifications.status })
    .from(notifications)
    .where(eq(notifications.bookingId, bookingId))
    .orderBy(desc(notifications.createdAt))
    .limit(1);

  if (!latest) {
    return { ok: false, error: "Clientul nu are un email salvat." };
  }
  if (latest.status === "failed") {
    return { ok: false, error: "Trimiterea a eșuat." };
  }
  return { ok: true, data: undefined };
}

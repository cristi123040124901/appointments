// src/lib/notifications/send-booking-cancellation.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, tenants, notifications } from "@/db/schema";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { bookingCancellationHtml } from "@/lib/email/booking-cancellation";
import { logger } from "@/lib/logger";

/** Aceeași logică de eșec-tăcut ca sendBookingConfirmationEmail — vezi acolo. */
export async function sendBookingCancellationEmail(
  bookingId: string,
  cancelledBy: "customer" | "admin",
): Promise<void> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      tenantId: bookings.tenantId,
      serviceName: bookings.serviceName,
      startAt: bookings.startAt,
      customerName: customers.name,
      customerEmail: customers.email,
      tenantName: tenants.name,
      tenantTimezone: tenants.timezone,
      tenantBrandColor: tenants.brandColor,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) {
    logger.error(
      "sendBookingCancellationEmail",
      new Error(`booking ${bookingId} nu există`),
    );
    return;
  }
  if (!row.customerEmail) return;

  const dateLabel = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: row.tenantTimezone,
  }).format(row.startAt);

  const timeLabel = new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: row.tenantTimezone,
  }).format(row.startAt);

  const html = bookingCancellationHtml({
    tenantName: row.tenantName,
    brandColor: row.tenantBrandColor,
    customerName: row.customerName,
    serviceName: row.serviceName,
    dateLabel,
    timeLabel,
    cancelledBy,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: row.customerEmail,
      subject: `Programare anulată — ${row.tenantName}`,
      html,
    });

    if (error) {
      await db.insert(notifications).values({
        tenantId: row.tenantId,
        bookingId: row.bookingId,
        channel: "email",
        type: "cancellation",
        status: "failed",
        recipient: row.customerEmail,
        error: error.message,
      });
      logger.error("sendBookingCancellationEmail", new Error(error.message), {
        bookingId,
      });
      return;
    }

    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "cancellation",
      status: "sent",
      recipient: row.customerEmail,
      providerId: data?.id,
      sentAt: new Date(),
    });
  } catch (err) {
    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "cancellation",
      status: "failed",
      recipient: row.customerEmail,
      error: err instanceof Error ? err.message : "unknown error",
    });
    logger.error("sendBookingCancellationEmail (network)", err, { bookingId });
  }
}

// src/lib/notifications/send-booking-confirmation.ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  customers,
  staff,
  tenants,
  notifications,
} from "@/db/schema";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { bookingConfirmationHtml } from "@/lib/email/booking-confirmation";
import { logger } from "@/lib/logger";

/**
 * Trimite emailul de confirmare pentru un booking deja salvat.
 *
 * Important: NU aruncă eroare dacă emailul eșuează. Rezervarea deja
 * există în DB — dacă am lăsa o eroare de rețea/Resend să propage în
 * sus, clientul ar vedea "nu am putut salva rezervarea" pentru o
 * rezervare care de fapt s-a făcut. Eșecul se înregistrează în
 * `notifications` (status = 'failed') și poate fi retrimis manual
 * din admin mai târziu.
 */
export async function sendBookingConfirmationEmail(
  bookingId: string,
): Promise<void> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      tenantId: bookings.tenantId,
      serviceName: bookings.serviceName,
      priceCents: bookings.priceCents,
      startAt: bookings.startAt,
      customerName: customers.name,
      customerEmail: customers.email,
      staffName: staff.name,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      tenantTimezone: tenants.timezone,
      tenantBrandColor: tenants.brandColor,
      tenantAddress: tenants.address,
      tenantPhone: tenants.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!row) {
    logger.error(
      "sendBookingConfirmationEmail",
      new Error(`booking ${bookingId} nu există`),
    );
    return;
  }

  // Clientul e opțional în schemă (identificatorul principal e telefonul).
  // Fără email, nu e o eroare — pur și simplu nu trimitem nimic.
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

  const priceLabel = `${(row.priceCents / 100).toFixed(0)} lei`;

  const html = bookingConfirmationHtml({
    tenantName: row.tenantName,
    brandColor: row.tenantBrandColor,
    customerName: row.customerName,
    serviceName: row.serviceName,
    staffName: row.staffName,
    dateLabel,
    timeLabel,
    priceLabel,
    tenantAddress: row.tenantAddress,
    tenantPhone: row.tenantPhone,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: row.customerEmail,
      subject: `Confirmare programare — ${row.tenantName}`,
      html,
    });

    if (error) {
      await db.insert(notifications).values({
        tenantId: row.tenantId,
        bookingId: row.bookingId,
        channel: "email",
        type: "confirmation",
        status: "failed",
        recipient: row.customerEmail,
        error: error.message,
      });
      logger.error("sendBookingConfirmationEmail", new Error(error.message), {
        bookingId,
      });
      return;
    }

    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "confirmation",
      status: "sent",
      recipient: row.customerEmail,
      providerId: data?.id,
      sentAt: new Date(),
    });
  } catch (err) {
    // eroare de rețea etc., nu una întoarsă structurat de Resend
    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "confirmation",
      status: "failed",
      recipient: row.customerEmail,
      error: err instanceof Error ? err.message : "unknown error",
    });
    logger.error("sendBookingConfirmationEmail (network)", err, { bookingId });
  }
}

// src/lib/notifications/send-booking-reminder.ts
import { and, eq, gte, lt, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  customers,
  staff,
  tenants,
  notifications,
} from "@/db/schema";
import { resend, EMAIL_FROM } from "@/lib/resend";
import { bookingReminderHtml } from "@/lib/email/booking-reminder";
import { logger } from "@/lib/logger";

const REMINDER_WINDOW_START_MS = 23 * 60 * 60 * 1000;
const REMINDER_WINDOW_END_MS = 25 * 60 * 60 * 1000;

async function sendReminderEmail(bookingId: string): Promise<void> {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      tenantId: bookings.tenantId,
      serviceName: bookings.serviceName,
      startAt: bookings.startAt,
      customerName: customers.name,
      customerEmail: customers.email,
      staffName: staff.name,
      tenantName: tenants.name,
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

  if (!row || !row.customerEmail) return;

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

  const html = bookingReminderHtml({
    tenantName: row.tenantName,
    brandColor: row.tenantBrandColor,
    customerName: row.customerName,
    serviceName: row.serviceName,
    staffName: row.staffName,
    dateLabel,
    timeLabel,
    tenantAddress: row.tenantAddress,
    tenantPhone: row.tenantPhone,
  });

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: row.customerEmail,
      subject: `Reminder programare — ${row.tenantName}`,
      html,
    });

    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "reminder",
      status: error ? "failed" : "sent",
      recipient: row.customerEmail,
      providerId: data?.id,
      error: error?.message,
      sentAt: error ? undefined : new Date(),
    });
    if (error)
      logger.error("sendBookingReminderEmail", new Error(error.message), {
        bookingId,
      });
  } catch (err) {
    await db.insert(notifications).values({
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      channel: "email",
      type: "reminder",
      status: "failed",
      recipient: row.customerEmail,
      error: err instanceof Error ? err.message : "unknown error",
    });
    logger.error("sendBookingReminderEmail (network)", err, { bookingId });
  }
}

/**
 * Trimite remindere pentru rezervările care încep în fereastra [23h, 25h)
 * de acum. Gândit să fie apelat orar (vezi /api/cron/reminders) — fereastra
 * de 2h + verificarea "deja trimis" fac funcția idempotentă la rulări
 * repetate/suprapuse.
 */
export async function sendDueReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_MS);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_MS);

  // exclude doar rezervările care AU DEJA un reminder trimis cu succes —
  // dacă a eșuat (ex. Resend indisponibil), voim să încercăm din nou la
  // următoarea rulare (orară) cât timp mai suntem în fereastră
  const alreadySent = db
    .select({ bookingId: notifications.bookingId })
    .from(notifications)
    .where(
      and(eq(notifications.type, "reminder"), eq(notifications.status, "sent")),
    );

  const due = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        gte(bookings.startAt, windowStart),
        lt(bookings.startAt, windowEnd),
        notInArray(bookings.status, ["cancelled", "no_show"]),
        notInArray(bookings.id, alreadySent),
      ),
    );

  for (const b of due) {
    await sendReminderEmail(b.id);
  }

  return { sent: due.length };
}

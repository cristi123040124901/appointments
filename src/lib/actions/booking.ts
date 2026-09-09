"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  services,
  staff as staffTable,
  staffServices,
  customers,
  bookings,
} from "@/db/schema";
import { getAvailability } from "@/lib/availability.query";
import { sendBookingConfirmationEmail } from "@/lib/notifications/send-booking-confirmation";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";

/* ------------------------------------------------------------------ */
/* Validare                                                            */
/* ------------------------------------------------------------------ */

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dată invalidă");

const slotsSchema = z.object({
  tenantSlug: z.string().min(1),
  serviceId: z.string().uuid(),
  from: dateStr,
  to: dateStr,
  staffId: z.string().uuid().optional(),
});

/** Acceptă 07xx xxx xxx sau +407xxxxxxxx, stochează E.164. */
const phoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s.-]/g, ""))
  .refine((v) => /^(\+40|0)7\d{8}$/.test(v), "Număr de telefon invalid")
  .transform((v) => (v.startsWith("0") ? `+4${v}` : v));

const createSchema = z.object({
  tenantSlug: z.string().min(1),
  serviceId: z.string().uuid(),
  /** null = „oricine disponibil" */
  staffId: z.string().uuid().nullable(),
  startAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
  // câmpuri de guest — necesare doar dacă nu e client logat pe tenantul ăsta
  name: z.string().trim().min(2, "Numele e prea scurt").max(80).optional(),
  phone: phoneSchema.optional(),
  email: z.string().email("Email invalid").optional().or(z.literal("")),
  // folosit doar ca să completăm telefonul unui client logat care nu are unul
  // (ex. cont creat prin Google)
  phoneOverride: phoneSchema.optional(),
});

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Citirea sloturilor                                                  */
/* ------------------------------------------------------------------ */

export type SlotDTO = {
  startAt: string;
  localTime: string;
  staffIds: string[];
};

export async function getSlotsAction(
  raw: z.input<typeof slotsSchema>,
): Promise<ActionResult<{ date: string; slots: SlotDTO[] }[]>> {
  const parsed = slotsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Cerere invalidă" };

  const result = await getAvailability(parsed.data);
  if (!result) return { ok: false, error: "Serviciu indisponibil" };

  return {
    ok: true,
    data: result.days.map((d) => ({
      date: d.date,
      slots: d.slots.map((s) => ({
        startAt: s.startAt.toISOString(),
        localTime: s.localTime,
        staffIds: s.staffIds,
      })),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Crearea rezervării                                                  */
/* ------------------------------------------------------------------ */

export async function createBookingAction(
  raw: z.input<typeof createSchema>,
): Promise<ActionResult<{ bookingId: string }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Date invalide",
    };
  }
  const input = parsed.data;
  const startAt = new Date(input.startAt);

  /* 1. Tenant */
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, input.tenantSlug))
    .limit(1);
  if (!tenant) return { ok: false, error: "Salon inexistent" };

  /* 2. Serviciul — verificat că e al ACESTUI tenant.
        Fără verificarea asta, un serviceId din alt salon ar trece. */
  const [service] = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.id, input.serviceId),
        eq(services.tenantId, tenant.id),
        eq(services.isActive, true),
      ),
    )
    .limit(1);
  if (!service) return { ok: false, error: "Serviciu indisponibil" };

  /* 3. Recalculăm disponibilitatea. Nu ne bazăm pe ce a trimis browserul:
        între afișarea sloturilor și apăsarea butonului pot trece minute bune,
        iar un client rău-intenționat poate trimite orice oră. */
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: tenant.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startAt); // 'YYYY-MM-DD'

  const availability = await getAvailability({
    tenantSlug: input.tenantSlug,
    serviceId: input.serviceId,
    from: localDate,
    to: localDate,
    staffId: input.staffId ?? undefined,
  });

  const slot = availability?.days[0]?.slots.find(
    (s) => s.startAt.getTime() === startAt.getTime(),
  );
  if (!slot)
    return {
      ok: false,
      error: "Ora selectată nu mai e disponibilă. Alege alta.",
    };

  /* 4. Prestatorul. La „oricine disponibil" alegem primul liber.
        Dacă vrei repartizare echilibrată, aici e locul. */
  const chosenStaffId = input.staffId ?? slot.staffIds[0];
  if (!chosenStaffId || !slot.staffIds.includes(chosenStaffId)) {
    return { ok: false, error: "Prestatorul nu mai e disponibil la ora asta." };
  }

  /* 5. Durata efectivă (cu override), pentru snapshot */
  const [link] = await db
    .select({
      durationOverride: staffServices.durationOverride,
      priceOverrideCents: staffServices.priceOverrideCents,
    })
    .from(staffServices)
    .innerJoin(staffTable, eq(staffTable.id, staffServices.staffId))
    .where(
      and(
        eq(staffServices.staffId, chosenStaffId),
        eq(staffServices.serviceId, service.id),
        eq(staffTable.tenantId, tenant.id),
      ),
    )
    .limit(1);
  if (!link) return { ok: false, error: "Prestatorul nu oferă acest serviciu" };

  const duration = link.durationOverride ?? service.durationMinutes;
  const price = link.priceOverrideCents ?? service.priceCents;
  const serviceEndAt = new Date(startAt.getTime() + duration * 60_000);
  const endAt = new Date(
    serviceEndAt.getTime() + service.bufferMinutes * 60_000,
  );

  /* 6. Client: cel logat (dacă are cont pe tenantul ăsta) sau guest
        regăsit/creat după telefon. Nu avem încredere în ce zice clientul
        despre cine e — verificăm sesiunea direct pe server, nu un
        customerId trimis din browser. */
  const session = await auth();
  const su = session?.user as
    | { kind?: string; tenantId?: string; id?: string }
    | undefined;

  let customer: typeof customers.$inferSelect;

  if (su?.kind === "customer" && su.tenantId === tenant.id) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, su.id!), eq(customers.tenantId, tenant.id)))
      .limit(1);
    if (!existing) return { ok: false, error: "Contul nu a fost găsit." };

    if (existing.phone) {
      customer = existing;
    } else {
      // cont creat prin Google: n-avem telefon, îl cerem o singură dată aici
      if (!input.phoneOverride) {
        return { ok: false, error: "Numărul de telefon e obligatoriu." };
      }
      const [updated] = await db
        .update(customers)
        .set({ phone: input.phoneOverride })
        .where(eq(customers.id, existing.id))
        .returning();
      customer = updated;
    }
  } else {
    if (!input.name || !input.phone) {
      return { ok: false, error: "Numele și telefonul sunt obligatorii." };
    }
    const [created] = await db
      .insert(customers)
      .values({
        tenantId: tenant.id,
        phone: input.phone,
        name: input.name,
        email: input.email || null,
      })
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.phone],
        set: { name: input.name },
      })
      .returning();
    customer = created;
  }

  /* 7. Inserare. Constrângerea EXCLUDE e ultima linie de apărare:
        dacă doi clienți apasă butonul în aceeași secundă, unul primește 23P01. */
  try {
    const [booking] = await db
      .insert(bookings)
      .values({
        tenantId: tenant.id,
        customerId: customer.id,
        staffId: chosenStaffId,
        serviceId: service.id,
        startAt,
        serviceEndAt,
        endAt,
        serviceName: service.name,
        durationMinutes: duration,
        bufferMinutes: service.bufferMinutes,
        priceCents: price,
        status: "confirmed",
        notes: input.notes || null,
      })
      .returning({ id: bookings.id });

    // Nu blocăm răspunsul către client de trimiterea emailului — dacă
    // Resend e lent, clientul tot vede confirmarea imediat. Funcția
    // își gestionează singură eșecurile (vezi notifications.status).
    void sendBookingConfirmationEmail(booking.id);

    return { ok: true, data: { bookingId: booking.id } };
  } catch (err) {
    if ((err as { code?: string }).code === "23P01") {
      return {
        ok: false,
        error: "Cineva tocmai a rezervat ora asta. Alege alta.",
      };
    }
    logger.error("createBooking", err);
    return {
      ok: false,
      error: "Nu am putut salva rezervarea. Încearcă din nou.",
    };
  }
}

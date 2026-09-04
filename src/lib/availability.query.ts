import {
  and,
  eq,
  gte,
  lt,
  gt,
  inArray,
  isNull,
  or,
  notInArray,
} from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  services,
  staff as staffTable,
  staffServices,
  workingHours,
  scheduleExceptions,
  bookings,
} from "@/db/schema";
import {
  computeAvailability,
  dateRange,
  zonedToUtc,
  type DayAvailability,
  type ExceptionInput,
} from "./availability";

/**
 * Încarcă tot ce trebuie din DB și deleagă calculul funcției pure.
 * Un singur round-trip pe tabel, fără query în buclă.
 */
export async function getAvailability(params: {
  tenantSlug: string;
  serviceId: string;
  /** 'YYYY-MM-DD', date locale */
  from: string;
  to: string;
  /** dacă e dat, se restrânge la un singur prestator */
  staffId?: string;
}): Promise<{
  tenantId: string;
  timezone: string;
  days: DayAvailability[];
} | null> {
  const { tenantSlug, serviceId, from, to, staffId } = params;

  /* 1. Tenant */
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);
  if (!tenant) return null;

  /* 2. Serviciu — verificat că aparține tenantului. Fără asta, cineva poate
        cere sloturi pentru serviciul altui salon trimițând alt serviceId. */
  const [service] = await db
    .select()
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.tenantId, tenant.id),
        eq(services.isActive, true),
      ),
    )
    .limit(1);
  if (!service) return null;

  /* 3. Prestatorii care fac serviciul, cu override-urile lor */
  const eligible = await db
    .select({
      id: staffTable.id,
      name: staffTable.name,
      durationOverride: staffServices.durationOverride,
    })
    .from(staffServices)
    .innerJoin(staffTable, eq(staffTable.id, staffServices.staffId))
    .where(
      and(
        eq(staffServices.serviceId, serviceId),
        eq(staffTable.tenantId, tenant.id),
        eq(staffTable.isActive, true),
        ...(staffId ? [eq(staffTable.id, staffId)] : []),
      ),
    );

  if (eligible.length === 0) {
    return { tenantId: tenant.id, timezone: tenant.timezone, days: [] };
  }
  const staffIds = eligible.map((s) => s.id);

  /* 4. Program recurent */
  const hours = await db
    .select()
    .from(workingHours)
    .where(inArray(workingHours.staffId, staffIds));

  /* 5. Excepții: ale tenantului (staffId null) + ale prestatorilor vizați */
  const exceptions = await db
    .select()
    .from(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.tenantId, tenant.id),
        gte(scheduleExceptions.date, from),
        lt(scheduleExceptions.date, nextDay(to)),
        or(
          isNull(scheduleExceptions.staffId),
          inArray(scheduleExceptions.staffId, staffIds),
        ),
      ),
    );

  /* 6. Rezervări active care ating intervalul.
        Marja de o zi în ambele capete acoperă diferența de fus orar. */
  const rangeStart = zonedToUtc(prevDay(from), "00:00", tenant.timezone);
  const rangeEnd = zonedToUtc(nextDay(nextDay(to)), "00:00", tenant.timezone);

  const booked = await db
    .select({
      staffId: bookings.staffId,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.staffId, staffIds),
        lt(bookings.startAt, rangeEnd),
        gt(bookings.endAt, rangeStart),
        notInArray(bookings.status, ["cancelled", "no_show"]),
      ),
    );

  /* 7. Calcul */
  const days = computeAvailability({
    timezone: tenant.timezone,
    dates: dateRange(from, to),
    staff: eligible.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationOverride ?? service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      workingHours: hours
        .filter((h) => h.staffId === s.id)
        .map((h) => ({
          weekday: h.weekday,
          startTime: h.startTime,
          endTime: h.endTime,
        })),
    })),
    exceptions: exceptions.map(
      (e): ExceptionInput => ({
        staffId: e.staffId,
        date: e.date,
        isClosed: e.isClosed,
        startTime: e.startTime,
        endTime: e.endTime,
      }),
    ),
    bookings: booked,
  });

  return { tenantId: tenant.id, timezone: tenant.timezone, days };
}

/* helperi de dată pe string, ca să nu amestecăm Date în calculul de calendar */
function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
const nextDay = (d: string) => shiftDay(d, 1);
const prevDay = (d: string) => shiftDay(d, -1);

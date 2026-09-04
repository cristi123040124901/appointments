/**
 * Calculul sloturilor libere.
 *
 * Funcțiile de aici sunt PURE: primesc date, returnează date, nu ating baza.
 * Tot ce ține de query-uri stă în availability.query.ts.
 * Motivul: cazurile grele (ora de vară, excepții, buffere) se testează cu
 * vitest în milisecunde, fără Postgres pornit.
 *
 * Convenții:
 *  - orele de program sunt LOCALE ('09:00'), interpretate în timezone-ul tenantului
 *  - rezervările sunt momente absolute (Date, adică UTC intern)
 *  - intervalele sunt half-open [start, end): 10:00-11:00 și 11:00-12:00 nu se suprapun
 */

/* ------------------------------------------------------------------ */
/* Helperi de fus orar                                                 */
/* ------------------------------------------------------------------ */

/**
 * Ora locală dintr-un fus → Date (UTC).
 *
 * Trucul: formatezi timestamp-ul naiv în fusul țintă, îl recompui ca și cum ar
 * fi UTC, iar diferența e offset-ul real pentru ACEA dată. Deci ora de vară e
 * tratată corect fără tabele hardcodate.
 */
export function zonedToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const hhmm = timeStr.slice(0, 5);
  const naive = new Date(`${dateStr}T${hhmm}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(naive).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asIfUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour % 24,
    +p.minute,
    +p.second,
  );
  return new Date(naive.getTime() - (asIfUtc - naive.getTime()));
}

/** Ziua săptămânii (0 = duminică) pentru o dată locală 'YYYY-MM-DD'. */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** Listă de date locale 'YYYY-MM-DD', inclusiv capetele. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/* ------------------------------------------------------------------ */
/* Tipuri                                                              */
/* ------------------------------------------------------------------ */

export type WorkingHourInput = {
  weekday: number;
  startTime: string; // '09:00' sau '09:00:00'
  endTime: string;
};

export type ExceptionInput = {
  /** null = se aplică întregului tenant */
  staffId: string | null;
  date: string; // 'YYYY-MM-DD'
  isClosed: boolean;
  startTime: string | null;
  endTime: string | null;
};

export type BookingInput = {
  staffId: string;
  /** include deja bufferul rezervării respective */
  startAt: Date;
  endAt: Date;
};

export type StaffInput = {
  id: string;
  name: string;
  /** durata efectivă pentru serviciul cerut, cu override-ul aplicat */
  durationMinutes: number;
  bufferMinutes: number;
  workingHours: WorkingHourInput[];
};

export type AvailabilityInput = {
  timezone: string;
  dates: string[];
  staff: StaffInput[];
  exceptions: ExceptionInput[];
  bookings: BookingInput[];
  /** implicit: durata + buffer, per staff. Setat explicit → pas fix pentru toți. */
  stepMinutes?: number;
  /** momentul „acum"; sloturile din trecut se elimină. Injectabil pentru teste. */
  now?: Date;
};

export type Slot = {
  /** început, moment absolut */
  startAt: Date;
  /** finalul SERVICIULUI (fără buffer) — ce se arată clientului */
  serviceEndAt: Date;
  /** ora locală 'HH:MM' pentru afișare */
  localTime: string;
  /** cine poate presta slotul (mai mulți, la „oricine disponibil") */
  staffIds: string[];
};

export type DayAvailability = {
  date: string;
  slots: Slot[];
};

/* ------------------------------------------------------------------ */
/* Ferestre de program                                                 */
/* ------------------------------------------------------------------ */

type LocalWindow = { start: string; end: string }; // 'HH:MM'

/**
 * Ferestrele de lucru ale unui prestator într-o zi, după aplicarea excepțiilor.
 *
 * Prioritate: excepție de tenant > excepție de staff > program recurent.
 */
export function windowsForDay(
  staff: StaffInput,
  date: string,
  exceptions: ExceptionInput[],
): LocalWindow[] {
  const tenantEx = exceptions.find(
    (e) => e.staffId === null && e.date === date,
  );
  if (tenantEx?.isClosed) return [];

  const staffEx = exceptions.find(
    (e) => e.staffId === staff.id && e.date === date,
  );
  if (staffEx) {
    if (staffEx.isClosed) return [];
    if (staffEx.startTime && staffEx.endTime) {
      return [
        {
          start: staffEx.startTime.slice(0, 5),
          end: staffEx.endTime.slice(0, 5),
        },
      ];
    }
  }

  // excepție de tenant cu program special: restrânge programul normal
  const weekday = weekdayOf(date);
  let windows = staff.workingHours
    .filter((w) => w.weekday === weekday)
    .map((w) => ({
      start: w.startTime.slice(0, 5),
      end: w.endTime.slice(0, 5),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (
    tenantEx &&
    !tenantEx.isClosed &&
    tenantEx.startTime &&
    tenantEx.endTime
  ) {
    const lo = tenantEx.startTime.slice(0, 5);
    const hi = tenantEx.endTime.slice(0, 5);
    windows = windows
      .map((w) => ({
        start: w.start > lo ? w.start : lo,
        end: w.end < hi ? w.end : hi,
      }))
      .filter((w) => w.start < w.end);
  }

  return windows;
}

/* ------------------------------------------------------------------ */
/* Calculul propriu-zis                                                */
/* ------------------------------------------------------------------ */

/** true dacă [aStart, aEnd) se suprapune cu [bStart, bEnd) */
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;

/** Sloturile candidate ale unui prestator într-o zi, deja filtrate de rezervări. */
function slotsForStaffDay(
  staff: StaffInput,
  date: string,
  input: AvailabilityInput,
): { startAt: Date; serviceEndAt: Date }[] {
  const { timezone, exceptions, bookings, stepMinutes } = input;
  const now = input.now ?? new Date();

  const step = stepMinutes ?? staff.durationMinutes + staff.bufferMinutes;
  if (step <= 0) return [];

  const busy = bookings.filter((b) => b.staffId === staff.id);
  const out: { startAt: Date; serviceEndAt: Date }[] = [];

  for (const win of windowsForDay(staff, date, exceptions)) {
    const winStart = zonedToUtc(date, win.start, timezone);
    const winEnd = zonedToUtc(date, win.end, timezone);

    for (
      let cursor = winStart;
      cursor < winEnd;
      cursor = addMin(cursor, step)
    ) {
      const serviceEndAt = addMin(cursor, staff.durationMinutes);
      // serviciul trebuie să se încheie în program; bufferul are voie să depășească
      if (serviceEndAt > winEnd) break;
      // trecutul nu se oferă
      if (cursor < now) continue;

      const blockEnd = addMin(serviceEndAt, staff.bufferMinutes);
      const taken = busy.some((b) =>
        overlaps(cursor, blockEnd, b.startAt, b.endAt),
      );
      if (!taken) out.push({ startAt: cursor, serviceEndAt });
    }
  }

  return out;
}

/**
 * Disponibilitatea pe zilele cerute, cu sloturile unificate între prestatori.
 *
 * Două sloturi cu același moment de start se contopesc într-unul singur, care
 * poartă lista prestatorilor eligibili → asta e „oricine disponibil".
 */
export function computeAvailability(
  input: AvailabilityInput,
): DayAvailability[] {
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  return input.dates.map((date) => {
    const merged = new Map<number, Slot>();

    for (const staff of input.staff) {
      for (const s of slotsForStaffDay(staff, date, input)) {
        const key = s.startAt.getTime();
        const existing = merged.get(key);
        if (existing) {
          existing.staffIds.push(staff.id);
          // păstrăm cel mai devreme final de serviciu (prestatorul mai rapid)
          if (s.serviceEndAt < existing.serviceEndAt)
            existing.serviceEndAt = s.serviceEndAt;
        } else {
          merged.set(key, {
            startAt: s.startAt,
            serviceEndAt: s.serviceEndAt,
            localTime: timeFmt.format(s.startAt),
            staffIds: [staff.id],
          });
        }
      }
    }

    return {
      date,
      slots: [...merged.values()].sort(
        (a, b) => a.startAt.getTime() - b.startAt.getTime(),
      ),
    };
  });
}

import "dotenv/config";
import { db } from "./index";
import {
  tenants,
  users,
  staff,
  customers,
  services,
  staffServices,
  workingHours,
  scheduleExceptions,
  bookings,
} from "./schema";

/* ------------------------------------------------------------------ */
/* Helper de fus orar                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convertește o oră LOCALĂ dintr-un fus orar în Date (UTC).
 * Trucul cu Intl: formatezi timestamp-ul naiv în fusul țintă, recompui,
 * diferența e offset-ul real pentru acea dată (deci ora de vară e corectă).
 *
 * Provizoriu pentru seed. În lib/availability.ts folosește o bibliotecă
 * (date-fns-tz sau @date-fns/tz) — aici e prea multă aritmetică de făcut manual.
 */
function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
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

const TZ = "Europe/Bucharest";

/** 'YYYY-MM-DD' pentru azi + n zile */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log("🧹 Golesc tabelele...");
  // ordinea contează: copiii înaintea părinților
  await db.delete(bookings);
  await db.delete(scheduleExceptions);
  await db.delete(workingHours);
  await db.delete(staffServices);
  await db.delete(customers);
  await db.delete(staff);
  await db.delete(users);
  await db.delete(services);
  await db.delete(tenants);

  /* --- Tenant --- */
  console.log("🏢 Tenant...");
  const [salon] = await db
    .insert(tenants)
    .values({
      name: "Salon Ana",
      slug: "salon-ana",
      timezone: TZ,
      brandColor: "#C2410C",
      phone: "+40721000000",
      address: "Str. Lipscani 12, București",
    })
    .returning();

  /* --- User owner --- */
  console.log("👤 User...");

  const [owner] = await db
    .insert(users)
    .values({
      tenantId: salon.id,
      email: "ana@salon-ana.ro",
      // placeholder — se înlocuiește când adaugi auth (bcrypt/argon2)
      passwordHash: process.env.ADMIN_HASH_PASSWORD as string,
      name: "Ana Popescu",
      role: "owner",
    })
    .returning();

  /* --- Servicii --- */
  console.log("✂️  Servicii...");
  const [tuns, vopsit, coafat] = await db
    .insert(services)
    .values([
      {
        tenantId: salon.id,
        name: "Tuns",
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 6000,
        color: "#0EA5E9",
        sortOrder: 1,
      },
      {
        tenantId: salon.id,
        name: "Vopsit",
        durationMinutes: 90,
        bufferMinutes: 15,
        priceCents: 22000,
        color: "#A855F7",
        sortOrder: 2,
      },
      {
        tenantId: salon.id,
        name: "Coafat",
        durationMinutes: 45,
        bufferMinutes: 10,
        priceCents: 9000,
        color: "#F59E0B",
        sortOrder: 3,
      },
    ])
    .returning();

  /* --- Staff --- */
  console.log("💇 Staff...");
  const [ana, bogdan] = await db
    .insert(staff)
    .values([
      {
        tenantId: salon.id,
        userId: owner.id,
        name: "Ana",
        bio: "Stilist senior, 12 ani experiență",
        color: "#C2410C",
      },
      {
        tenantId: salon.id,
        name: "Bogdan",
        bio: "Stilist",
        color: "#0F766E",
      },
    ])
    .returning();

  /* --- Staff × servicii --- */
  console.log("🔗 staff_services...");
  await db.insert(staffServices).values([
    // Ana e mai rapidă la tuns și ia mai mult pe vopsit
    {
      staffId: ana.id,
      serviceId: tuns.id,
      durationOverride: 25,
      priceOverrideCents: 8000,
    },
    { staffId: ana.id, serviceId: vopsit.id, priceOverrideCents: 26000 },
    { staffId: ana.id, serviceId: coafat.id },
    // Bogdan nu face vopsit
    { staffId: bogdan.id, serviceId: tuns.id },
    { staffId: bogdan.id, serviceId: coafat.id },
  ]);

  /* --- Program de lucru --- */
  console.log("🕘 working_hours...");
  const anaHours = [1, 2, 3, 4, 5].flatMap((weekday) => [
    // pauză de prânz = două intervale, nu un interval cu gaură
    { staffId: ana.id, weekday, startTime: "09:00", endTime: "13:00" },
    { staffId: ana.id, weekday, startTime: "14:00", endTime: "18:00" },
  ]);
  const bogdanHours = [
    ...[2, 3, 4, 5].map((weekday) => ({
      staffId: bogdan.id,
      weekday,
      startTime: "11:00",
      endTime: "19:00",
    })),
    // sâmbătă, program scurt
    { staffId: bogdan.id, weekday: 6, startTime: "10:00", endTime: "14:00" },
  ];
  await db.insert(workingHours).values([...anaHours, ...bogdanHours]);

  /* --- Excepții --- */
  console.log("🏖️  schedule_exceptions...");
  await db.insert(scheduleExceptions).values([
    // sărbătoare: tot salonul închis (staffId null)
    {
      tenantId: salon.id,
      staffId: null,
      date: day(9),
      isClosed: true,
      reason: "Sărbătoare legală",
    },
    // Ana în concediu 2 zile
    {
      tenantId: salon.id,
      staffId: ana.id,
      date: day(3),
      isClosed: true,
      reason: "Concediu",
    },
    {
      tenantId: salon.id,
      staffId: ana.id,
      date: day(4),
      isClosed: true,
      reason: "Concediu",
    },
    // program special: Bogdan pleacă mai devreme
    {
      tenantId: salon.id,
      staffId: bogdan.id,
      date: day(2),
      isClosed: false,
      startTime: "11:00",
      endTime: "15:00",
      reason: "Programare medicală",
    },
  ]);

  /* --- Clienți --- */
  console.log("🧑 Clienți...");
  const [maria, ion] = await db
    .insert(customers)
    .values([
      {
        tenantId: salon.id,
        passwordHash:
          "$2b$10$7Ji5t53k/fsUGR2GHUEQFuuzm0w3z8UXVz1ltI.ORUiuHwl1kbSLq",
        phone: "+40722111222",
        name: "Maria Ionescu",
        email: "maria@example.com",
      },
      { tenantId: salon.id, phone: "+40733444555", name: "Ion Georgescu" },
    ])
    .returning();

  /* --- Rezervări --- */
  console.log("📅 Rezervări...");
  const mk = (
    dateStr: string,
    timeStr: string,
    staffId: string,
    customerId: string,
    svc: typeof tuns,
    duration: number,
    price: number,
    status: "confirmed" | "cancelled" | "completed" = "confirmed",
  ) => {
    const startAt = zonedToUtc(dateStr, timeStr, TZ);
    const serviceEndAt = addMinutes(startAt, duration);
    const endAt = addMinutes(serviceEndAt, svc.bufferMinutes);
    return {
      tenantId: salon.id,
      customerId,
      staffId,
      serviceId: svc.id,
      startAt,
      serviceEndAt,
      endAt,
      serviceName: svc.name,
      durationMinutes: duration,
      bufferMinutes: svc.bufferMinutes,
      priceCents: price,
      status,
      ...(status === "cancelled"
        ? { cancellationReason: "Anulat de client", cancelledAt: new Date() }
        : {}),
    };
  };

  await db.insert(bookings).values([
    // mâine dimineață, Ana, tuns (25 min override + 10 buffer → blochează 10:00-10:35)
    mk(day(1), "10:00", ana.id, maria.id, tuns, 25, 8000),
    // mâine, Ana, vopsit (90 + 15 → 14:00-15:45)
    mk(day(1), "14:00", ana.id, ion.id, vopsit, 90, 26000),
    // mâine, Bogdan, coafat
    mk(day(1), "12:00", bogdan.id, maria.id, coafat, 45, 9000),
    // ANULATĂ, suprapusă peste prima — dacă EXCLUDE e corect (cu clauza WHERE),
    // inserarea asta trece. Dacă pică, clauza WHERE lipsește din migrare.
    mk(day(1), "10:15", ana.id, ion.id, tuns, 25, 8000, "cancelled"),
    // săptămâna trecută, finalizată (pentru istoric client)
    mk(day(-7), "11:00", ana.id, maria.id, coafat, 45, 9000, "completed"),
  ]);

  console.log("\n✅ Seed complet.");
  console.log(`   tenant: ${salon.slug} → http://localhost:3000/${salon.slug}`);
  console.log(
    `   staff:  Ana (L-V 9-13, 14-18) · Bogdan (Ma-V 11-19, Sâ 10-14)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed eșuat:", err);
  process.exit(1);
});

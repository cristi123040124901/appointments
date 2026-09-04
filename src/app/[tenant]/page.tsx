import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  services,
  staff as staffTable,
  workingHours,
} from "@/db/schema";

const WEEKDAYS = [
  "Duminică",
  "Luni",
  "Marți",
  "Miercuri",
  "Joi",
  "Vineri",
  "Sâmbătă",
];
const lei = (cents: number) => `${(cents / 100).toFixed(0)} lei`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return {
    title: tenant ? `${tenant.name} — programări online` : "Salon",
    description: tenant ? `Rezervă online la ${tenant.name}.` : undefined,
  };
}

export default async function TenantPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) notFound();

  const serviceList = await db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenant.id), eq(services.isActive, true)))
    .orderBy(services.sortOrder);

  const team = await db
    .select()
    .from(staffTable)
    .where(
      and(eq(staffTable.tenantId, tenant.id), eq(staffTable.isActive, true)),
    );

  /* Programul salonului = reuniunea programelor individuale.
     Nu e riguros (dacă unul lucrează 9-13 și altul 14-18, salonul apare 9-18
     deși la 13:30 nu e nimeni), dar e ce vrea să știe clientul: când are rost
     să caute o oră. Disponibilitatea reală o dă oricum grila din /book. */
  const hours = team.length
    ? await db
        .select()
        .from(workingHours)
        .where(
          inArray(
            workingHours.staffId,
            team.map((s) => s.id),
          ),
        )
    : [];

  const byDay = new Map<number, { start: string; end: string }>();
  for (const h of hours) {
    const cur = byDay.get(h.weekday);
    const start = h.startTime.slice(0, 5);
    const end = h.endTime.slice(0, 5);
    byDay.set(h.weekday, {
      start: cur && cur.start < start ? cur.start : start,
      end: cur && cur.end > end ? cur.end : end,
    });
  }
  const todayWeekday = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(
      new Date(),
    ) + "T12:00:00Z",
  ).getUTCDay();

  const cheapest = serviceList.length
    ? Math.min(...serviceList.map((s) => s.priceCents))
    : 0;

  return (
    <main
      className="min-h-dvh bg-neutral-50"
      style={{ "--brand": tenant.brandColor } as React.CSSProperties}
    >
      {/* Antet */}
      <header className="bg-white px-5 pb-8 pt-12">
        <div className="mx-auto max-w-lg">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            {tenant.name}
          </h1>
          {tenant.address && (
            <p className="mt-2 text-neutral-500">{tenant.address}</p>
          )}
          {tenant.phone && (
            <a
              href={`tel:${tenant.phone}`}
              className="mt-1 inline-block text-neutral-500 underline underline-offset-4"
            >
              {tenant.phone}
            </a>
          )}

          <Link
            href={`/${tenant.slug}/book`}
            className="mt-6 block rounded-xl bg-[var(--brand)] px-6 py-4 text-center text-base font-medium text-white"
          >
            Rezervă o oră
          </Link>
          {cheapest > 0 && (
            <p className="mt-2 text-center text-sm text-neutral-400">
              De la {lei(cheapest)} · fără telefon, fără cont
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-lg space-y-10 px-5 py-10">
        {/* Servicii */}
        <section>
          <h2 className="mb-4 text-lg font-medium text-neutral-900">
            Servicii
          </h2>
          {serviceList.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
              Serviciile nu sunt încă publicate.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {serviceList.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/${tenant.slug}/book?service=${s.id}`}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-900">
                        {s.name}
                      </span>
                      {s.description && (
                        <span className="mt-0.5 block text-sm text-neutral-500">
                          {s.description}
                        </span>
                      )}
                      <span className="mt-0.5 block text-sm text-neutral-400">
                        {s.durationMinutes} min
                      </span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-neutral-900">
                      {lei(s.priceCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Echipa */}
        {team.length > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-medium text-neutral-900">
              Echipa
            </h2>
            <ul className="space-y-3">
              {team.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-900">
                      {s.name}
                    </span>
                    {s.bio && (
                      <span className="block truncate text-sm text-neutral-500">
                        {s.bio}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Program */}
        {byDay.size > 0 && (
          <section>
            <h2 className="mb-4 text-lg font-medium text-neutral-900">
              Program
            </h2>
            <dl className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                const h = byDay.get(wd);
                const isToday = wd === todayWeekday;
                return (
                  <div
                    key={wd}
                    className={`flex justify-between border-b border-neutral-100 px-4 py-3 text-sm last:border-0 ${
                      isToday ? "bg-neutral-50" : ""
                    }`}
                  >
                    <dt
                      className={
                        isToday
                          ? "font-medium text-neutral-900"
                          : "text-neutral-600"
                      }
                    >
                      {WEEKDAYS[wd]}
                    </dt>
                    <dd
                      className={`tabular-nums ${h ? "text-neutral-900" : "text-neutral-400"}`}
                    >
                      {h ? `${h.start} – ${h.end}` : "Închis"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        )}
      </div>

      {/* Bara fixă, ca butonul să fie mereu la îndemână pe telefon */}
      <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur">
        <Link
          href={`/${tenant.slug}/book`}
          className="mx-auto block max-w-lg rounded-xl bg-[var(--brand)] px-6 py-3.5 text-center font-medium text-white"
        >
          Rezervă o oră
        </Link>
      </div>
    </main>
  );
}

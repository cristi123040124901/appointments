import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, bookings, staff as staffTable, customers } from "@/db/schema";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ tenant: string; bookingId: string }>;
}) {
  const { tenant: slug, bookingId } = await params;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) notFound();

  // tenantId în WHERE, nu doar bookingId: altfel un id ghicit dintr-un alt
  // salon s-ar afișa aici. Fiind uuid nu e ghicibil, dar verificarea e gratis.
  const [row] = await db
    .select({
      startAt: bookings.startAt,
      serviceEndAt: bookings.serviceEndAt,
      serviceName: bookings.serviceName,
      priceCents: bookings.priceCents,
      status: bookings.status,
      staffName: staffTable.name,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(staffTable, eq(staffTable.id, bookings.staffId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenant.id)))
    .limit(1);

  if (!row) notFound();

  const fmtDate = new Intl.DateTimeFormat("ro-RO", {
    timeZone: tenant.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const fmtTime = new Intl.DateTimeFormat("ro-RO", {
    timeZone: tenant.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <main
      className="min-h-dvh bg-neutral-50 px-5 py-12"
      style={{ "--brand": tenant.brandColor } as React.CSSProperties}
    >
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-[var(--brand)]">
            Rezervare confirmată
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
            {fmtDate.format(row.startAt)}
          </h1>
          <p className="mt-1 text-lg tabular-nums text-neutral-700">
            {fmtTime.format(row.startAt)} – {fmtTime.format(row.serviceEndAt)}
          </p>

          <dl className="mt-6 space-y-3 border-t border-neutral-100 pt-6 text-sm">
            <Row label="Serviciu" value={row.serviceName} />
            <Row label="Cu" value={row.staffName} />
            <Row
              label="Preț"
              value={`${(row.priceCents / 100).toFixed(0)} lei`}
            />
            <Row label="Pe numele" value={row.customerName} />
            <Row label="Telefon" value={row.customerPhone} />
          </dl>

          <p className="mt-6 text-sm text-neutral-500">
            {tenant.phone
              ? `Dacă vrei să schimbi ceva, sună la ${tenant.phone}.`
              : "Dacă vrei să schimbi ceva, contactează salonul."}
          </p>
        </div>

        <Link
          href={`/${tenant.slug}`}
          className="mt-4 block text-center text-sm text-neutral-500 underline underline-offset-4"
        >
          Înapoi la {tenant.name}
        </Link>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

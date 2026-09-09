import { notFound } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  services,
  staff as staffTable,
  staffServices,
  customers,
} from "@/db/schema";
import { auth } from "@/auth";
import { BookingFlow } from "@/components/booking-flow";

// disponibilitatea depinde de „acum", deci nu se cache-uiește
export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  // în Next 15+ ambele sunt Promise
  const { tenant: slug } = await params;
  const { service: preselected } = await searchParams;

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

  // prestatorii activi + serviciile pe care le fac, într-un singur query
  const staffRows = await db
    .select({
      id: staffTable.id,
      name: staffTable.name,
      bio: staffTable.bio,
      serviceId: staffServices.serviceId,
    })
    .from(staffTable)
    .innerJoin(staffServices, eq(staffServices.staffId, staffTable.id))
    .where(
      and(eq(staffTable.tenantId, tenant.id), eq(staffTable.isActive, true)),
    );

  const staffMap = new Map<
    string,
    { id: string; name: string; bio: string | null; serviceIds: string[] }
  >();
  for (const r of staffRows) {
    const existing = staffMap.get(r.id);
    if (existing) existing.serviceIds.push(r.serviceId);
    else
      staffMap.set(r.id, {
        id: r.id,
        name: r.name,
        bio: r.bio,
        serviceIds: [r.serviceId],
      });
  }

  const staff = [...staffMap.values()];

  // preselecția din ?service= — validată, ca un id inventat să nu strice pagina
  const initialServiceId = serviceList.some((s) => s.id === preselected)
    ? preselected!
    : null;

  // login e OPȚIONAL aici — dacă e cont pe tenantul ăsta, sărim peste
  // formularul de nume+telefon; dacă nu, fluxul de guest rămâne identic
  const session = await auth();
  const su = session?.user as
    | { kind?: string; tenantId?: string; id?: string }
    | undefined;

  let loggedInCustomer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null = null;

  if (su?.kind === "customer" && su.tenantId === tenant.id) {
    const [cust] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, su.id!), eq(customers.tenantId, tenant.id)))
      .limit(1);
    if (cust) {
      loggedInCustomer = {
        id: cust.id,
        name: cust.name,
        email: cust.email ?? "",
        phone: cust.phone,
      };
    }
  }

  return (
    <main
      className="min-h-dvh bg-neutral-50"
      style={{ "--brand": tenant.brandColor } as React.CSSProperties}
    >
      <header className="border-b border-neutral-200 bg-white px-5 py-5">
        <div className="mx-auto max-w-lg">
          <Link
            href={`/${tenant.slug}`}
            className="text-sm text-neutral-500 underline underline-offset-4"
          >
            {tenant.name}
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            Rezervă o oră
          </h1>
        </div>
      </header>

      {serviceList.length === 0 || staff.length === 0 ? (
        <div className="mx-auto max-w-lg px-5 py-16 text-center">
          <p className="text-neutral-700">
            Rezervările online nu sunt încă active aici.
          </p>
          {tenant.phone && (
            <a
              href={`tel:${tenant.phone}`}
              className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-6 py-3 font-medium text-white"
            >
              Sună la {tenant.phone}
            </a>
          )}
        </div>
      ) : (
        <BookingFlow
          tenantSlug={tenant.slug}
          timezone={tenant.timezone}
          initialServiceId={initialServiceId}
          services={serviceList.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            durationMinutes: s.durationMinutes,
            priceCents: s.priceCents,
          }))}
          staff={staff}
          loggedInCustomer={loggedInCustomer}
        />
      )}
    </main>
  );
}

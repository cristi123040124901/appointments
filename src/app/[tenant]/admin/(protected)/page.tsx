// src/app/[tenant]/admin/(protected)/page.tsx
//
// Dashboard-ul admin. Auth + verificarea tenant-ului se fac deja în
// layout.tsx (părintele acestei pagini) — aici presupunem sesiunea validă.
import { and, asc, eq, gte, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { bookings, services, staff as staffTable, tenants } from "@/db/schema";

const lei = (cents: number) => `${(cents / 100).toFixed(0)} lei`;

export default async function AdminDashboardPage({
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
  if (!tenant) return null;

  const [serviceList, team, upcoming] = await Promise.all([
    db.select().from(services).where(eq(services.tenantId, tenant.id)),
    db.select().from(staffTable).where(eq(staffTable.tenantId, tenant.id)),
    db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenant.id),
          gte(bookings.startAt, new Date()),
          notInArray(bookings.status, ["cancelled", "no_show"]),
        ),
      )
      .orderBy(asc(bookings.startAt))
      .limit(10),
  ]);

  const fmt = new Intl.DateTimeFormat("ro-RO", {
    timeZone: tenant.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <section style={{ display: "flex", gap: 16, marginBottom: 32 }}>
        <Stat label="Servicii" value={serviceList.length} />
        <Stat label="Echipă" value={team.length} />
        <Stat label="Rezervări viitoare" value={upcoming.length} />
      </section>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        Următoarele rezervări
      </h2>
      {upcoming.length === 0 ? (
        <p style={{ color: "#64748b" }}>Nu sunt rezervări viitoare.</p>
      ) : (
        <ul
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            overflow: "hidden",
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {upcoming.map((b, i) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom:
                  i < upcoming.length - 1 ? "1px solid #e2e8f0" : "none",
              }}
            >
              <span>
                {fmt.format(b.startAt)} — {b.serviceName}
              </span>
              <span style={{ color: "#64748b" }}>{lei(b.priceCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "12px 16px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#64748b" }}>{label}</div>
    </div>
  );
}

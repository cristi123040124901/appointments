// src/app/[tenant]/account/(protected)/page.tsx
import { and, eq, gte } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { bookings, staff } from "@/db/schema";
import { CancelOwnBookingButton } from "@/components/cancel-own-booking-button";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const session = await auth();
  const su = session!.user as { id: string; tenantId: string };

  const rows = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      serviceName: bookings.serviceName,
      status: bookings.status,
      staffName: staff.name,
    })
    .from(bookings)
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .where(
      and(eq(bookings.customerId, su.id), gte(bookings.startAt, new Date())),
    )
    .orderBy(bookings.startAt);

  return (
    <div>
      <h1 style={{ fontSize: 20 }}>Rezervările mele</h1>
      {rows.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>Nu ai nicio rezervare viitoare.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {rows.map((r) => (
            <li
              key={r.id}
              style={{
                borderBottom: "1px solid #f1f5f9",
                padding: "12px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.serviceName}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {new Intl.DateTimeFormat("ro-RO", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(r.startAt)}
                  {" · "}cu {r.staffName} · {r.status}
                </div>
              </div>
              {r.status !== "cancelled" && (
                <CancelOwnBookingButton
                  tenantSlug={tenantSlug}
                  bookingId={r.id}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

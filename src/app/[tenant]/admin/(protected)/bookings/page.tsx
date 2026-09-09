import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, customers, staff, tenants } from "@/db/schema";
import { CancelBookingButton } from "@/components/admin/cancel-booking-button";
import { ResendConfirmationButton } from "@/components/admin/resend-confirmation-button";

const lei = (cents: number) => `${(cents / 100).toFixed(0)} lei`;

const STATUS_LABELS: Record<string, string> = {
  pending: "În așteptare",
  confirmed: "Confirmată",
  completed: "Finalizată",
  cancelled: "Anulată",
  no_show: "Neprezentare",
};

export default async function AdminBookingsPage({
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

  const rows = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      serviceName: bookings.serviceName,
      priceCents: bookings.priceCents,
      status: bookings.status,
      staffName: staff.name,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(bookings)
    .innerJoin(staff, eq(staff.id, bookings.staffId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.tenantId, tenant.id))
    .orderBy(desc(bookings.startAt))
    .limit(100);

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("ro-RO", {
    timeZone: tenant.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
        Rezervări
      </h1>
      {rows.length === 0 ? (
        <p style={{ color: "#64748b" }}>Nicio rezervare încă.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={th}>Data</th>
                <th style={th}>Client</th>
                <th style={th}>Serviciu</th>
                <th style={th}>Prestator</th>
                <th style={th}>Preț</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cancellable =
                  r.startAt > now &&
                  (r.status === "confirmed" || r.status === "pending");
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={td}>{fmt.format(r.startAt)}</td>
                    <td style={td}>
                      {r.customerName}
                      {r.customerPhone && (
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>
                          {r.customerPhone}
                        </div>
                      )}
                    </td>
                    <td style={td}>{r.serviceName}</td>
                    <td style={td}>{r.staffName}</td>
                    <td style={td}>{lei(r.priceCents)}</td>
                    <td style={td}>{STATUS_LABELS[r.status] ?? r.status}</td>
                    <td style={td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {cancellable && (
                          <CancelBookingButton
                            tenantSlug={tenant.slug}
                            bookingId={r.id}
                          />
                        )}
                        {r.customerEmail && (
                          <ResendConfirmationButton
                            tenantSlug={tenant.slug}
                            bookingId={r.id}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: "8px 12px", fontWeight: 600, color: "#334155" };
const td: React.CSSProperties = { padding: "8px 12px", verticalAlign: "top" };

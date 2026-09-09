import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { staff as staffTable, services, staffServices, tenants } from "@/db/schema";
import { StaffManager } from "@/components/admin/staff-manager";

export default async function AdminStaffPage({
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

  const [staffList, serviceList] = await Promise.all([
    db
      .select()
      .from(staffTable)
      .where(eq(staffTable.tenantId, tenant.id))
      .orderBy(staffTable.name),
    db
      .select()
      .from(services)
      .where(eq(services.tenantId, tenant.id))
      .orderBy(services.sortOrder, services.name),
  ]);

  const links = staffList.length
    ? await db
        .select()
        .from(staffServices)
        .where(
          inArray(
            staffServices.staffId,
            staffList.map((s) => s.id),
          ),
        )
    : [];

  const assignedByStaff: Record<string, string[]> = {};
  for (const link of links) {
    (assignedByStaff[link.staffId] ??= []).push(link.serviceId);
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
        Echipă
      </h1>
      <StaffManager
        tenantSlug={tenant.slug}
        initialStaff={staffList}
        services={serviceList}
        assignedByStaff={assignedByStaff}
      />
    </div>
  );
}

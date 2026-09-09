import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  staff as staffTable,
  workingHours,
  scheduleExceptions,
  tenants,
} from "@/db/schema";
import { WorkingHoursEditor } from "@/components/admin/working-hours-editor";
import { ExceptionsManager } from "@/components/admin/exceptions-manager";

export default async function AdminSchedulePage({
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

  const staffList = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.tenantId, tenant.id))
    .orderBy(staffTable.name);

  const [hours, exceptions] = await Promise.all([
    staffList.length
      ? db
          .select()
          .from(workingHours)
          .where(
            inArray(
              workingHours.staffId,
              staffList.map((s) => s.id),
            ),
          )
      : Promise.resolve([]),
    db
      .select()
      .from(scheduleExceptions)
      .where(eq(scheduleExceptions.tenantId, tenant.id))
      .orderBy(desc(scheduleExceptions.date)),
  ]);

  const hoursByStaff = new Map<string, typeof hours>();
  for (const h of hours) {
    const list = hoursByStaff.get(h.staffId) ?? [];
    list.push(h);
    hoursByStaff.set(h.staffId, list);
  }

  const staffNameById = new Map(staffList.map((s) => [s.id, s.name]));
  const exceptionsWithNames = exceptions.map((ex) => ({
    ...ex,
    staffName: ex.staffId ? (staffNameById.get(ex.staffId) ?? null) : null,
  }));

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
        Program
      </h1>

      {staffList.length === 0 ? (
        <p style={{ color: "#64748b" }}>
          Adaugă mai întâi membri ai echipei ca să le setezi programul.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 16, marginBottom: 32 }}>
          {staffList.map((s) => (
            <WorkingHoursEditor
              key={s.id}
              tenantSlug={tenant.slug}
              staffId={s.id}
              staffName={s.name}
              initialRanges={(hoursByStaff.get(s.id) ?? []).map((h) => ({
                weekday: h.weekday,
                startTime: h.startTime,
                endTime: h.endTime,
              }))}
            />
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        Excepții (sărbători, concedii, program special)
      </h2>
      <ExceptionsManager
        tenantSlug={tenant.slug}
        staffOptions={staffList.map((s) => ({ id: s.id, name: s.name }))}
        initialExceptions={exceptionsWithNames}
      />
    </div>
  );
}

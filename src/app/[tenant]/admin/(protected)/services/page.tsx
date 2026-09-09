import { eq } from "drizzle-orm";
import { db } from "@/db";
import { services, tenants } from "@/db/schema";
import { ServicesManager } from "@/components/admin/services-manager";

export default async function AdminServicesPage({
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

  const list = await db
    .select()
    .from(services)
    .where(eq(services.tenantId, tenant.id))
    .orderBy(services.sortOrder, services.name);

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
        Servicii
      </h1>
      <ServicesManager tenantSlug={tenant.slug} initialServices={list} />
    </div>
  );
}

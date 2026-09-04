// src/app/[tenant]/admin/login/page.tsx
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage({
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

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>
        Autentificare — {tenant.name}
      </h1>
      <LoginForm tenantSlug={slug} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function AdminForgotPasswordPage({
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
        Resetare parolă — {tenant.name}
      </h1>
      <ForgotPasswordForm kind="admin" tenantSlug={slug} />
    </div>
  );
}

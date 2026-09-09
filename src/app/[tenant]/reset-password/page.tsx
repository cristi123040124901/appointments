import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function CustomerResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { tenant: slug } = await params;
  const { token } = await searchParams;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) notFound();

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>
        Alege o parolă nouă — {tenant.name}
      </h1>
      {token ? (
        <ResetPasswordForm
          kind="customer"
          token={token}
          loginHref={`/${slug}/login`}
        />
      ) : (
        <p style={{ color: "#dc2626", fontSize: 14 }}>Link invalid.</p>
      )}
    </div>
  );
}

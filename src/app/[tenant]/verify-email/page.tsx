import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { verifyEmailAction } from "@/lib/actions/email-verification";

export default async function VerifyEmailPage({
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

  const result = token
    ? await verifyEmailAction({ token })
    : { ok: false as const, error: "Link invalid." };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>
        Confirmare email — {tenant.name}
      </h1>
      {result.ok ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ fontSize: 14, color: "#334155" }}>
            Emailul a fost confirmat. Te poți autentifica acum.
          </p>
          <Link href={`/${slug}/login`} style={{ color: "#0f172a", fontWeight: 600 }}>
            Intră în cont
          </Link>
        </div>
      ) : (
        <p style={{ color: "#dc2626", fontSize: 14 }}>{result.error}</p>
      )}
    </div>
  );
}

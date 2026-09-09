// src/app/[tenant]/account/(protected)/layout.tsx
//
// Aceeași structură ca la admin: paranteza (protected) NU intră în URL.
// /[tenant]/login rămâne AFARĂ din acest grup, deci nu trece prin
// verificarea de mai jos — altfel ai buclă de redirect.
//
// Structura pe disc:
//   [tenant]/
//     login/page.tsx              <- neprotejat
//     account/
//       (protected)/
//         layout.tsx                <- fișierul ăsta
//         page.tsx                   <- rezervările clientului
//
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { tenants } from "@/db/schema";

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (!tenant) notFound();

  const session = await auth();
  const su = session?.user as { kind?: string; tenantId?: string } | undefined;

  if (!session?.user || su?.kind !== "customer" || su?.tenantId !== tenant.id) {
    redirect(`/${slug}/login`);
  }

  return (
    <div>
      <header
        style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 24px" }}
      >
        <strong>{tenant.name}</strong> — contul meu
      </header>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}

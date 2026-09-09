// src/app/[tenant]/admin/(protected)/layout.tsx
//
// IMPORTANT: fișierul stă sub un route group `(protected)`, NU direct
// sub admin/. Paranteza nu apare în URL, deci /[tenant]/admin/page.tsx
// (dashboard-ul) rămâne la fel de accesibil ca /[tenant]/admin, dar
// /[tenant]/admin/login rămâne AFARĂ din acest grup — deci nu trece
// prin verificarea de mai jos. Altfel: nelogat → redirect la login →
// login-ul e sub același layout protejat → redirect la login → buclă.
//
// Structura pe disc:
//   admin/
//     login/page.tsx          <- neprotejat
//     (protected)/
//       layout.tsx             <- fișierul ăsta
//       page.tsx                <- dashboard-ul (fostul admin/page.tsx)
//
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { tenants } from "@/db/schema";

export default async function AdminLayout({
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

  if (!session?.user) {
    redirect(`/${slug}/admin/login`);
  }

  const userTenantId = (session.user as { tenantId?: string }).tenantId;

  // punctul care contează pentru multi-tenant: user-ul e autentificat,
  // dar poate aparține de alt tenant (ex. a apăsat Google de pe URL-ul
  // greșit). Nu-l lăsăm să vadă datele altcuiva — îl trimitem la al lui.
  if (userTenantId !== tenant.id) {
    redirect(`/${slug}/admin/login?error=wrong_tenant`);
  }

  const navItems = [
    { href: `/${slug}/admin`, label: "Dashboard" },
    { href: `/${slug}/admin/bookings`, label: "Rezervări" },
    { href: `/${slug}/admin/services`, label: "Servicii" },
    { href: `/${slug}/admin/staff`, label: "Echipă" },
    { href: `/${slug}/admin/schedule`, label: "Program" },
  ];

  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid #e2e8f0",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}
      >
        <strong>{tenant.name}</strong> — admin
        <nav style={{ display: "flex", gap: 16 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{ fontSize: 14, color: "#334155" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}

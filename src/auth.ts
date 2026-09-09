import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, customers, tenants } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";

// numele cookie-ului prin care "ducem" tenant-ul peste dus-întors la Google
const CUSTOMER_INTENT_COOKIE = "pending_customer_tenant";

// brute-force pe login: după MAX_FAILED_ATTEMPTS eșecuri consecutive,
// contul se blochează temporar
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),

    // login ADMIN cu email+parolă — neschimbat față de înainte
    Credentials({
      id: "admin-credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Parolă", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [row] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (!row) return null;

        if (row.lockedUntil && row.lockedUntil > new Date()) return null;

        const valid = await verifyPassword(
          password,
          row.passwordHash as string,
        );
        if (!valid) {
          const attempts = row.failedLoginAttempts + 1;
          await db
            .update(users)
            .set({
              failedLoginAttempts: attempts,
              lockedUntil:
                attempts >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + LOCK_DURATION_MS)
                  : null,
            })
            .where(eq(users.id, row.id));
          return null;
        }

        if (row.failedLoginAttempts > 0 || row.lockedUntil) {
          await db
            .update(users)
            .set({ failedLoginAttempts: 0, lockedUntil: null })
            .where(eq(users.id, row.id));
        }

        return {
          id: row.id,
          email: row.email,
          name: row.name,
          tenantId: row.tenantId,
          role: row.role,
          kind: "admin" as const,
        };
      },
    }),

    // login CLIENT cu email+parolă — scopat la un tenant anume
    Credentials({
      id: "customer-credentials",
      credentials: {
        tenantSlug: { label: "Tenant", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Parolă", type: "password" },
      },
      async authorize(credentials) {
        const tenantSlug = credentials?.tenantSlug as string | undefined;
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!tenantSlug || !email || !password) return null;

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.slug, tenantSlug))
          .limit(1);
        if (!tenant) return null;

        const [cust] = await db
          .select()
          .from(customers)
          .where(
            and(eq(customers.tenantId, tenant.id), eq(customers.email, email)),
          )
          .limit(1);
        if (!cust || !cust.passwordHash) return null;

        if (cust.lockedUntil && cust.lockedUntil > new Date()) return null;

        const valid = await verifyPassword(password, cust.passwordHash);
        if (!valid) {
          const attempts = cust.failedLoginAttempts + 1;
          await db
            .update(customers)
            .set({
              failedLoginAttempts: attempts,
              lockedUntil:
                attempts >= MAX_FAILED_ATTEMPTS
                  ? new Date(Date.now() + LOCK_DURATION_MS)
                  : null,
            })
            .where(eq(customers.id, cust.id));
          return null;
        }

        // emailul trebuie confirmat înainte de prima autentificare cu parolă —
        // altfel oricine îți poate "sechestra" contul înregistrându-se cu
        // emailul tău înaintea ta (vezi și reclaim-ul din signIn() pt. Google)
        if (cust.email && !cust.emailVerifiedAt) return null;

        if (cust.failedLoginAttempts > 0 || cust.lockedUntil) {
          await db
            .update(customers)
            .set({ failedLoginAttempts: 0, lockedUntil: null })
            .where(eq(customers.id, cust.id));
        }

        return {
          id: cust.id,
          email: cust.email,
          name: cust.name,
          tenantId: tenant.id,
          kind: "customer" as const,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Credentials (ambele) au verificat deja totul în authorize().
     * Aici tratăm doar Google, care are DOUĂ fluxuri posibile:
     *
     *  - admin: emailul trebuie să existe deja în `users` (invite-only,
     *    ca înainte)
     *  - client: cont NOU se creează automat la primul login — de
     *    asta e nevoie de cookie-ul CUSTOMER_INTENT_COOKIE, ca să
     *    știm cărui tenant îi aparține clientul (Google nu ne mai dă
     *    înapoi URL-ul de unde a pornit).
     */
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      const cookieStore = await cookies();
      const customerTenantSlug = cookieStore.get(CUSTOMER_INTENT_COOKIE)?.value;

      if (customerTenantSlug) {
        cookieStore.delete(CUSTOMER_INTENT_COOKIE);

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.slug, customerTenantSlug))
          .limit(1);
        if (!tenant) return false;

        let [cust] = await db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenant.id),
              eq(customers.email, user.email!),
            ),
          )
          .limit(1);

        if (!cust) {
          [cust] = await db
            .insert(customers)
            .values({
              tenantId: tenant.id,
              email: user.email!,
              name: user.name ?? "Client",
              emailVerifiedAt: new Date(),
              // phone rămâne null — îl cerem separat, o singură dată,
              // pe pagina de cont, dacă lipsește
            })
            .returning();
        } else if (cust.passwordHash && !cust.emailVerifiedAt) {
          // rândul a fost creat prin credentials și n-a fost confirmat
          // niciodată — posibil "sechestrat" de altcineva care s-a
          // înregistrat cu emailul tău înaintea ta. Google e un provider
          // de încredere: dacă TU te loghezi cu Google pe acest email,
          // tu ești adevăratul proprietar — invalidăm parola veche ca
          // să nu mai poată intra cine a creat contul cu parolă.
          [cust] = await db
            .update(customers)
            .set({ passwordHash: null, emailVerifiedAt: new Date() })
            .where(eq(customers.id, cust.id))
            .returning();
        }

        (user as { id?: string; tenantId?: string; kind?: string }).id =
          cust.id;
        (user as { id?: string; tenantId?: string; kind?: string }).tenantId =
          tenant.id;
        (user as { id?: string; tenantId?: string; kind?: string }).kind =
          "customer";
        return true;
      }

      // fără cookie de intenție => presupunem flux admin (invite-only)
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email!))
        .limit(1);
      if (!row) return false;

      (
        user as { id?: string; tenantId?: string; role?: string; kind?: string }
      ).id = row.id;
      (
        user as { id?: string; tenantId?: string; role?: string; kind?: string }
      ).tenantId = row.tenantId;
      (
        user as { id?: string; tenantId?: string; role?: string; kind?: string }
      ).role = row.role;
      (
        user as { id?: string; tenantId?: string; role?: string; kind?: string }
      ).kind = "admin";
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id: string;
          tenantId: string;
          role?: string;
          kind: "admin" | "customer";
        };
        token.userId = u.id;
        token.tenantId = u.tenantId;
        token.role = u.role;
        token.kind = u.kind;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const su = session.user as typeof session.user & {
          id: string;
          tenantId: string;
          role?: string;
          kind: "admin" | "customer";
        };
        su.id = token.userId as string;
        su.tenantId = token.tenantId as string;
        su.role = token.role as string | undefined;
        su.kind = token.kind as "admin" | "customer";
      }
      return session;
    },
  },
});

export { CUSTOMER_INTENT_COOKIE };

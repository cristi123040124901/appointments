import "dotenv/config";
import { describe, it, expect, vi, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";

// registerTenantAction fires a verification email in the background, which
// needs next/headers' headers() — only available inside a real Next.js
// request. Mocked so the fire-and-forget call resolves instead of
// rejecting noisily in this plain vitest run.
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "localhost:3000"]]),
}));

const { checkSlugAvailableAction, registerTenantAction } = await import(
  "./tenant-signup"
);

const createdSlugs: string[] = [];
afterAll(async () => {
  for (const slug of createdSlugs) {
    await db.delete(tenants).where(eq(tenants.slug, slug));
  }
});

function uniqueSlug(prefix: string) {
  const slug = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  createdSlugs.push(slug);
  return slug;
}

describe("checkSlugAvailableAction", () => {
  it("rejects a reserved slug", async () => {
    const res = await checkSlugAvailableAction({ slug: "admin" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.available).toBe(false);
  });

  it("rejects an invalid format (too short / bad chars)", async () => {
    const res = await checkSlugAvailableAction({ slug: "a!" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.available).toBe(false);
  });

  it("accepts a fresh, valid, unreserved slug", async () => {
    const slug = `available-${Date.now()}`;
    const res = await checkSlugAvailableAction({ slug });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.available).toBe(true);
  });

  it("rejects a slug already taken by an existing tenant", async () => {
    const slug = uniqueSlug("taken");
    await db.insert(tenants).values({ name: "Taken Co", slug });

    const res = await checkSlugAvailableAction({ slug });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.available).toBe(false);
  });
});

describe("registerTenantAction", () => {
  it("creates a tenant and an owner user, and rejects a duplicate signup with the same slug", async () => {
    const slug = uniqueSlug("newbiz");
    const email = `owner-${Date.now()}@test.local`;

    const res = await registerTenantAction({
      businessName: "New Biz",
      ownerName: "Owner Name",
      slug,
      email,
      password: "password1234",
      timezone: "Europe/Bucharest",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.slug).toBe(slug);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    expect(tenant).toBeTruthy();
    expect(tenant.name).toBe("New Biz");

    const [owner] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    expect(owner).toBeTruthy();
    expect(owner.role).toBe("owner");
    expect(owner.tenantId).toBe(tenant.id);
    // owner-ul creat prin formular cu parolă NU e verificat automat —
    // trebuie să confirme emailul, la fel ca la signup-ul de client
    expect(owner.emailVerifiedAt).toBeNull();

    // a doua încercare cu ACELAȘI slug trebuie respinsă (nu o eroare 500)
    const dup = await registerTenantAction({
      businessName: "Another Biz",
      ownerName: "Someone Else",
      slug,
      email: `other-${Date.now()}@test.local`,
      password: "password1234",
      timezone: "Europe/Bucharest",
    });
    expect(dup.ok).toBe(false);
  });

  it("rejects a reserved or malformed slug outright", async () => {
    const res = await registerTenantAction({
      businessName: "Bad Slug Co",
      ownerName: "Owner",
      slug: "api",
      email: `bad-${Date.now()}@test.local`,
      password: "password1234",
      timezone: "Europe/Bucharest",
    });
    expect(res.ok).toBe(false);
  });
});

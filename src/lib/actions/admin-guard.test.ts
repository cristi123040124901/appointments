import "dotenv/config";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, users } from "@/db/schema";

// requireAdmin() calls auth() from next-auth, which needs a real Next.js
// request scope (cookies) we don't have in a plain vitest run — mocked so
// we can drive the session it sees per test case.
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

const { requireAdmin } = await import("./admin-guard");

// fixture: two separate tenants, each with their own admin user — the
// invariant under test is that an admin of tenant A must never pass the
// guard for tenant B (see CLAUDE.md's multi-tenant invariants)
const slugA = `test-guard-a-${Date.now()}`;
const slugB = `test-guard-b-${Date.now()}`;
let tenantAId: string;
let tenantBId: string;
let adminAId: string;

beforeAll(async () => {
  const [tenantA] = await db
    .insert(tenants)
    .values({ name: "Test Tenant A", slug: slugA })
    .returning();
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: "Test Tenant B", slug: slugB })
    .returning();
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const [adminA] = await db
    .insert(users)
    .values({
      tenantId: tenantAId,
      email: `admin-a-${Date.now()}@test.local`,
      name: "Admin A",
      role: "owner",
    })
    .returning();
  adminAId = adminA.id;
});

afterAll(async () => {
  // cascade: users -> tenants
  await db.delete(tenants).where(eq(tenants.id, tenantAId));
  await db.delete(tenants).where(eq(tenants.id, tenantBId));
});

describe("requireAdmin", () => {
  it("rejects when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireAdmin(slugA);
    expect(result.ok).toBe(false);
  });

  it("rejects a customer session (wrong kind)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminAId, tenantId: tenantAId, kind: "customer" },
    });
    const result = await requireAdmin(slugA);
    expect(result.ok).toBe(false);
  });

  it("rejects an admin of a different tenant", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminAId, tenantId: tenantAId, kind: "admin" },
    });
    // adminA belongs to tenant A, but requesting tenant B's slug
    const result = await requireAdmin(slugB);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown tenant slug", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminAId, tenantId: tenantAId, kind: "admin" },
    });
    const result = await requireAdmin("no-such-tenant-slug");
    expect(result.ok).toBe(false);
  });

  it("allows an admin of the matching tenant", async () => {
    mockAuth.mockResolvedValue({
      user: { id: adminAId, tenantId: tenantAId, kind: "admin" },
    });
    const result = await requireAdmin(slugA);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenant.id).toBe(tenantAId);
      expect(result.userId).toBe(adminAId);
    }
  });
});

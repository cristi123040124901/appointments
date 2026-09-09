"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Staff, Service } from "@/db/schema";
import {
  setStaffActiveAction,
  deleteStaffAction,
  setStaffServicesAction,
} from "@/lib/actions/admin-staff";
import { StaffForm } from "./staff-form";
import { primaryBtn, secondaryBtn, dangerBtn, card } from "./styles";

export function StaffManager({
  tenantSlug,
  initialStaff,
  services,
  assignedByStaff,
}: {
  tenantSlug: string;
  initialStaff: Staff[];
  services: Service[];
  assignedByStaff: Record<string, string[]>;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  function refresh() {
    setEditingId(null);
    setAdding(false);
    router.refresh();
  }

  function toggleActive(s: Staff) {
    setRowError(null);
    startTransition(async () => {
      const res = await setStaffActiveAction(tenantSlug, s.id, !s.isActive);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  function remove(s: Staff) {
    if (!confirm(`Ștergi „${s.name}"?`)) return;
    setRowError(null);
    startTransition(async () => {
      const res = await deleteStaffAction(tenantSlug, s.id);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rowError && <p style={{ color: "#dc2626", fontSize: 13 }}>{rowError}</p>}

      {initialStaff.length === 0 && !adding && (
        <p style={{ color: "#64748b" }}>Niciun membru încă.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {initialStaff.map((s) => (
          <li key={s.id}>
            {editingId === s.id ? (
              <StaffForm
                tenantSlug={tenantSlug}
                staffMember={s}
                onDone={refresh}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                style={{
                  ...card,
                  opacity: s.isActive ? 1 : 0.5,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: s.color,
                        color: "white",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {s.name.slice(0, 1)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      {s.bio && (
                        <div style={{ fontSize: 13, color: "#64748b" }}>
                          {s.bio}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={secondaryBtn}
                      onClick={() =>
                        setAssigningId(assigningId === s.id ? null : s.id)
                      }
                    >
                      Servicii ({assignedByStaff[s.id]?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      style={secondaryBtn}
                      onClick={() => setEditingId(s.id)}
                    >
                      Editează
                    </button>
                    <button
                      type="button"
                      style={secondaryBtn}
                      disabled={isPending}
                      onClick={() => toggleActive(s)}
                    >
                      {s.isActive ? "Dezactivează" : "Activează"}
                    </button>
                    <button
                      type="button"
                      style={dangerBtn}
                      disabled={isPending}
                      onClick={() => remove(s)}
                    >
                      Șterge
                    </button>
                  </div>
                </div>

                {assigningId === s.id && (
                  <ServiceAssignment
                    tenantSlug={tenantSlug}
                    staffId={s.id}
                    services={services}
                    initialSelected={assignedByStaff[s.id] ?? []}
                    onDone={refresh}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <StaffForm
          tenantSlug={tenantSlug}
          onDone={refresh}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          style={{ ...primaryBtn, alignSelf: "start" }}
          onClick={() => setAdding(true)}
        >
          + Membru nou
        </button>
      )}
    </div>
  );
}

function ServiceAssignment({
  tenantSlug,
  staffId,
  services,
  initialSelected,
  onDone,
}: {
  tenantSlug: string;
  staffId: string;
  services: Service[];
  initialSelected: string[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState(new Set(initialSelected));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setStaffServicesAction(
        tenantSlug,
        staffId,
        Array.from(selected),
      );
      if (!res.ok) setError(res.error);
      else onDone();
    });
  }

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid #e2e8f0",
        display: "grid",
        gap: 6,
      }}
    >
      {services.length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Adaugă mai întâi servicii.
        </p>
      ) : (
        services.map((svc) => (
          <label
            key={svc.id}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}
          >
            <input
              type="checkbox"
              checked={selected.has(svc.id)}
              onChange={() => toggle(svc.id)}
            />
            {svc.name}
          </label>
        ))
      )}
      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
      <button
        type="button"
        style={{ ...primaryBtn, alignSelf: "start", marginTop: 4 }}
        disabled={isPending}
        onClick={save}
      >
        {isPending ? "Se salvează…" : "Salvează serviciile"}
      </button>
    </div>
  );
}

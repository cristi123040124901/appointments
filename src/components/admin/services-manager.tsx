"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Service } from "@/db/schema";
import {
  setServiceActiveAction,
  deleteServiceAction,
} from "@/lib/actions/admin-services";
import { ServiceForm } from "./service-form";
import { primaryBtn, secondaryBtn, dangerBtn, card } from "./styles";

const lei = (cents: number) => `${(cents / 100).toFixed(0)} lei`;

export function ServicesManager({
  tenantSlug,
  initialServices,
}: {
  tenantSlug: string;
  initialServices: Service[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  function refresh() {
    setEditingId(null);
    setAdding(false);
    router.refresh();
  }

  function toggleActive(s: Service) {
    setRowError(null);
    startTransition(async () => {
      const res = await setServiceActiveAction(tenantSlug, s.id, !s.isActive);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  function remove(s: Service) {
    if (!confirm(`Ștergi „${s.name}"?`)) return;
    setRowError(null);
    startTransition(async () => {
      const res = await deleteServiceAction(tenantSlug, s.id);
      if (!res.ok) setRowError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rowError && <p style={{ color: "#dc2626", fontSize: 13 }}>{rowError}</p>}

      {initialServices.length === 0 && !adding && (
        <p style={{ color: "#64748b" }}>Niciun serviciu încă.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {initialServices.map((s) =>
          editingId === s.id ? (
            <li key={s.id}>
              <ServiceForm
                tenantSlug={tenantSlug}
                service={s}
                onDone={refresh}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={s.id}
              style={{
                ...card,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: s.isActive ? 1 : 0.5,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {s.durationMinutes} min
                  {s.bufferMinutes > 0 ? ` + ${s.bufferMinutes} min buffer` : ""}
                  {" · "}
                  {lei(s.priceCents)}
                  {!s.isActive ? " · inactiv" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
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
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <ServiceForm
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
          + Serviciu nou
        </button>
      )}
    </div>
  );
}

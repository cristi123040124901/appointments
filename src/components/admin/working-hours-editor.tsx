"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkingHoursAction } from "@/lib/actions/admin-schedule";
import { primaryBtn, secondaryBtn, card } from "./styles";

const WEEKDAYS = [
  { value: 1, label: "Luni" },
  { value: 2, label: "Marți" },
  { value: 3, label: "Miercuri" },
  { value: 4, label: "Joi" },
  { value: 5, label: "Vineri" },
  { value: 6, label: "Sâmbătă" },
  { value: 0, label: "Duminică" },
];

type Range = { weekday: number; startTime: string; endTime: string };

export function WorkingHoursEditor({
  tenantSlug,
  staffId,
  staffName,
  initialRanges,
}: {
  tenantSlug: string;
  staffId: string;
  staffName: string;
  initialRanges: Range[];
}) {
  const router = useRouter();
  const [ranges, setRanges] = useState<Range[]>(
    initialRanges.map((r) => ({
      ...r,
      startTime: r.startTime.slice(0, 5),
      endTime: r.endTime.slice(0, 5),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addRange(weekday: number) {
    setRanges((prev) => [...prev, { weekday, startTime: "09:00", endTime: "17:00" }]);
  }

  function removeRange(index: number) {
    setRanges((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRange(index: number, field: "startTime" | "endTime", value: string) {
    setRanges((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await setWorkingHoursAction({ tenantSlug, staffId, ranges });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{staffName}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {WEEKDAYS.map((wd) => {
          const dayRanges = ranges
            .map((r, i) => ({ ...r, index: i }))
            .filter((r) => r.weekday === wd.value);
          return (
            <div key={wd.value} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 90, fontSize: 13, color: "#334155", paddingTop: 6 }}>
                {wd.label}
              </div>
              <div style={{ display: "grid", gap: 6, flex: 1 }}>
                {dayRanges.length === 0 && (
                  <div style={{ fontSize: 13, color: "#94a3b8", paddingTop: 6 }}>
                    Închis
                  </div>
                )}
                {dayRanges.map((r) => (
                  <div key={r.index} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="time"
                      value={r.startTime}
                      onChange={(e) => updateRange(r.index, "startTime", e.target.value)}
                      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" }}
                    />
                    <span style={{ color: "#94a3b8" }}>–</span>
                    <input
                      type="time"
                      value={r.endTime}
                      onChange={(e) => updateRange(r.index, "endTime", e.target.value)}
                      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 6px" }}
                    />
                    <button
                      type="button"
                      onClick={() => removeRange(r.index)}
                      style={{ ...secondaryBtn, padding: "4px 8px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addRange(wd.value)}
                  style={{ ...secondaryBtn, padding: "4px 8px", alignSelf: "start", fontSize: 12 }}
                >
                  + interval
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 10 }}>{error}</p>}

      <button
        type="button"
        style={{ ...primaryBtn, marginTop: 14 }}
        disabled={isPending}
        onClick={save}
      >
        {isPending ? "Se salvează…" : "Salvează programul"}
      </button>
    </div>
  );
}

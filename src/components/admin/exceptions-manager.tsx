"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleException } from "@/db/schema";
import {
  createExceptionAction,
  deleteExceptionAction,
} from "@/lib/actions/admin-schedule";
import { label, input, primaryBtn, dangerBtn, card } from "./styles";

type StaffOption = { id: string; name: string };

export function ExceptionsManager({
  tenantSlug,
  staffOptions,
  initialExceptions,
}: {
  tenantSlug: string;
  staffOptions: StaffOption[];
  initialExceptions: (ScheduleException & { staffName: string | null })[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [staffId, setStaffId] = useState<string>("");
  const [isClosed, setIsClosed] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    if (!date) {
      setError("Alege o dată.");
      return;
    }
    startTransition(async () => {
      const res = await createExceptionAction({
        tenantSlug,
        staffId: staffId || null,
        date,
        isClosed,
        startTime: isClosed ? undefined : startTime,
        endTime: isClosed ? undefined : endTime,
        reason,
      });
      if (!res.ok) setError(res.error);
      else {
        setDate("");
        setReason("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Ștergi această excepție?")) return;
    startTransition(async () => {
      const res = await deleteExceptionAction(tenantSlug, id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
        {initialExceptions.length === 0 && (
          <p style={{ color: "#64748b" }}>Nicio excepție programată.</p>
        )}
        {initialExceptions.map((ex) => (
          <li
            key={ex.id}
            style={{
              ...card,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 16px",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>
                {ex.date} · {ex.staffName ?? "Tot programul"}
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                {ex.isClosed
                  ? "Închis"
                  : `${ex.startTime?.slice(0, 5)} – ${ex.endTime?.slice(0, 5)}`}
                {ex.reason ? ` · ${ex.reason}` : ""}
              </div>
            </div>
            <button type="button" style={dangerBtn} onClick={() => remove(ex.id)}>
              Șterge
            </button>
          </li>
        ))}
      </ul>

      <div style={{ ...card, display: "grid", gap: 10, maxWidth: 420 }}>
        <div style={{ fontWeight: 600 }}>Excepție nouă</div>
        <label style={label}>
          Dată
          <input
            style={input}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label style={label}>
          Se aplică lui
          <select
            style={input}
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">Tot programul (sărbătoare)</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={isClosed}
            onChange={(e) => setIsClosed(e.target.checked)}
          />
          Zi liberă (altfel program special)
        </label>
        {!isClosed && (
          <div style={{ display: "flex", gap: 10 }}>
            <label style={{ ...label, flex: 1 }}>
              Start
              <input
                style={input}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label style={{ ...label, flex: 1 }}>
              Sfârșit
              <input
                style={input}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
        )}
        <label style={label}>
          Motiv (opțional)
          <input
            style={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

        <button
          type="button"
          style={{ ...primaryBtn, alignSelf: "start" }}
          disabled={isPending}
          onClick={add}
        >
          {isPending ? "Se salvează…" : "Adaugă excepție"}
        </button>
      </div>
    </div>
  );
}

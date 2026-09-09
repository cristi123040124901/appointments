"use client";

import { useState, useTransition } from "react";
import type { Service } from "@/db/schema";
import {
  createServiceAction,
  updateServiceAction,
} from "@/lib/actions/admin-services";
import { label, input, primaryBtn, secondaryBtn } from "./styles";

type Props = {
  tenantSlug: string;
  service?: Service;
  onDone: () => void;
  onCancel?: () => void;
};

export function ServiceForm({ tenantSlug, service, onDone, onCancel }: Props) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    service?.durationMinutes ?? 30,
  );
  const [bufferMinutes, setBufferMinutes] = useState(
    service?.bufferMinutes ?? 0,
  );
  const [priceLei, setPriceLei] = useState(
    service ? (service.priceCents / 100).toString() : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const priceCents = Math.round(parseFloat(priceLei || "0") * 100);
    startTransition(async () => {
      const res = service
        ? await updateServiceAction({
            tenantSlug,
            serviceId: service.id,
            name,
            description,
            durationMinutes,
            bufferMinutes,
            priceCents,
          })
        : await createServiceAction({
            tenantSlug,
            name,
            description,
            durationMinutes,
            bufferMinutes,
            priceCents,
          });
      if (!res.ok) setError(res.error);
      else onDone();
    });
  }

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        display: "grid",
        gap: 10,
        maxWidth: 420,
      }}
    >
      <label style={label}>
        Nume
        <input
          style={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label style={label}>
        Descriere
        <input
          style={input}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ ...label, flex: 1 }}>
          Durată (min)
          <input
            style={input}
            type="number"
            min={5}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
          />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Buffer (min)
          <input
            style={input}
            type="number"
            min={0}
            value={bufferMinutes}
            onChange={(e) => setBufferMinutes(Number(e.target.value))}
          />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Preț (lei)
          <input
            style={input}
            type="number"
            min={0}
            step="0.01"
            value={priceLei}
            onChange={(e) => setPriceLei(e.target.value)}
          />
        </label>
      </div>

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          style={primaryBtn}
        >
          {isPending ? "Se salvează…" : service ? "Salvează" : "Adaugă"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={secondaryBtn}>
            Renunță
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { Staff } from "@/db/schema";
import { createStaffAction, updateStaffAction } from "@/lib/actions/admin-staff";
import { label, input, primaryBtn, secondaryBtn } from "./styles";

type Props = {
  tenantSlug: string;
  staffMember?: Staff;
  onDone: () => void;
  onCancel?: () => void;
};

export function StaffForm({ tenantSlug, staffMember, onDone, onCancel }: Props) {
  const [name, setName] = useState(staffMember?.name ?? "");
  const [bio, setBio] = useState(staffMember?.bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = staffMember
        ? await updateStaffAction({
            tenantSlug,
            staffId: staffMember.id,
            name,
            bio,
          })
        : await createStaffAction({ tenantSlug, name, bio });
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
        Bio
        <input
          style={input}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={isPending || !name.trim()}
          onClick={submit}
          style={primaryBtn}
        >
          {isPending ? "Se salvează…" : staffMember ? "Salvează" : "Adaugă"}
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

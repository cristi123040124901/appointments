"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOwnBookingAction } from "@/lib/actions/customer-bookings";

export function CancelOwnBookingButton({
  tenantSlug,
  bookingId,
}: {
  tenantSlug: string;
  bookingId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancel() {
    if (!confirm("Anulezi această programare?")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelOwnBookingAction({ tenantSlug, bookingId });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={cancel}
        disabled={isPending}
        style={{
          background: "none",
          border: "none",
          color: "#dc2626",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
          padding: 0,
        }}
      >
        {isPending ? "…" : "Anulează"}
      </button>
      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, marginTop: 2 }}>{error}</p>
      )}
    </div>
  );
}

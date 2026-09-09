"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBookingAction } from "@/lib/actions/admin-bookings";
import { dangerBtn } from "./styles";

export function CancelBookingButton({
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
    if (!confirm("Anulezi această rezervare?")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelBookingAction({ tenantSlug, bookingId });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button type="button" style={dangerBtn} disabled={isPending} onClick={cancel}>
        {isPending ? "…" : "Anulează"}
      </button>
      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, marginTop: 4 }}>{error}</p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { resendConfirmationAction } from "@/lib/actions/admin-bookings";
import { secondaryBtn } from "./styles";

export function ResendConfirmationButton({
  tenantSlug,
  bookingId,
}: {
  tenantSlug: string;
  bookingId: string;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function resend() {
    setResult(null);
    startTransition(async () => {
      const res = await resendConfirmationAction(tenantSlug, bookingId);
      setResult(res.ok ? { ok: true, message: "Trimis" } : { ok: false, message: res.error });
    });
  }

  return (
    <div>
      <button
        type="button"
        style={{ ...secondaryBtn, padding: "4px 8px", fontSize: 12 }}
        disabled={isPending}
        onClick={resend}
      >
        {isPending ? "…" : "Retrimite email"}
      </button>
      {result && (
        <div style={{ fontSize: 11, color: result.ok ? "#16a34a" : "#dc2626" }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled render error:", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-50 px-5 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          A apărut o eroare
        </h1>
        <p className="mt-3 text-neutral-500">
          Ceva nu a mers bine. Poți încerca din nou.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
        >
          Încearcă din nou
        </button>
      </div>
    </main>
  );
}

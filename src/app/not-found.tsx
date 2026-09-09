import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-50 px-5 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Pagina nu există
        </h1>
        <p className="mt-3 text-neutral-500">
          Verifică adresa sau întoarce-te la pagina principală.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
        >
          Pagina principală
        </Link>
      </div>
    </main>
  );
}

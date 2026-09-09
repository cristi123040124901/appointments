import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-50 px-5 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
          Programări online
        </h1>
        <p className="mt-4 text-neutral-500">
          Platformă de programări pentru saloane și cabinete. Fiecare afacere
          are propria pagină de rezervări, la adresa ei.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-block rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white"
        >
          Creează-ți afacerea
        </Link>
      </div>
    </main>
  );
}

// src/lib/db-error.ts
//
// Codul de eroare Postgres (ex. 23505 = unique_violation) apare direct pe
// obiectul aruncat de postgres-js pentru un `db.insert()` simplu, dar
// drizzle îl împachetează într-un alt Error (cu mesajul "Failed query: ...")
// când insertul e în interiorul unui db.transaction() — codul real ajunge
// atunci pe `err.cause.code`. Verificăm ambele locuri ca să nu depindem de
// unde anume s-a întâmplat insertul.
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

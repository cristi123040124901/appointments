// src/lib/tenant-slug.ts
//
// Rutele publice sunt /[tenant]/... — slug-ul e primul segment din URL.
// Orice segment folosit deja de o rută statică (top-level, în afara
// [tenant]) NU poate fi ales ca slug, altfel afacerea respectivă devine
// inaccesibilă (Next.js prioritizează ruta statică, nu mai ajunge
// niciodată la [tenant]). "admin"/"login"/etc. nu sunt un conflict real
// (sunt IMBRICATE sub [tenant], nu la același nivel), dar le blocăm oricum
// ca să evităm confuzia unei afaceri numite literal "admin".
const RESERVED_SLUGS = new Set([
  "api",
  "signup",
  "admin",
  "login",
  "account",
  "book",
  "forgot-password",
  "reset-password",
  "verify-email",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlugFormat(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 63 && SLUG_PATTERN.test(slug);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/** Normalizează un nume de afacere într-un slug candidat (nu garantează unicitatea). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritice (ă, â, î, ș, ț etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

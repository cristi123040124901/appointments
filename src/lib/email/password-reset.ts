// src/lib/email/password-reset.ts

export function passwordResetHtml(input: {
  resetUrl: string;
  tenantName?: string | null;
}): string {
  const { resetUrl, tenantName } = input;

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
      <h1 style="font-size: 18px; margin-top: 0;">Resetare parolă${tenantName ? ` — ${tenantName}` : ""}</h1>
      <p style="font-size: 15px; line-height: 1.5;">
        Am primit o cerere de resetare a parolei pentru contul tău. Dacă nu ai
        cerut tu asta, poți ignora acest email — parola ta rămâne neschimbată.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
          Alege o parolă nouă
        </a>
      </p>
      <p style="font-size: 13px; color: #94a3b8;">
        Link-ul expiră în 30 de minute. Dacă butonul nu funcționează, copiază acest link:<br>
        <span style="word-break: break-all;">${resetUrl}</span>
      </p>
    </div>
  </div>`;
}

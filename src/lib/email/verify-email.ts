// src/lib/email/verify-email.ts

export function verifyEmailHtml(input: {
  verifyUrl: string;
  tenantName: string;
}): string {
  const { verifyUrl, tenantName } = input;

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
      <h1 style="font-size: 18px; margin-top: 0;">Confirmă-ți adresa de email</h1>
      <p style="font-size: 15px; line-height: 1.5;">
        Ai creat un cont la ${tenantName}. Confirmă adresa de email ca să te
        poți autentifica cu email și parolă.
      </p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
          Confirmă emailul
        </a>
      </p>
      <p style="font-size: 13px; color: #94a3b8;">
        Link-ul expiră în 24 de ore. Dacă nu ai creat tu acest cont, poți ignora emailul.
      </p>
    </div>
  </div>`;
}

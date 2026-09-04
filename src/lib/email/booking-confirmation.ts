// src/lib/email/booking-confirmation.ts

type BookingConfirmationEmailInput = {
  tenantName: string;
  brandColor: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  dateLabel: string; // deja formatat, ex: "luni, 8 septembrie"
  timeLabel: string; // deja formatat, ex: "09:35"
  priceLabel: string; // ex: "80 lei"
  tenantAddress?: string | null;
  tenantPhone?: string | null;
};

/**
 * HTML simplu, inline styles peste tot — clienții de email (Gmail,
 * Outlook) ignoră <style> în <head> destul de des încât nu merită
 * riscul. Nu folosim un template engine separat (react-email etc.)
 * ca să nu adăugăm o dependință în plus pentru un singur email.
 */
export function bookingConfirmationHtml(
  input: BookingConfirmationEmailInput,
): string {
  const {
    tenantName,
    brandColor,
    customerName,
    serviceName,
    staffName,
    dateLabel,
    timeLabel,
    priceLabel,
    tenantAddress,
    tenantPhone,
  } = input;

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: ${brandColor}; padding: 24px; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff; font-size: 18px; margin: 0;">${tenantName}</h1>
    </div>
    <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <p style="font-size: 16px; margin-top: 0;">Salut, ${customerName}!</p>
      <p style="font-size: 15px; line-height: 1.5;">Rezervarea ta este confirmată:</p>

      <table style="width: 100%; font-size: 15px; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Serviciu</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Cu</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${staffName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Data</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${dateLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Ora</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${timeLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Preț</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${priceLabel}</td>
        </tr>
      </table>

      ${
        tenantAddress
          ? `<p style="font-size: 14px; color: #64748b; margin: 4px 0;">📍 ${tenantAddress}</p>`
          : ""
      }
      ${
        tenantPhone
          ? `<p style="font-size: 14px; color: #64748b; margin: 4px 0;">📞 ${tenantPhone}</p>`
          : ""
      }

      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
        Dacă nu poți ajunge, te rugăm să ne anunți din timp.
      </p>
    </div>
  </div>`;
}

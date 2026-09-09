// src/lib/email/booking-cancellation.ts

type BookingCancellationEmailInput = {
  tenantName: string;
  brandColor: string;
  customerName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
  cancelledBy: "customer" | "admin";
};

export function bookingCancellationHtml(
  input: BookingCancellationEmailInput,
): string {
  const {
    tenantName,
    brandColor,
    customerName,
    serviceName,
    dateLabel,
    timeLabel,
    cancelledBy,
  } = input;

  const note =
    cancelledBy === "admin"
      ? `${tenantName} a anulat această programare. Ne cerem scuze pentru inconvenient.`
      : "Programarea a fost anulată la cererea ta.";

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
    <div style="background: ${brandColor}; padding: 24px; border-radius: 12px 12px 0 0;">
      <h1 style="color: #ffffff; font-size: 18px; margin: 0;">${tenantName}</h1>
    </div>
    <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
      <p style="font-size: 16px; margin-top: 0;">Salut, ${customerName}!</p>
      <p style="font-size: 15px; line-height: 1.5;">${note}</p>

      <table style="width: 100%; font-size: 15px; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Serviciu</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; text-decoration: line-through;">${serviceName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Data</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; text-decoration: line-through;">${dateLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Ora</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; text-decoration: line-through;">${timeLabel}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
        Poți face o programare nouă oricând.
      </p>
    </div>
  </div>`;
}

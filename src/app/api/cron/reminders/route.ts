// src/app/api/cron/reminders/route.ts
//
// Gândit pentru un cron extern (crontab pe server, Vercel Cron etc.) care
// bate orar în acest endpoint. Fără scheduler intern — aplicația nu are
// nevoie de un proces separat cât timp ceva din afară o "trezește".
//
// Exemplu crontab (pe serverul unde rulează aplicația):
//   0 * * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://domeniul-tau/api/cron/reminders
import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/notifications/send-booking-reminder";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET nu e configurat" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const result = await sendDueReminders();
  return NextResponse.json(result);
}

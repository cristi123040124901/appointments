"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getSlotsAction,
  createBookingAction,
  type SlotDTO,
} from "@/lib/actions/booking";

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
};
type StaffMember = {
  id: string;
  name: string;
  bio: string | null;
  serviceIds: string[];
};
type LoggedInCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
} | null;

type Props = {
  tenantSlug: string;
  timezone: string;
  services: Service[];
  staff: StaffMember[];
  initialServiceId?: string | null;
  loggedInCustomer: LoggedInCustomer;
};

const DAYS_AHEAD = 14;
const lei = (cents: number) => `${(cents / 100).toFixed(0)} lei`;

/** următoarele N date locale, 'YYYY-MM-DD' */
function upcomingDates(timezone: string, n: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push(fmt.format(d));
  }
  return out;
}

function dayLabel(
  dateStr: string,
  index: number,
): { weekday: string; day: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return {
    weekday:
      index === 0
        ? "Azi"
        : index === 1
          ? "Mâine"
          : new Intl.DateTimeFormat("ro-RO", { weekday: "short" }).format(d),
    day: new Intl.DateTimeFormat("ro-RO", {
      day: "numeric",
      month: "short",
    }).format(d),
  };
}

export function BookingFlow({
  tenantSlug,
  timezone,
  services,
  staff,
  initialServiceId,
  loggedInCustomer,
}: Props) {
  const router = useRouter();
  const dates = upcomingDates(timezone, DAYS_AHEAD);

  const [service, setService] = useState<Service | null>(
    services.find((s) => s.id === initialServiceId) ?? null,
  );
  const [staffId, setStaffId] = useState<string | null>(null); // null = oricine
  const [date, setDate] = useState<string>(dates[0]);
  const [slot, setSlot] = useState<SlotDTO | null>(null);
  const [slots, setSlots] = useState<SlotDTO[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });
  const [phoneOverride, setPhoneOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, startLoading] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const eligibleStaff = service
    ? staff.filter((s) => s.serviceIds.includes(service.id))
    : [];

  /* sloturile se reîncarcă la orice schimbare de serviciu / prestator / zi */
  useEffect(() => {
    if (!service) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(null);
    setSlots(null);
    startLoading(async () => {
      const res = await getSlotsAction({
        tenantSlug,
        serviceId: service.id,
        from: date,
        to: date,
        staffId: staffId ?? undefined,
      });
      if (res.ok) setSlots(res.data[0]?.slots ?? []);
      else setError(res.error);
    });
  }, [service, staffId, date, tenantSlug]);

  function submit() {
    if (!service || !slot) return;
    setError(null);
    startSubmit(async () => {
      const res = await createBookingAction({
        tenantSlug,
        serviceId: service.id,
        staffId,
        startAt: slot.startAt,
        notes: form.notes,
        ...(loggedInCustomer
          ? { phoneOverride: loggedInCustomer.phone ? undefined : phoneOverride }
          : { name: form.name, phone: form.phone, email: form.email }),
      });
      if (res.ok) router.push(`/${tenantSlug}/book/${res.data.bookingId}`);
      else {
        setError(res.error);
        setSlot(null); // ora a expirat: forțăm reselectarea
      }
    });
  }

  /* ---------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-lg px-5 pb-24 pt-6">
      {/* Pasul 1 — serviciul */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-500">
          Ce ai nevoie?
        </h2>
        <div className="space-y-2">
          {services.map((s) => {
            const selected = service?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setService(s);
                  setStaffId(null);
                }}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-[var(--brand)] bg-white shadow-sm ring-1 ring-[var(--brand)]"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <span>
                  <span className="block font-medium text-neutral-900">
                    {s.name}
                  </span>
                  <span className="block text-sm text-neutral-500">
                    {s.durationMinutes} min
                  </span>
                </span>
                <span className="font-medium text-neutral-900">
                  {lei(s.priceCents)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Pasul 2 — prestatorul */}
      {service && eligibleStaff.length > 1 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-neutral-500">
            Cu cine?
          </h2>
          <div className="flex flex-wrap gap-2">
            <Chip active={staffId === null} onClick={() => setStaffId(null)}>
              Oricine e liber
            </Chip>
            {eligibleStaff.map((s) => (
              <Chip
                key={s.id}
                active={staffId === s.id}
                onClick={() => setStaffId(s.id)}
              >
                {s.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {/* Pasul 3 — ziua și ora */}
      {service && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-neutral-500">Când?</h2>

          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2">
            {dates.map((d, i) => {
              const { weekday, day } = dayLabel(d, i);
              const active = date === d;
              return (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={`flex min-w-[68px] shrink-0 flex-col items-center rounded-xl border px-3 py-2.5 transition ${
                    active
                      ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                  }`}
                >
                  <span className="text-xs opacity-80">{weekday}</span>
                  <span className="text-sm font-medium">{day}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {loadingSlots && (
              <p className="py-8 text-center text-sm text-neutral-400">
                Se încarcă orele…
              </p>
            )}

            {!loadingSlots && slots?.length === 0 && (
              <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
                <p className="text-sm text-neutral-600">
                  Nicio oră liberă în ziua asta.
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  Încearcă altă zi din listă.
                </p>
              </div>
            )}

            {!loadingSlots && slots && slots.length > 0 && (
              // butoane mari: componenta care decide dacă omul termină rezervarea
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => {
                  const active = slot?.startAt === s.startAt;
                  return (
                    <button
                      key={s.startAt}
                      onClick={() => setSlot(s)}
                      className={`rounded-xl border py-3.5 text-base font-medium tabular-nums transition ${
                        active
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                          : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400"
                      }`}
                    >
                      {s.localTime}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pasul 4 — datele de contact */}
      {slot && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-neutral-500">
            Cum te contactăm?
          </h2>
          <div className="space-y-3">
            {loggedInCustomer ? (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <p className="text-sm text-neutral-700">
                  Rezervi ca{" "}
                  <span className="font-medium text-neutral-900">
                    {loggedInCustomer.name}
                  </span>
                  {loggedInCustomer.email && ` (${loggedInCustomer.email})`}
                </p>
                {!loggedInCustomer.phone && (
                  <div className="mt-3">
                    <Field
                      label="Telefon"
                      value={phoneOverride}
                      onChange={(v) => setPhoneOverride(v as string)}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      hint="Aici primești confirmarea și reminderul."
                    />
                  </div>
                )}
              </div>
            ) : (
              <>
                <Field
                  label="Nume"
                  value={form.name}
                  onChange={(v) => setForm({ ...form, name: v as string })}
                  autoComplete="name"
                />
                <Field
                  label="Telefon"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v as string })}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  hint="Aici primești confirmarea și reminderul."
                />
                <Field
                  label="Email (opțional)"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v as string })}
                  type="email"
                  autoComplete="email"
                />
                <p className="text-sm text-neutral-500">
                  <a
                    href={`/${tenantSlug}/login`}
                    className="underline underline-offset-4"
                  >
                    Ai deja cont? Intră ca să nu mai completezi datele
                  </a>
                </p>
              </>
            )}
            <Field
              label="Mențiuni (opțional)"
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v as string })}
              multiline
            />
          </div>
        </section>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Bara de confirmare, fixată jos pe telefon */}
      {slot && service && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-4">
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium text-neutral-900">
                {service.name} · {slot.localTime}
              </p>
              <p className="text-neutral-500">{lei(service.priceCents)}</p>
            </div>
            <button
              onClick={submit}
              disabled={
                submitting ||
                (loggedInCustomer
                  ? !loggedInCustomer.phone && phoneOverride.length < 9
                  : form.name.length < 2 || form.phone.length < 9)
              }
              className="rounded-xl bg-[var(--brand)] px-6 py-3 font-medium text-white transition disabled:opacity-40"
            >
              {submitting ? "Se trimite…" : "Rezervă"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        active
          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const cls =
    "w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-base outline-none focus:border-[var(--brand)] focus:ring-1 focus:ring-[var(--brand)]";
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-neutral-700">{label}</span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          {...rest}
        />
      )}
      {hint && (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      )}
    </label>
  );
}

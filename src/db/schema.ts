import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  time,
  date,
  unique,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["owner", "staff"]);

export const bookingStatus = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

/* ------------------------------------------------------------------ */
/* Tenant și oameni                                                    */
/* ------------------------------------------------------------------ */

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Europe/Bucharest"),
  brandColor: text("brand_color").notNull().default("#0F172A"),
  logoUrl: text("logo_url"),
  phone: text("phone"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    role: userRole("role").notNull().default("staff"),
    // brute-force pe login: numărăm eșecurile consecutive, blocăm temporar
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // email unic global: altfel login-ul are nevoie și de tenant ca să știe pe cine caută
    unique("users_email_unique").on(t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // nullable: nu orice prestator are cont de logare
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    color: text("color").notNull().default("#64748B"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("staff_tenant_idx").on(t.tenantId)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash"),
    // telefonul e identificatorul; se stochează normalizat (E.164)
    phone: text("phone"),
    name: text("name").notNull(),
    email: text("email"),
    // null = neverificat. Contează doar dacă passwordHash e setat (cont
    // creat prin credentials) — vezi signIn() din auth.ts: un cont Google
    // nu se atașează peste un rând cu email neverificat și parolă (ar
    // putea fi un cont "sechestrat" de altcineva care a folosit emailul tău).
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    notes: text("notes"),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("customers_tenant_email_unique").on(t.tenantId, t.email),
    unique("customers_tenant_phone_unique").on(t.tenantId, t.phone),
  ],
);

/* ------------------------------------------------------------------ */
/* Oferta                                                              */
/* ------------------------------------------------------------------ */

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    color: text("color").notNull().default("#0EA5E9"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("services_tenant_idx").on(t.tenantId)],
);

export const staffServices = pgTable(
  "staff_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    // null = se folosește valoarea de pe service
    durationOverride: integer("duration_override"),
    priceOverrideCents: integer("price_override_cents"),
  },
  (t) => [
    unique("staff_services_unique").on(t.staffId, t.serviceId),
    index("staff_services_service_idx").on(t.serviceId),
  ],
);

/* ------------------------------------------------------------------ */
/* Disponibilitate                                                     */
/* ------------------------------------------------------------------ */

/**
 * Program recurent. Ore LOCALE (tip `time`), interpretate în tenants.timezone.
 * Un staff poate avea mai multe intervale pe aceeași zi (pauză de prânz =
 * două rânduri, nu un rând cu gaură).
 */
export const workingHours = pgTable(
  "working_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    weekday: integer("weekday").notNull(), // 0 = duminică ... 6 = sâmbătă
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [index("working_hours_staff_weekday_idx").on(t.staffId, t.weekday)],
);

/**
 * Excepții: concedii, sărbători, zile cu program special.
 * staffId null = se aplică întregului tenant (sărbătoare legală).
 * isClosed true = zi liberă. isClosed false = program special (start/end obligatorii).
 */
export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, {
      onDelete: "cascade",
    }),
    date: date("date").notNull(), // dată locală, 'YYYY-MM-DD'
    isClosed: boolean("is_closed").notNull().default(true),
    startTime: time("start_time"),
    endTime: time("end_time"),
    reason: text("reason"),
  },
  (t) => [index("schedule_exceptions_tenant_date_idx").on(t.tenantId, t.date)],
);

/* ------------------------------------------------------------------ */
/* Rezervări                                                           */
/* ------------------------------------------------------------------ */

/**
 * endAt INCLUDE buffer-ul. serviceEndAt e momentul real de final al serviciului,
 * ce se afișează clientului. Diferența dintre ele e timpul de curățenie/pregătire.
 *
 * serviceName / durationMinutes / bufferMinutes / priceCents sunt SNAPSHOT-uri:
 * dacă tenantul schimbă prețul mâine, rezervările de azi păstrează prețul de azi.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),

    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    serviceEndAt: timestamp("service_end_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(), // include buffer

    // snapshot la momentul rezervării
    serviceName: text("service_name").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull(),
    priceCents: integer("price_cents").notNull(),

    status: bookingStatus("status").notNull().default("confirmed"),
    notes: text("notes"),
    cancellationReason: text("cancellation_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("bookings_tenant_start_idx").on(t.tenantId, t.startAt),
    index("bookings_staff_start_idx").on(t.staffId, t.startAt),
    index("bookings_customer_idx").on(t.customerId),
  ],
);

/* ------------------------------------------------------------------ */
/* Tipuri inferate                                                     */
/* ------------------------------------------------------------------ */

export type Tenant = typeof tenants.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type WorkingHour = typeof workingHours.$inferSelect;
export type ScheduleException = typeof scheduleExceptions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

/* ------------------------------------------------------------------ */
/* De adăugat în schema.ts existent, lângă celelalte enum-uri/tabele   */
/* ------------------------------------------------------------------ */

export const notificationChannel = pgEnum("notification_channel", [
  "email",
  "sms",
]);

export const notificationType = pgEnum("notification_type", [
  "confirmation",
  "reminder",
  "cancellation",
]);

export const notificationStatus = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

/**
 * Un rând per încercare de trimitere, nu per booking — dacă retrimiți
 * un reminder eșuat, apare un rând nou, nu se suprascrie cel vechi.
 * Așa poți răspunde la „de ce n-a primit clientul emailul?" uitându-te
 * direct în tabel, fără să sapi în loguri.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),

    channel: notificationChannel("channel").notNull(),
    type: notificationType("type").notNull(),
    status: notificationStatus("status").notNull().default("pending"),

    recipient: text("recipient").notNull(), // email sau telefon, snapshot la momentul trimiterii
    providerId: text("provider_id"), // id-ul returnat de Resend, util pt. debugging/webhooks
    error: text("error"),

    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_booking_idx").on(t.bookingId),
    index("notifications_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

/* ------------------------------------------------------------------ */
/* Autentificare: resetare parolă și verificare email                  */
/* ------------------------------------------------------------------ */

export const passwordResetKind = pgEnum("password_reset_kind", [
  "admin",
  "customer",
]);

/**
 * Un rând per cerere de resetare. Stocăm doar hash-ul tokenului (SHA-256) —
 * dacă cineva citește DB-ul, nu poate folosi rândul ca link de resetare.
 * Exact un singur token folosit vreodată per rând (usedAt) — nu se reciclează.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: passwordResetKind("kind").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "cascade",
    }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("password_reset_tokens_hash_unique").on(t.tokenHash),
    index("password_reset_tokens_user_idx").on(t.userId),
    index("password_reset_tokens_customer_idx").on(t.customerId),
  ],
);

/** Aceeași idee ca password_reset_tokens, dar pentru confirmarea emailului la înregistrare. */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("email_verification_tokens_hash_unique").on(t.tokenHash),
    index("email_verification_tokens_customer_idx").on(t.customerId),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationToken =
  typeof emailVerificationTokens.$inferSelect;

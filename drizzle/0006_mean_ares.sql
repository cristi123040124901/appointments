ALTER TABLE "email_verification_tokens" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
-- DEFAULT temporar ca să nu pice pe rânduri existente (toate erau de tip
-- "customer" înainte de coloana asta) — eliminat imediat după, schema.ts
-- nu definește un default aici.
ALTER TABLE "email_verification_tokens" ADD COLUMN "kind" "password_reset_kind" NOT NULL DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint

-- ===================================================================
-- DE ADĂUGAT MANUAL. Fără backfill-ul ăsta, orice admin existent (owner
-- seed-uit, sau creat înainte de gate-ul de verificare) ar rămâne blocat
-- afară la următorul login — tratăm contul lor ca deja verificat.
-- ===================================================================
UPDATE "users"
SET "email_verified_at" = "created_at"
WHERE "password_hash" IS NOT NULL;
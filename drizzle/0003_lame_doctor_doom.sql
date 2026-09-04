ALTER TABLE "customers" DROP CONSTRAINT "customers_tenant_phone_unique";--> statement-breakpoint
DROP INDEX "customers_tenant_idx";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_email_unique" UNIQUE("tenant_id","email");
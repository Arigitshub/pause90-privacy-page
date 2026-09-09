CREATE TABLE "pause90_pdf_deliveries" (
	"order_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"sent_at" timestamp with time zone
);

-- Schema for self-hosted Postgres. Runs automatically on first container boot
-- (docker-entrypoint-initdb.d) against an empty data volume. Safe to re-run.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" text NOT NULL DEFAULT 'user',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
-- Upgrade path for volumes created before roles existed.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope" text,
  "password" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "collection" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "name" text NOT NULL,
  "data" jsonb NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Upgrade path for volumes created when a user had a single collection
-- (userId was the primary key). Adds the new columns and switches the key.
ALTER TABLE "collection" ADD COLUMN IF NOT EXISTS "id" text;
ALTER TABLE "collection" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "collection" ADD COLUMN IF NOT EXISTS "createdAt" timestamp NOT NULL DEFAULT now();
UPDATE "collection" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
UPDATE "collection" SET "name" = 'Card Collection' WHERE "name" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'collection' AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'collection_pkey'
      AND EXISTS (
        SELECT 1 FROM information_schema.key_column_usage
        WHERE constraint_name = 'collection_pkey' AND column_name = 'userId'
      )
  ) THEN
    ALTER TABLE "collection" DROP CONSTRAINT "collection_pkey";
    ALTER TABLE "collection" ADD PRIMARY KEY ("id");
  END IF;
END $$;
ALTER TABLE "collection" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "collection" ALTER COLUMN "name" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "collection_userId_idx" ON "collection" ("userId");

-- Idempotent rename: only rename passwordHash -> password if the legacy
-- column still exists. On databases where 20260624_init already created
-- `password` (the current Prisma schema column), this is a no-op and does
-- not error. Fixes P3006 (column "passwordHash" does not exist) on shadow DB.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'passwordHash'
  ) THEN
    ALTER TABLE "User" RENAME COLUMN "passwordHash" TO "password";
  END IF;
END
$$;

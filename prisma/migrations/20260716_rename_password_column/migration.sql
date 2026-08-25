-- Rename passwordHash column to password to match Prisma schema
ALTER TABLE "User" RENAME COLUMN "passwordHash" TO "password";

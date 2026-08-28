-- Add composite index on Contact(businessId, name) for 100k-scale name search
-- (perf optimization, see .spec/PERFORMANCE_OPTIMIZATION.md)
-- IF NOT EXISTS keeps this safe to re-run on databases where the index
-- was already created manually.
CREATE INDEX IF NOT EXISTS "Contact_businessId_name_idx" ON "Contact"("businessId", "name");

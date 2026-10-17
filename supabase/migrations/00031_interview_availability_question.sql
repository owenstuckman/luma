-- 00031: intentionally empty.
--
-- This migration once added an interview-availability question to one
-- organization's job posting. That was tenant data, not schema, so it was
-- removed; the version number is kept so migration history stays continuous.
-- Availability questions are added per job in the form builder
-- (Settings → Manage Postings), or shipped in a tenant file
-- (`npm run tenant -- import`, docs/INSTANCE.md).
SELECT 1;

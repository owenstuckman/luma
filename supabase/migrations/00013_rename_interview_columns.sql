-- Rename camelCase interview columns to snake_case for consistency
-- with interviewer_availability (start_time, end_time) and Postgres conventions.
ALTER TABLE public.interviews RENAME COLUMN "startTime" TO start_time;
ALTER TABLE public.interviews RENAME COLUMN "endTime" TO end_time;

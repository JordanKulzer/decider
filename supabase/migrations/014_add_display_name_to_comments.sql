-- =============================================================================
-- 014_add_display_name_to_comments.sql
--
-- Adds a display_name column to comments so the fetch path no longer needs
-- a relational join from comments.user_id → auth.users.
--
-- Root cause of the prior bug: comments.user_id FK references auth.users(id).
-- PostgREST can only traverse FKs within the public schema, so the embed
-- `users:user_id (username)` threw "Could not find a relationship between
-- 'comments' and 'user_...'".
--
-- With display_name stored at insert time we can do a plain SELECT with no
-- joins. Guest support is also handled since guests have no auth.users row.
-- =============================================================================

ALTER TABLE comments ADD COLUMN IF NOT EXISTS display_name text;

-- Backfill display_name from public.users for any pre-existing rows.
UPDATE comments c
SET display_name = u.username
FROM users u
WHERE u.id = c.user_id
  AND c.display_name IS NULL;

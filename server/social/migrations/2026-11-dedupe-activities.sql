-- Remove eventos duplicados de resenha e nota (mantém só o mais recente por pessoa, tipo e jogo).
-- Aplicar no D1 com:
--   npx wrangler d1 execute lazulium-social --remote --file=migrations/2026-11-dedupe-activities.sql
DELETE FROM activities
WHERE kind IN ('reviewed', 'rated')
  AND EXISTS (
    SELECT 1 FROM activities newer
    WHERE newer.user_id = activities.user_id
      AND newer.kind = activities.kind
      AND newer.game_key = activities.game_key
      AND (newer.at > activities.at OR (newer.at = activities.at AND newer.id > activities.id))
  );

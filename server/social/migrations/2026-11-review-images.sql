-- Uma vez só, no banco que já existia antes da 3.3 (o schema.sql cria a tabela nova; a coluna não):
--   npx wrangler d1 execute lazulium-social --remote --file=migrations/2026-11-review-images.sql
ALTER TABLE library_games ADD COLUMN review_images TEXT;

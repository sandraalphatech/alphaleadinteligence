-- ============================================================
-- ASSINATURA DE EMAIL POR UTILIZADOR
-- Corre este ficheiro no Supabase (SQL Editor). É seguro correr mais de uma vez.
-- Guarda a assinatura (HTML já limpo pelo servidor) de cada pessoa da equipa.
-- ============================================================
alter table utilizadores add column if not exists assinatura_html text;

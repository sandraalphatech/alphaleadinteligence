-- Etapa 9: definições da plataforma. Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- O idioma preferido passa a ficar na conta de cada utilizador (e não só no browser), para o mesmo idioma aparecer em qualquer computador.

alter table utilizadores add column if not exists idioma text check (idioma in ('pt', 'en', 'es'));

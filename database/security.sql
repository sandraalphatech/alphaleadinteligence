-- ------------------------------------------------------------
-- SEGURANÇA: correr UMA vez no SQL Editor do Supabase (é seguro repetir).
--
-- 1. Novos utilizadores deixam de nascer como administrador.
-- 2. As políticas RLS "autenticados_*" (using (true)) permitiam que QUALQUER conta
--    autenticada lesse e escrevesse nas tabelas diretamente pela API REST do Supabase,
--    ignorando os papéis (admin / comercial / leitura) que o backend aplica.
--    O backend usa a chave secreta (service role), que ignora a RLS, por isso
--    remover estas políticas não afeta a aplicação: a RLS fica ativa e sem acesso direto.
--
-- ATENÇÃO: correr DEPOIS dos outros ficheiros .sql (alguns recriam as políticas permissivas se forem repetidos).
-- Depois de correr isto, no painel do Supabase: Authentication → Sign In / Providers
-- → desligar "Allow new users to sign up" (os utilizadores criam-se pelo painel).
-- ------------------------------------------------------------

-- 1. papel por defeito e primeiro utilizador
alter table utilizadores alter column papel set default 'leitura';

create or replace function criar_perfil_utilizador()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.utilizadores (id, nome, email, papel)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
        new.email,
        case when exists (select 1 from public.utilizadores) then 'leitura' else 'admin' end
    );
    return new;
end;
$$;

-- 2. remove todas as políticas permissivas e garante RLS ligada em todas as tabelas do esquema public
do $$
declare r record;
begin
    for r in select schemaname, tablename, policyname from pg_policies
             where schemaname = 'public' and policyname like 'autenticados\_%' loop
        execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    end loop;

    for r in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', r.tablename);
    end loop;
end $$;

-- 3. a chave pública (anon/authenticated) não precisa de acesso direto às tabelas
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Verificação (deve devolver 0 linhas):
-- select tablename, policyname from pg_policies where schemaname = 'public';
-- Quem é admin hoje:
-- select email, papel from utilizadores order by criado_em;

-- Etapa 9: análise mensal escrita pela IA (resumo, o que correu bem, problemas e plano de melhoria).
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- Guarda UMA análise por mês e por idioma. "dados" é a fotografia dos números agregados que a IA recebeu (sem nomes de empresas nem de pessoas),
-- para se poder confirmar mais tarde em que números a análise se baseou. Gerar outra vez substitui a anterior desse mês e idioma.

create table if not exists analises_mensais (
    id          uuid primary key default gen_random_uuid(),
    mes         text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    idioma      text not null check (idioma in ('pt', 'en', 'es')),
    analise     jsonb not null,
    dados       jsonb not null,
    modelo      text,
    parcial     boolean not null default false,        -- gerada com o mês ainda a meio
    criada_por  uuid references utilizadores(id) on delete set null,
    criado_em   timestamptz not null default now(),
    unique (mes, idioma)
);
create index if not exists idx_analises_mensais_mes on analises_mensais (mes desc);

-- Segurança ao nível das linhas (igual às outras tabelas)
alter table analises_mensais enable row level security;
drop policy if exists "autenticados_analises_mensais" on analises_mensais;
create policy "autenticados_analises_mensais" on analises_mensais for all to authenticated using (true) with check (true);

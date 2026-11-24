-- ============================================================
-- ETAPA 4 (dia 4): RECOLHA, TRATAMENTO E ARMAZENAMENTO
-- Corre este ficheiro uma vez no Supabase (SQL Editor).
-- É seguro correr mais de uma vez.
-- ============================================================

-- 1. radar_itens: memória do que já foi lido e analisado.
--    Serve para não pagar duas vezes pela análise da mesma notícia
--    e para guardar as que não deram empresa (descartadas).
create table if not exists radar_itens (
    url_hash    text primary key,                       -- SHA-1 da ligação (identifica o item)
    url         text not null,
    titulo      text,
    conector    text,
    resultado   text not null
                check (resultado in ('empresa_nova', 'empresa_existente', 'sem_empresa', 'fora_ambito', 'erro')),
    empresa_id  uuid references empresas(id) on delete set null,
    criado_em   timestamptz not null default now()
);
create index if not exists idx_radar_itens_criado on radar_itens (criado_em desc);

-- 2. radar_execucoes: histórico de cada recolha (quem, quando, quanto, com que resultado)
create table if not exists radar_execucoes (
    id                uuid primary key default gen_random_uuid(),
    iniciada_por      uuid references utilizadores(id) on delete set null,
    estado            text not null default 'a_correr'
                      check (estado in ('a_correr', 'concluida', 'falhou')),
    conectores        text[],
    itens_lidos       integer not null default 0,      -- itens devolvidos pelas fontes
    itens_novos       integer not null default 0,      -- ainda não analisados antes
    itens_analisados  integer not null default 0,      -- já enviados à Claude nesta recolha
    empresas_criadas  integer not null default 0,
    leads_criados     integer not null default 0,
    sem_empresa       integer not null default 0,      -- notícias sem uma empresa identificável
    fora_ambito       integer not null default 0,      -- empresas fora da Europa e das Américas
    erros             integer not null default 0,
    detalhe_erro      text,
    iniciada_em       timestamptz not null default now(),
    concluida_em      timestamptz
);
create index if not exists idx_radar_execucoes_inicio on radar_execucoes (iniciada_em desc);

-- 3. Segurança ao nível das linhas (igual às outras tabelas)
alter table radar_itens     enable row level security;
alter table radar_execucoes enable row level security;

drop policy if exists "autenticados_radar_itens" on radar_itens;
create policy "autenticados_radar_itens" on radar_itens
    for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_radar_execucoes" on radar_execucoes;
create policy "autenticados_radar_execucoes" on radar_execucoes
    for all to authenticated using (true) with check (true);

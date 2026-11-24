-- ============================================================
-- Alpha Leads Intelligence - Esquema da base de dados (Fase 3)
-- Colar no Supabase: SQL Editor > New query > Run
-- ============================================================


-- ------------------------------------------------------------
-- 1. UTILIZADORES
-- O login (email + password) é gerido pelo Supabase em auth.users.
-- Esta tabela guarda os dados extra do utilizador (nome, papel).
-- O "id" é o mesmo id do auth.users: é a ligação entre as duas.
-- ------------------------------------------------------------
create table if not exists utilizadores (
    id          uuid primary key references auth.users(id) on delete cascade,
    nome        text not null,
    email       text not null unique,
    papel       text not null default 'leitura'
                check (papel in ('admin', 'comercial', 'leitura')),
    criado_em   timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2. FONTES
-- De onde veio a informação (site, importação, API, etc.)
-- ------------------------------------------------------------
create table if not exists fontes (
    id          uuid primary key default gen_random_uuid(),
    nome        text not null,
    tipo        text not null default 'manual'
                check (tipo in ('manual', 'importacao', 'api', 'website', 'rede_social')),
    url         text,
    activa      boolean not null default true,
    criado_em   timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 3. EMPRESAS
-- A startup em si. Uma empresa pode ter vários leads.
-- ------------------------------------------------------------
create table if not exists empresas (
    id              uuid primary key default gen_random_uuid(),
    nome            text not null,
    website         text,
    pais            text,
    idioma          text check (idioma in ('pt', 'en', 'es')),
    sector          text,
    descricao       text,
    fonte_id        uuid references fontes(id) on delete set null,
    nao_contactar   boolean not null default false,
    criado_em       timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 4. LEADS
-- A oportunidade comercial ligada a uma empresa.
-- Os 4 critérios valem de 0 a 100 e a pontuação total é
-- calculada automaticamente pela base de dados:
--   40% intenção + 30% adequação + 20% evidências + 10% potencial
-- ------------------------------------------------------------
create table if not exists leads (
    id                  uuid primary key default gen_random_uuid(),
    empresa_id          uuid not null references empresas(id) on delete cascade,
    responsavel_id      uuid references utilizadores(id) on delete set null,

    servico_interesse   text check (servico_interesse in (
                            'sistemas', 'website', 'marketing_digital',
                            'redes_sociais', 'automacao_ia',
                            'design_grafico')),

    estado              text not null default 'novo'
                        check (estado in (
                            'novo', 'analisado', 'contactado', 'respondeu',
                            'reuniao_agendada', 'proposta_enviada',
                            'proposta_aceite', 'proposta_recusada',
                            'negocio_fechado', 'nao_contactar',
                            'oportunidade_perdida')),

    -- critérios da pontuação (0 a 100 cada)
    intencao_compra     integer check (intencao_compra between 0 and 100),
    adequacao_servicos  integer check (adequacao_servicos between 0 and 100),
    qualidade_evidencias integer check (qualidade_evidencias between 0 and 100),
    potencial_comercial integer check (potencial_comercial between 0 and 100),

    -- pontuação final: só existe quando os 4 critérios estão preenchidos
    pontuacao           integer generated always as (
                            round(
                                intencao_compra * 0.40 +
                                adequacao_servicos * 0.30 +
                                qualidade_evidencias * 0.20 +
                                potencial_comercial * 0.10
                            )
                        ) stored,

    analise_ia          text,
    criado_em           timestamptz not null default now(),
    actualizado_em      timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 5. CONTACTOS
-- Pessoas da empresa e histórico de mensagens do lead.
-- ------------------------------------------------------------
create table if not exists contactos (
    id              uuid primary key default gen_random_uuid(),
    lead_id         uuid not null references leads(id) on delete cascade,
    nome            text,
    cargo           text,
    email           text,
    telefone        text,
    canal           text check (canal in ('email', 'linkedin', 'telefone', 'outro')),
    mensagem        text,
    estado_mensagem text not null default 'rascunho'
                    check (estado_mensagem in ('rascunho', 'aprovada', 'enviada', 'respondida')),
    enviado_em      timestamptz,
    criado_em       timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 6. ÍNDICES (tornam as pesquisas mais rápidas)
-- ------------------------------------------------------------
create index if not exists idx_leads_empresa   on leads(empresa_id);
create index if not exists idx_leads_estado    on leads(estado);
create index if not exists idx_leads_pontuacao on leads(pontuacao desc);
create index if not exists idx_contactos_lead  on contactos(lead_id);
create index if not exists idx_empresas_fonte  on empresas(fonte_id);


-- ------------------------------------------------------------
-- 7. ACTUALIZAR "actualizado_em" AUTOMATICAMENTE
-- ------------------------------------------------------------
create or replace function definir_actualizado_em()
returns trigger as $$
begin
    new.actualizado_em = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_actualizado on leads;
create trigger trg_leads_actualizado
    before update on leads
    for each row execute function definir_actualizado_em();


-- ------------------------------------------------------------
-- 8. SEGURANÇA (Row Level Security)
-- Só utilizadores com sessão iniciada acedem aos dados.
-- O backend (chave service_role) ignora estas regras.
-- ------------------------------------------------------------
alter table utilizadores enable row level security;
alter table fontes       enable row level security;
alter table empresas     enable row level security;
alter table leads        enable row level security;
alter table contactos    enable row level security;

drop policy if exists "autenticados_utilizadores" on utilizadores;
create policy "autenticados_utilizadores" on utilizadores
    for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_fontes" on fontes;
create policy "autenticados_fontes" on fontes
    for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_empresas" on empresas;
create policy "autenticados_empresas" on empresas
    for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_leads" on leads;
create policy "autenticados_leads" on leads
    for all to authenticated using (true) with check (true);

drop policy if exists "autenticados_contactos" on contactos;
create policy "autenticados_contactos" on contactos
    for all to authenticated using (true) with check (true);


-- ------------------------------------------------------------
-- 9. CRIAR PERFIL AUTOMATICAMENTE
-- Quando um utilizador é criado no Supabase Auth, cria-se logo
-- a linha correspondente na tabela "utilizadores".
-- ------------------------------------------------------------
create or replace function criar_perfil_utilizador()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    -- O primeiro utilizador da plataforma é o administrador; todos os outros entram só com leitura
    -- (o administrador promove-os em Definições → Equipa). Nunca confiar em dados vindos do registo.
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

drop trigger if exists trg_novo_utilizador on auth.users;
create trigger trg_novo_utilizador
    after insert on auth.users
    for each row execute function criar_perfil_utilizador();

-- ============================================================
-- ETAPA 5: IDENTIFICAÇÃO E ENRIQUECIMENTO DE EMPRESAS
-- Corre este ficheiro no Supabase (SQL Editor). É seguro correr mais de uma vez.
-- Os dias seguintes da etapa acrescentam blocos novos a este mesmo ficheiro.
-- ============================================================

-- ------------------------------------------------------------
-- DIA 1 (19/11): identificação (website, cidade, país, sector)
-- ------------------------------------------------------------
alter table empresas add column if not exists dominio                text;   -- ex.: payhawk.com (sem www)
alter table empresas add column if not exists website_estado         text not null default 'por_verificar'
    check (website_estado in ('por_verificar', 'verificado', 'rejeitado', 'inacessivel', 'nao_encontrado'));
alter table empresas add column if not exists website_verificado_em  timestamptz;
alter table empresas add column if not exists cidade                 text;
alter table empresas add column if not exists identificada_em        timestamptz;   -- quando foi tentada a identificação
alter table empresas add column if not exists identificacao_notas    text;          -- o que a pesquisa concluiu (e com que confiança)

create index if not exists idx_empresas_dominio on empresas (dominio);

-- ------------------------------------------------------------
-- DIA 2 (20/11): enriquecimento e decisores
-- Só guardamos o que a PRÓPRIA empresa publica no seu site (páginas About, Team, Contact),
-- sempre com a ligação de origem e a data (RGPD: dados profissionais e públicos, rastreáveis).
-- ------------------------------------------------------------
alter table empresas add column if not exists morada                 text;
alter table empresas add column if not exists telefone               text;
alter table empresas add column if not exists email_geral            text;    -- ex.: hello@empresa.com (publicado no site)
alter table empresas add column if not exists redes                  jsonb;   -- {linkedin, twitter, github, instagram, youtube, facebook}
alter table empresas add column if not exists sobre                  text;    -- resumo do que a empresa faz, segundo o próprio site
alter table empresas add column if not exists enriquecida_em         timestamptz;
alter table empresas add column if not exists enriquecimento_notas   text;

-- Pessoas com poder de decisão (fundadores, CEO, marketing, comercial)
create table if not exists decisores (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id) on delete cascade,
    nome            text not null,
    cargo           text,
    categoria       text not null default 'outro'
                    check (categoria in ('fundador', 'ceo', 'marketing', 'comercial', 'tecnologia', 'outro')),
    linkedin_url    text,        -- só se a empresa o publica no próprio site
    email           text,        -- só se aparece escrito no site (nunca adivinhado)
    fonte_url       text not null,                    -- página onde a pessoa aparece
    recolhido_em    timestamptz not null default now(),
    nao_contactar   boolean not null default false,
    criado_em       timestamptz not null default now()
);
create unique index if not exists idx_decisores_empresa_nome on decisores (empresa_id, lower(nome));
create index if not exists idx_decisores_empresa on decisores (empresa_id);

alter table decisores enable row level security;
drop policy if exists "autenticados_decisores" on decisores;
create policy "autenticados_decisores" on decisores
    for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- DIA 3 (23/11): validação, normalização, deduplicação e histórico
-- ------------------------------------------------------------

-- 1. Normalização: formas comparáveis ("Acme, Inc." = "ACME Ltd")
alter table empresas  add column if not exists nome_normalizado    text;
alter table decisores add column if not exists nome_normalizado    text;

-- 2. Validação de contactos
alter table empresas  add column if not exists email_geral_estado  text
    check (email_geral_estado in ('valido', 'sem_mx', 'invalido'));       -- sem_mx = o domínio não recebe correio
alter table decisores add column if not exists email_estado        text
    check (email_estado in ('valido', 'sem_mx', 'invalido'));

-- 3. Tipo de empresa: o alvo da Alpha Tech são startups e PME
alter table empresas add column if not exists tipo_empresa   text
    check (tipo_empresa in ('startup', 'pme', 'grande_empresa', 'projeto_individual', 'outro'));
alter table empresas add column if not exists tipo_motivo    text;
alter table empresas add column if not exists qualificada_em timestamptz;

-- 4. Prevenção de duplicados (a base de dados recusa-os, mesmo que o código falhe)
--    Empresas: o mesmo site oficial é a mesma empresa; e o mesmo nome (normalizado) no mesmo país também.
--    (o índice antigo do dia 1, só por nome, impedia duas empresas com o mesmo nome em países diferentes: é substituído pelo de nome + país)
drop index if exists idx_empresas_nome_unico;
create unique index if not exists idx_empresas_dominio_unico on empresas (dominio) where dominio is not null;
create unique index if not exists idx_empresas_nome_pais_unico on empresas (nome_normalizado, coalesce(pais, '')) where nome_normalizado is not null;
--    Contactos: a mesma pessoa, o mesmo email ou o mesmo LinkedIn só podem existir uma vez.
create unique index if not exists idx_decisores_pessoa_unica   on decisores (empresa_id, nome_normalizado) where nome_normalizado is not null;
create unique index if not exists idx_decisores_email_unico    on decisores (lower(email)) where email is not null;
create unique index if not exists idx_decisores_linkedin_unico on decisores (linkedin_url) where linkedin_url is not null;

-- 5. Histórico: cada alteração a empresas, decisores e leads fica registada automaticamente.
--    "ultima_origem" é preenchida pelo código (recolha, identificacao, enriquecimento, validacao, fusao);
--    sem ela, a alteração conta como "manual". O histórico não tem chave estrangeira de propósito:
--    sobrevive se a empresa for apagada ou fundida.
alter table empresas  add column if not exists ultima_origem text;
alter table decisores add column if not exists ultima_origem text;
alter table leads     add column if not exists ultima_origem text;

create table if not exists historico (
    id            uuid primary key default gen_random_uuid(),
    entidade      text not null check (entidade in ('empresa', 'decisor', 'lead')),
    entidade_id   uuid not null,
    empresa_id    uuid,
    rotulo        text,                 -- nome da empresa/pessoa na altura (legível mesmo depois de apagada)
    campo         text not null,        -- campo alterado, ou (criado) / (removido) / (fundida em)
    valor_antigo  text,
    valor_novo    text,
    origem        text not null default 'manual',
    criado_em     timestamptz not null default now()
);
create index if not exists idx_historico_empresa on historico (empresa_id, criado_em desc);
create index if not exists idx_historico_entidade on historico (entidade, entidade_id);

alter table historico enable row level security;
drop policy if exists "autenticados_historico_ler" on historico;
create policy "autenticados_historico_ler" on historico for select to authenticated using (true);   -- só leitura

create or replace function registar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_entidade text := case TG_TABLE_NAME when 'empresas' then 'empresa' when 'decisores' then 'decisor' else 'lead' end;
    v_ignorar  text[] := array['id', 'ultima_origem', 'criado_em', 'actualizado_em', 'identificada_em',
                               'website_verificado_em', 'enriquecida_em', 'qualificada_em', 'traducoes',
                               'analise', 'analisada_em', 'analise_modelo', 'analise_fonte', 'classificacao'];
    v_novo jsonb; v_antigo jsonb; v_chave text; v_origem text; v_empresa uuid; v_rotulo text;
begin
    -- Os campos são lidos através de jsonb (e não de NEW.campo): esta função serve três tabelas diferentes
    -- e "empresas" não tem o campo empresa_id, o que daria erro.
    if TG_OP = 'DELETE' then
        v_antigo := to_jsonb(OLD);
        insert into historico (entidade, entidade_id, empresa_id, rotulo, campo, valor_antigo, origem)
        values (v_entidade, (v_antigo ->> 'id')::uuid,
                case when TG_TABLE_NAME = 'empresas' then (v_antigo ->> 'id')::uuid else (v_antigo ->> 'empresa_id')::uuid end,
                v_antigo ->> 'nome', '(removido)', left(v_antigo ->> 'nome', 500), 'manual');
        return OLD;
    end if;

    v_novo    := to_jsonb(NEW);
    v_origem  := coalesce(v_novo ->> 'ultima_origem', 'manual');
    v_empresa := case when TG_TABLE_NAME = 'empresas' then (v_novo ->> 'id')::uuid else (v_novo ->> 'empresa_id')::uuid end;
    v_rotulo  := v_novo ->> 'nome';

    if TG_OP = 'INSERT' then
        insert into historico (entidade, entidade_id, empresa_id, rotulo, campo, valor_novo, origem)
        values (v_entidade, (v_novo ->> 'id')::uuid, v_empresa, v_rotulo, '(criado)', left(v_rotulo, 500), v_origem);
    else
        v_antigo := to_jsonb(OLD);
        for v_chave in select jsonb_object_keys(v_novo) loop
            continue when v_chave = any(v_ignorar);
            if (v_antigo -> v_chave) is distinct from (v_novo -> v_chave) then
                insert into historico (entidade, entidade_id, empresa_id, rotulo, campo, valor_antigo, valor_novo, origem)
                values (v_entidade, (v_novo ->> 'id')::uuid, v_empresa, v_rotulo, v_chave,
                        left(v_antigo ->> v_chave, 500), left(v_novo ->> v_chave, 500), v_origem);
            end if;
        end loop;
    end if;

    NEW.ultima_origem := null;      -- a próxima alteração sem origem indicada conta como "manual"
    return NEW;
end $$;

drop trigger if exists trg_historico_empresas on empresas;
create trigger trg_historico_empresas  before insert or update or delete on empresas  for each row execute function registar_historico();
drop trigger if exists trg_historico_decisores on decisores;
create trigger trg_historico_decisores before insert or update or delete on decisores for each row execute function registar_historico();
drop trigger if exists trg_historico_leads on leads;
create trigger trg_historico_leads     before insert or update or delete on leads     for each row execute function registar_historico();

-- 6. Progresso da recolha completa (recolher, identificar, enriquecer e validar numa só ação)
alter table radar_execucoes add column if not exists fase         text not null default 'recolha';
alter table radar_execucoes add column if not exists identificadas integer not null default 0;
alter table radar_execucoes add column if not exists enriquecidas  integer not null default 0;
alter table radar_execucoes add column if not exists qualificadas  integer not null default 0;

-- ------------------------------------------------------------
-- Traduções: os textos escritos pela IA (descrição, "sobre", motivo do tipo) ficam guardados em português
-- (original) e também em inglês e espanhol, para o Radar os mostrar no idioma escolhido.
-- Formato: { "_fonte": "<resumo do texto original>", "en": {descricao, sobre, tipo_motivo}, "es": {...} }
-- ------------------------------------------------------------
alter table empresas        add column if not exists traducoes jsonb;
alter table radar_execucoes add column if not exists traduzidas integer not null default 0;

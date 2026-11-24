-- ALPHA LEADS INTELLIGENCE: instalação completa da base de dados.
-- Supabase > SQL Editor > New query > colar tudo > Run. É seguro correr mais de uma vez.


-- ==================== schema.sql ====================
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


-- ==================== radar.sql ====================
-- ============================================================
-- ETAPA 4: RADAR DE OPORTUNIDADES
-- Corre este ficheiro uma vez no Supabase (SQL Editor).
-- É seguro correr mais de uma vez.
-- ============================================================

-- 1. Campos novos na tabela empresas
alter table empresas add column if not exists regiao            text
    check (regiao in ('europa', 'america_norte', 'america_latina'));
alter table empresas add column if not exists e_startup         boolean not null default false;
alter table empresas add column if not exists pilares           jsonb;     -- {inovacao, escalabilidade, incerteza, tecnologia} com justificação
alter table empresas add column if not exists pilares_cumpridos integer
    check (pilares_cumpridos between 0 and 4);
alter table empresas add column if not exists origem_titulo     text;      -- título da notícia/post onde apareceu
alter table empresas add column if not exists origem_url        text;      -- ligação para a notícia/post

-- 2. Evitar empresas duplicadas (mesmo nome, ignorando maiúsculas)
create unique index if not exists idx_empresas_nome_unico on empresas (lower(nome));

-- 3. Fontes do Radar (uma linha por conector)
alter table fontes add column if not exists conector text;                 -- identificador usado no código
create unique index if not exists idx_fontes_conector on fontes (conector) where conector is not null;

insert into fontes (nome, tipo, url, conector) values
    ('Google News',   'website',     'https://news.google.com',        'google_news'),
    ('Startup feeds', 'website',     null,                             'startup_feeds'),
    ('Hacker News',   'api',         'https://news.ycombinator.com',   'hacker_news'),
    ('Product Hunt',  'website',     'https://www.producthunt.com',    'product_hunt'),
    ('Reddit',        'website',     'https://www.reddit.com',         'reddit')
on conflict do nothing;

-- 3b. O Reddit foi desactivado: bloqueia pedidos automáticos (erro 429) e exige API oficial.
update fontes set activa = false where conector = 'reddit';

-- 4. Índices para os filtros do Radar
create index if not exists idx_empresas_regiao   on empresas (regiao);
create index if not exists idx_empresas_pais     on empresas (pais);
create index if not exists idx_empresas_startup  on empresas (e_startup);


-- ==================== radar-collection.sql ====================
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


-- ==================== enrichment.sql ====================
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


-- ==================== analysis.sql ====================
-- ============================================================
-- ETAPA 6: INTEGRAÇÃO DE INTELIGÊNCIA ARTIFICIAL
-- Análise profunda do lead, classificação automática e prioridade.
-- Corre este ficheiro no Supabase (SQL Editor), DEPOIS do enrichment.sql. É seguro correr mais de uma vez.
-- ============================================================

-- 1. Análise estruturada do lead (sinais de compra, necessidades, serviços recomendados, contacto, abordagem).
--    Os textos ficam em português, inglês e espanhol dentro do mesmo campo (ver lead-analysis.service.js).
alter table leads add column if not exists analise         jsonb;
alter table leads add column if not exists analisada_em    timestamptz;
alter table leads add column if not exists analise_modelo  text;        -- modelo que fez a análise (ex.: claude-sonnet-5-5)
alter table leads add column if not exists analise_fonte   text;        -- resumo dos dados analisados (se mudarem, a análise fica desatualizada)

-- 2. Classificação automática: Hot (70 ou mais), Warm (40 a 69) ou Cold (menos de 40).
--    É calculada pela própria base de dados a partir dos 4 critérios, por isso nunca fica incoerente com a pontuação.
alter table leads add column if not exists classificacao text generated always as (
    case
        when intencao_compra is null or adequacao_servicos is null
          or qualidade_evidencias is null or potencial_comercial is null then null
        when round(intencao_compra * 0.40 + adequacao_servicos * 0.30 + qualidade_evidencias * 0.20 + potencial_comercial * 0.10) >= 70 then 'hot'
        when round(intencao_compra * 0.40 + adequacao_servicos * 0.30 + qualidade_evidencias * 0.20 + potencial_comercial * 0.10) >= 40 then 'warm'
        else 'cold'
    end
) stored;
create index if not exists idx_leads_classificacao on leads (classificacao);

-- 3. Data da notícia que originou a empresa. Sem ela, a IA não consegue saber se um financiamento é recente,
--    e a atualidade da prioridade tinha de usar a data em que a notícia foi encontrada.
alter table empresas add column if not exists origem_data timestamptz;

-- 4. Progresso da recolha completa: leads analisados em profundidade
alter table radar_execucoes add column if not exists analisadas integer not null default 0;


-- ==================== pipeline.sql ====================
-- ============================================================
-- ETAPA 7: GESTÃO DE LEADS, PIPELINE E CENTRAL DE PROSPECÇÃO
-- Corre este ficheiro no Supabase (SQL Editor), depois dos anteriores. É seguro correr mais de uma vez.
-- ============================================================

-- 1. Registo de interações: cada contacto com uma empresa (enviado, recebido ou nota interna).
--    É a linha do tempo de cada lead.
create table if not exists interaccoes (
    id              uuid primary key default gen_random_uuid(),
    lead_id         uuid not null references leads(id) on delete cascade,
    empresa_id      uuid not null references empresas(id) on delete cascade,
    decisor_id      uuid references decisores(id) on delete set null,
    canal           text not null check (canal in ('email', 'linkedin', 'instagram', 'whatsapp', 'telefone', 'reuniao', 'nota')),
    direcao         text not null default 'saida' check (direcao in ('saida', 'entrada', 'interna')),
    tipo            text not null default 'primeiro_contacto' check (tipo in ('primeiro_contacto', 'follow_up', 'resposta', 'nota', 'outro')),
    destinatario    text,                                  -- o email, perfil ou número usado
    assunto         text,
    conteudo        text,
    metodo          text check (metodo in ('smtp', 'mailto', 'gmail', 'copiado', 'manual')),   -- como foi enviado
    idioma          text check (idioma in ('pt', 'en', 'es')),
    gerado_por_ia   boolean not null default false,
    modelo          text,                                  -- modelo que escreveu o rascunho
    resultado       text,                                  -- ex.: enviado, respondeu, sem_resposta, sem_interesse
    utilizador_id   uuid references utilizadores(id) on delete set null,
    ocorrida_em     timestamptz not null default now(),
    criado_em       timestamptz not null default now()
);
create index if not exists idx_interaccoes_lead    on interaccoes (lead_id, ocorrida_em desc);
create index if not exists idx_interaccoes_empresa on interaccoes (empresa_id, ocorrida_em desc);
create index if not exists idx_interaccoes_decisor on interaccoes (decisor_id);
create index if not exists idx_interaccoes_dia     on interaccoes (utilizador_id, canal, ocorrida_em desc);   -- para o limite diário

-- 2. Tarefas de acompanhamento (follow-ups, reuniões, propostas), com prazo e responsável.
create table if not exists tarefas (
    id              uuid primary key default gen_random_uuid(),
    lead_id         uuid not null references leads(id) on delete cascade,
    empresa_id      uuid not null references empresas(id) on delete cascade,
    titulo          text not null,
    tipo            text not null default 'follow_up' check (tipo in ('follow_up', 'reuniao', 'proposta', 'outro')),
    prazo           date not null,
    responsavel_id  uuid references utilizadores(id) on delete set null,
    origem          text not null default 'manual' check (origem in ('automatica', 'manual')),
    concluida_em    timestamptz,
    criada_por      uuid references utilizadores(id) on delete set null,
    criado_em       timestamptz not null default now()
);
create index if not exists idx_tarefas_lead    on tarefas (lead_id);
create index if not exists idx_tarefas_abertas on tarefas (prazo) where concluida_em is null;
create index if not exists idx_tarefas_resp    on tarefas (responsavel_id) where concluida_em is null;

-- 3. Segurança ao nível das linhas (igual às outras tabelas)
alter table interaccoes enable row level security;
alter table tarefas     enable row level security;
drop policy if exists "autenticados_interaccoes" on interaccoes;
create policy "autenticados_interaccoes" on interaccoes for all to authenticated using (true) with check (true);
drop policy if exists "autenticados_tarefas" on tarefas;
create policy "autenticados_tarefas" on tarefas for all to authenticated using (true) with check (true);


-- ==================== signature.sql ====================
-- ============================================================
-- ASSINATURA DE EMAIL POR UTILIZADOR
-- Corre este ficheiro no Supabase (SQL Editor). É seguro correr mais de uma vez.
-- Guarda a assinatura (HTML já limpo pelo servidor) de cada pessoa da equipa.
-- ============================================================
alter table utilizadores add column if not exists assinatura_html text;


-- ==================== settings.sql ====================
-- Etapa 9: definições da plataforma. Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- O idioma preferido passa a ficar na conta de cada utilizador (e não só no browser), para o mesmo idioma aparecer em qualquer computador.

alter table utilizadores add column if not exists idioma text check (idioma in ('pt', 'en', 'es'));


-- ==================== whatsapp.sql ====================
-- ============================================================
-- WHATSAPP (API OFICIAL DA META): guardar o envio e acompanhá-lo
-- Corre este ficheiro no Supabase (SQL Editor). É seguro correr mais de uma vez.
-- ============================================================

-- 1. O identificador que a Meta dá a cada mensagem (wamid...). Serve para ligar os avisos de "entregue" e "lida"
--    (e as respostas) à mensagem certa.
alter table interaccoes add column if not exists externo_id text;
create index if not exists idx_interaccoes_externo on interaccoes (externo_id) where externo_id is not null;

-- 2. O método "whatsapp_api" passa a ser válido (as mensagens enviadas pela API da Meta).
alter table interaccoes drop constraint if exists interaccoes_metodo_check;
alter table interaccoes add constraint interaccoes_metodo_check
    check (metodo in ('smtp', 'mailto', 'gmail', 'copiado', 'manual', 'whatsapp_api'));


-- ==================== monthly-analysis.sql ====================
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


-- ==================== tasks.sql ====================
-- Página «Tarefas»: o planeador das tarefas e o estado novo «Enviar proposta» dos leads.
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).

-- 1. Planeador: em que coluna do planeador está cada tarefa (a vista «Planeador» da página Tarefas)
alter table tarefas add column if not exists planeamento text not null default 'nao_planeado'
    check (planeamento in ('nao_planeado', 'em_curso', 'esta_semana', 'revisao'));
create index if not exists idx_tarefas_planeamento on tarefas (planeamento) where concluida_em is null;

-- 2. Estado novo dos leads: «enviar_proposta» (entre «reunião agendada» e «proposta enviada»).
--    Apaga a regra antiga do estado (seja qual for o nome que tenha) e cria a nova com todos os estados.
do $$
declare c text;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'leads'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%estado%' and pg_get_constraintdef(oid) like '%reuniao_agendada%'
    loop
        execute format('alter table leads drop constraint %I', c);
    end loop;
    alter table leads add constraint leads_estado_check check (estado in (
        'novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada',
        'proposta_aceite', 'proposta_recusada', 'negocio_fechado', 'nao_contactar', 'oportunidade_perdida'));
end $$;

-- 3. Hora da reunião (e de qualquer tarefa): opcional. A reunião agendada leva dia e hora.
alter table tarefas add column if not exists hora time;


-- ==================== google.sql ====================
-- Integração com o Google Calendar (Tarefas ↔ Google).
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- Uma única ligação para a empresa (quem liga é um administrador). O token de acesso nunca sai do servidor: fica CIFRADO nesta tabela, e a tabela
-- não tem políticas (RLS ligada e sem políticas = só o servidor, com a chave de serviço, lê e escreve; os utilizadores da aplicação não).

create table if not exists google_ligacao (
    id               int primary key default 1 check (id = 1),     -- só existe uma linha
    email            text,                                           -- a conta Google ligada
    calendario_id    text not null default 'primary',
    token_cifrado    text not null,                                  -- refresh token, cifrado (AES-256-GCM) pelo servidor
    ligado_por       uuid references utilizadores(id) on delete set null,
    ligado_em        timestamptz not null default now(),
    ultimo_erro      text,
    ultimo_erro_em   timestamptz
);
alter table google_ligacao enable row level security;

-- A tarefa guarda o id do evento criado no Google (para o atualizar ou apagar em vez de criar outro)
alter table tarefas add column if not exists google_event_id text;
create index if not exists idx_tarefas_google on tarefas (google_event_id) where google_event_id is not null;


-- ==================== proposals.sql ====================
-- Etapa 8: propostas comerciais geradas na página Documentos.
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- Uma proposta fica ligada a um lead e guarda tudo o que a Alpha Tech preencheu no formulário (serviços, preços, condições e textos)
-- em "dados" (JSON). O PDF é gerado a partir destes dados, por isso uma proposta guardada pode ser reaberta, editada e descarregada outra vez.
-- Só se criam propostas para leads em "reunião agendada" (a regra é verificada no servidor).

create table if not exists propostas (
    id            uuid primary key default gen_random_uuid(),
    numero        bigint generated always as identity,              -- n.º da proposta (NS-2026-0001...), sequencial
    lead_id       uuid not null references leads(id) on delete cascade,
    empresa_id    uuid not null references empresas(id) on delete cascade,
    titulo        text not null,
    idioma        text not null check (idioma in ('pt', 'en', 'es')),
    estado        text not null default 'rascunho' check (estado in ('rascunho', 'enviada')),
    dados         jsonb not null,
    criada_por    uuid references utilizadores(id) on delete set null,
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

create index if not exists idx_propostas_lead    on propostas (lead_id, criado_em desc);
create index if not exists idx_propostas_empresa on propostas (empresa_id);
create index if not exists idx_propostas_recente on propostas (criado_em desc);

-- Segurança ao nível das linhas (igual às outras tabelas)
alter table propostas enable row level security;
drop policy if exists "autenticados_propostas" on propostas;
create policy "autenticados_propostas" on propostas for all to authenticated using (true) with check (true);


-- ==================== deals.sql ====================
-- Página «Negócios»: as oportunidades de venda, com valor, etapa e previsão de fecho (quadro de arrastar, como num CRM).
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- Um negócio liga-se a uma empresa e, se se quiser, a um lead (para o lead acompanhar o resultado: ganho = «negócio fechado»,
-- perdido = «oportunidade perdida»). As etapas são as do quadro; «ganho» e «perdido» são o estado final do negócio.

create table if not exists negocios (
    id              uuid primary key default gen_random_uuid(),
    empresa_id      uuid not null references empresas(id) on delete cascade,
    lead_id         uuid references leads(id) on delete set null,
    titulo          text not null,
    valor           numeric(14, 2) not null default 0 check (valor >= 0),
    moeda           text not null default 'EUR' check (moeda in ('EUR', 'USD', 'GBP', 'BRL')),
    etapa           text not null default 'qualificado' check (etapa in ('qualificado', 'contactado', 'reuniao', 'proposta', 'negociacao')),
    estado          text not null default 'aberto' check (estado in ('aberto', 'ganho', 'perdido')),
    motivo_perda    text,
    responsavel_id  uuid references utilizadores(id) on delete set null,
    data_prevista   date,                                   -- quando se espera fechar
    criado_por      uuid references utilizadores(id) on delete set null,
    criado_em       timestamptz not null default now(),
    atualizado_em   timestamptz not null default now(),
    fechado_em      timestamptz
);

-- a proposta que originou (ou acompanha) o negócio. Sem chave estrangeira de propósito: o negócio não depende de a tabela das propostas existir.
-- (Se já tinhas corrido este ficheiro antes, corre-o outra vez: esta linha acrescenta a coluna.)
alter table negocios add column if not exists proposta_id uuid;

create index if not exists idx_negocios_estado   on negocios (estado, etapa);
create index if not exists idx_negocios_empresa  on negocios (empresa_id);
create index if not exists idx_negocios_resp     on negocios (responsavel_id) where estado = 'aberto';

-- Segurança ao nível das linhas (igual às outras tabelas)
alter table negocios enable row level security;
drop policy if exists "autenticados_negocios" on negocios;
create policy "autenticados_negocios" on negocios for all to authenticated using (true) with check (true);


-- ==================== clients.sql ====================
-- Página «Clientes»: contratos de prestação de serviços dos clientes ganhos.
-- Corre no SQL Editor do Supabase (uma vez; é seguro repetir).
--
-- Um contrato fica ligado a um lead (cliente = lead em «negócio fechado») e guarda tudo o que a Alpha Tech preencheu no formulário
-- (partes, serviços, preços, pagamento, duração e cláusulas) em "dados" (JSON). O PDF é gerado a partir destes dados.
-- O contrato assinado pelas duas partes (PDF ou imagem) fica num bucket privado do Supabase Storage chamado «contratos».

create table if not exists contratos (
    id               uuid primary key default gen_random_uuid(),
    numero           bigint generated always as identity,            -- n.º do contrato (NS-C-2026-0001...), sequencial
    lead_id          uuid not null references leads(id) on delete cascade,
    empresa_id       uuid not null references empresas(id) on delete cascade,
    proposta_id      uuid references propostas(id) on delete set null,
    titulo           text not null,
    idioma           text not null check (idioma in ('pt', 'en', 'es')),
    estado           text not null default 'rascunho' check (estado in ('rascunho', 'enviado', 'assinado')),
    dados            jsonb not null,
    inicio           date,                                           -- início da prestação de serviços
    fim_previsto     date,                                           -- previsão de fim (início + duração, ou a data indicada)
    enviado_em       timestamptz,
    assinado_em      date,                                           -- data em que as duas partes assinaram
    ficheiro_path    text,                                           -- contrato assinado (caminho no bucket «contratos»)
    ficheiro_nome    text,
    ficheiro_tipo    text,
    criada_por       uuid references utilizadores(id) on delete set null,
    criado_em        timestamptz not null default now(),
    atualizado_em    timestamptz not null default now()
);

create index if not exists idx_contratos_lead    on contratos (lead_id, criado_em desc);
create index if not exists idx_contratos_empresa on contratos (empresa_id);
create index if not exists idx_contratos_estado  on contratos (estado);

alter table contratos enable row level security;
drop policy if exists "autenticados_contratos" on contratos;
create policy "autenticados_contratos" on contratos for all to authenticated using (true) with check (true);

-- Bucket privado para os contratos assinados (só o servidor lê e escreve; os ficheiros abrem por ligação temporária)
insert into storage.buckets (id, name, public) values ('contratos', 'contratos', false) on conflict (id) do nothing;


-- ==================== security.sql ====================
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

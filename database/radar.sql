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

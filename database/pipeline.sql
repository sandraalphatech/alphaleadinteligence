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

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

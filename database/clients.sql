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

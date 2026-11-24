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

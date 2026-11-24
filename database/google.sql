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

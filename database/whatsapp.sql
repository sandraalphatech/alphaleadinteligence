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

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

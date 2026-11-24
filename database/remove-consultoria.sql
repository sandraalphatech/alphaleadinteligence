-- ============================================================
-- Retirar o serviço "consultoria" (não faz parte da oferta da Alpha Tech).
-- Corre este ficheiro uma vez no Supabase (SQL Editor). É seguro correr mais de uma vez.
-- ============================================================

-- 1. Os leads que tinham "consultoria" ficam sem serviço atribuído
--    (a pontuação e o resto da análise mantêm-se).
update leads set servico_interesse = null where servico_interesse = 'consultoria';

-- 2. A base de dados deixa de aceitar "consultoria"
alter table leads drop constraint if exists leads_servico_interesse_check;
alter table leads add constraint leads_servico_interesse_check
    check (servico_interesse in ('sistemas', 'website', 'marketing_digital',
                                 'redes_sociais', 'automacao_ia', 'design_grafico'));

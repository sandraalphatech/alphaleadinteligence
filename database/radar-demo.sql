-- ============================================================
-- DADOS DE DEMONSTRAÇÃO (opcional) para ver o Radar e o painel "Hoje" preenchidos.
-- Todas as empresas são FICTÍCIAS e terminam em "(demo)".
-- Para as apagar depois, corre apenas o bloco "LIMPEZA" no fim.
-- ============================================================

insert into empresas (nome, website, pais, regiao, idioma, sector, descricao, e_startup, pilares_cumpridos, origem_titulo, origem_url) values
 ('Lumina Pay (demo)',   null, 'PT', 'europa',         'pt', 'fintech',    'Plataforma de pagamentos instantâneos para PME, em fase de seed.',                true, 4, 'Lumina Pay fecha ronda seed de 2M€', 'https://example.com/lumina'),
 ('Nube Salud (demo)',   null, 'ES', 'europa',         'es', 'healthtech', 'Aplicação de telemedicina com triagem por inteligência artificial.',              true, 4, 'Nube Salud abre nova ronda',          'https://example.com/nube'),
 ('Andes Logistics (demo)', null, 'CO', 'america_latina', 'es', 'logistica', 'Software de rotas para última milha em cidades latino-americanas.',            true, 3, 'Andes Logistics expande-se para o Peru', 'https://example.com/andes'),
 ('Atlas Studio SaaS (demo)', null, 'US', 'america_norte', 'en', 'saas',   'Ferramenta de automação de marketing para equipas pequenas, recém-lançada.',     true, 3, 'Show HN: Atlas Studio',               'https://example.com/atlas'),
 ('Sabor da Vila (demo)', null, 'BR', 'america_latina', 'pt', 'foodtech', 'Restaurante tradicional que vai abrir uma segunda loja.',                          false, 1, 'Sabor da Vila abre nova loja',        'https://example.com/sabor'),
 ('Fjord Climate (demo)', null, 'NO', 'europa',         'en', 'climate',  'Startup de monitorização de emissões industriais com sensores próprios.',          true, 4, 'Fjord Climate lança produto',         'https://example.com/fjord')
on conflict do nothing;

-- Um lead por empresa (os critérios valem 0-100; a pontuação total é calculada sozinha)
insert into leads (empresa_id, servico_interesse, estado, intencao_compra, adequacao_servicos, qualidade_evidencias, potencial_comercial)
select e.id, v.servico, 'novo', v.i, v.a, v.q, v.p
from empresas e
join (values
    ('Lumina Pay (demo)',        'sistemas',          85, 80, 70, 75),
    ('Nube Salud (demo)',        'website',           70, 75, 65, 80),
    ('Andes Logistics (demo)',   'marketing_digital', 55, 60, 50, 70),
    ('Atlas Studio SaaS (demo)', 'redes_sociais',     45, 55, 60, 50),
    ('Sabor da Vila (demo)',     'design_grafico',    25, 30, 40, 20),
    ('Fjord Climate (demo)',     'marketing_digital', 65, 70, 75, 85)
) as v(nome, servico, i, a, q, p) on v.nome = e.nome
where not exists (select 1 from leads l where l.empresa_id = e.id);

-- ------------------------------------------------------------
-- LIMPEZA (corre só quando quiseres apagar os dados de demonstração)
-- ------------------------------------------------------------
-- delete from empresas where nome like '% (demo)';   -- os leads apagam-se em cascata

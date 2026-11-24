// Catálogo do Radar: define o âmbito geográfico e as listas dos filtros.
// Âmbito da Alpha Tech: só Portugal e Brasil (a equipa trabalha apenas em português).
// Os países guardam-se como códigos ISO de 2 letras (PT, ES, US...).
// O nome é traduzido no browser para o idioma escolhido (EN/PT/ES).

const REGIOES = {
    europa: ['PT'],
    america_latina: ['BR']
};

const IDIOMAS = ['pt'];

// Sectores de startups (a Claude classifica cada empresa num destes, na recolha)
const SECTORES = [
    'fintech', 'healthtech', 'edtech', 'saas', 'ecommerce', 'ai', 'cybersecurity', 'marketplace',
    'logistica', 'proptech', 'agritech', 'climate', 'mobilidade', 'foodtech', 'turismo',
    'entretenimento', 'deeptech',
    'clinica_saude', 'imobiliaria', 'educacao', 'servicos_locais', 'comercio', 'outro'
];

// Os mesmos serviços que a tabela leads aceita em servico_interesse
const SERVICOS = [
    'sistemas', 'website', 'marketing_digital', 'redes_sociais',
    'automacao_ia', 'design_grafico'
];

const regiaoDoPais = (pais) => Object.keys(REGIOES).find((r) => REGIOES[r].includes(pais)) || null;

module.exports = { REGIOES, IDIOMAS, SECTORES, SERVICOS, regiaoDoPais };

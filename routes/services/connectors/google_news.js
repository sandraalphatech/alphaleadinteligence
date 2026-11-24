// Conector: Google News (RSS de pesquisa)
// Uma pesquisa por país/idioma, à procura de notícias de financiamento e lançamento de startups.
// Também usamos "site:" para ler sites que bloqueiam o RSS directo (ex.: EU-Startups).

const { baixar, lerFeed } = require('./util');

const PESQUISAS = {
    en: 'startup (raises OR "seed round" OR "series A" OR launches OR funding)',
    pt: '(startup OR PME OR "pequena empresa" OR clínica OR imobiliária OR escola) ("ronda de investimento" OR "rodada de investimento" OR financiamento OR inaugura OR abre OR expansão OR lança OR lançamento OR "nova unidade")',
    es: 'startup ("ronda de financiación" OR "ronda de inversión" OR levanta OR lanza OR lanzamiento)'
};

// hl/gl/ceid definem o país e o idioma do Google News
const MERCADOS = [
    { gl: 'PT', hl: 'pt-PT', ceid: 'PT:pt-150', idioma: 'pt', regiao: 'europa' },
    { gl: 'BR', hl: 'pt-BR', ceid: 'BR:pt-419', idioma: 'pt', regiao: 'america_latina' }
];

// Sites de startups que bloqueiam o RSS directo, lidos através do Google News
const SITES = [];

const endereco = (q, m) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${m.hl}&gl=${m.gl}&ceid=${m.ceid}`;

async function buscar({ maxPorPesquisa = 25 } = {}) {
    const pedidos = [
        ...MERCADOS.map((m) => ({ url: endereco(PESQUISAS[m.idioma] + ' when:7d', m), m })),
        ...SITES.map((s) => ({ url: endereco(`site:${s.site} when:14d`, s), m: s }))
    ];

    const resultados = await Promise.allSettled(pedidos.map(async ({ url, m }) => {
        const xml = await (await baixar(url)).text();
        return lerFeed(xml).slice(0, maxPorPesquisa).map((i) => ({ ...i, idioma: m.idioma, regiao: m.regiao }));
    }));

    // Se uma pesquisa falhar, as outras continuam
    return resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

module.exports = { id: 'google_news', nome: 'Google News', buscar };

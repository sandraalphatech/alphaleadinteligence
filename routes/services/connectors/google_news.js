// Conector: Google News (RSS de pesquisa)
// Uma pesquisa por público-alvo e por país, à procura de notícias de empresas privadas que estão a crescer.
// Também usamos "site:" para ler sites que bloqueiam o RSS directo (ex.: EU-Startups).

const { baixar, lerFeed } = require('./util');

// Cada público tem a sua pesquisa: uma pesquisa única com "OU" entre todos misturava tudo
// (ex.: "escola" + "abre" trazia escolas de samba e escolas municipais inauguradas por prefeituras).
// Pesquisas curtas de propósito: se forem compridas, o Google News ignora o "when:7d" e devolve notícias antigas.
const PUBLICOS = {
    startups: 'startup (investimento OR capta OR aporte OR lança)',
    clinicas: 'clínica (inaugura OR "nova unidade" OR expansão)',
    imobiliarias: 'imobiliária (inaugura OR "nova unidade" OR expansão OR lança)',
    escolas: '(colégio OR "escola de idiomas" OR "escola privada") (inaugura OR "nova unidade" OR expansão)',
    pme: '(PME OR franquia OR "empresa familiar") (inaugura OR "nova loja" OR "nova unidade" OR expansão)'
};

// Notícias com estas palavras são quase sempre de entidades públicas ou festas (o resto é filtrado pela análise)
const EXCLUIR = '-prefeitura -carnaval -concurso';

// hl/gl/ceid definem o país e o idioma do Google News
const MERCADOS = [
    { gl: 'PT', hl: 'pt-PT', ceid: 'PT:pt-150', idioma: 'pt', regiao: 'europa' },
    { gl: 'BR', hl: 'pt-BR', ceid: 'BR:pt-419', idioma: 'pt', regiao: 'america_latina' }
];

// Sites de startups que bloqueiam o RSS directo, lidos através do Google News
const SITES = [];

const endereco = (q, m) =>
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${m.hl}&gl=${m.gl}&ceid=${m.ceid}`;

async function buscar({ maxPorPesquisa = 15 } = {}) {
    const pedidos = [
        ...MERCADOS.flatMap((m) => Object.entries(PUBLICOS).map(([publico, q]) => ({
            url: endereco(`when:7d ${q} ${EXCLUIR}`, m), m, origem: `Google News: ${publico}`
        }))),
        ...SITES.map((s) => ({ url: endereco(`site:${s.site} when:14d`, s), m: s }))
    ];

    const resultados = await Promise.allSettled(pedidos.map(async ({ url, m, origem }) => {
        const xml = await (await baixar(url)).text();
        return lerFeed(xml).slice(0, maxPorPesquisa).map((i) => ({ ...i, idioma: m.idioma, regiao: m.regiao, origem }));
    }));

    // Se uma pesquisa falhar, as outras continuam
    return resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

module.exports = { id: 'google_news', nome: 'Google News', buscar };

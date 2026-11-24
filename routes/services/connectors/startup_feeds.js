// Conector: feeds RSS de sites de notícias sobre startups.
// Cada feed leva uma dica de idioma e de região (a Claude confirma depois, na análise).
// Para juntar uma fonte nova, basta acrescentar uma linha à lista.

const { baixar, lerFeed } = require('./util');

const FEEDS = [
    // Europa
    { nome: 'Tech.eu',        url: 'https://tech.eu/feed',                         idioma: 'en', regiao: 'europa' },
    { nome: 'Sifted',         url: 'https://sifted.eu/feed',                       idioma: 'en', regiao: 'europa' },
    { nome: 'Shifter',        url: 'https://shifter.pt/feed/',                     idioma: 'pt', regiao: 'europa' },
    { nome: 'ECO Startups',   url: 'https://eco.sapo.pt/topico/startups/feed/',    idioma: 'pt', regiao: 'europa' },
    { nome: 'El Referente',   url: 'https://www.elreferente.es/feed/',             idioma: 'es', regiao: 'europa' },
    // América do Norte
    { nome: 'TechCrunch',     url: 'https://techcrunch.com/category/startups/feed/', idioma: 'en', regiao: 'america_norte' },
    { nome: 'BetaKit',        url: 'https://betakit.com/feed/',                    idioma: 'en', regiao: 'america_norte' },
    // América Latina
    { nome: 'Startups.com.br', url: 'https://startups.com.br/feed/',               idioma: 'pt', regiao: 'america_latina' },
    { nome: 'Startupi',       url: 'https://startupi.com.br/feed/',                idioma: 'pt', regiao: 'america_latina' },
    { nome: 'Contxto',        url: 'https://contxto.com/en/feed/',                 idioma: 'en', regiao: 'america_latina' },
    // Global (a região fica por decidir)
    { nome: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/',           idioma: 'en', regiao: null }
];

async function buscar({ maxPorFeed = 30 } = {}) {
    const resultados = await Promise.allSettled(FEEDS.map(async (f) => {
        const xml = await (await baixar(f.url)).text();
        return lerFeed(xml).slice(0, maxPorFeed).map((i) => ({ ...i, idioma: f.idioma, regiao: f.regiao, origem: f.nome }));
    }));
    return resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

module.exports = { id: 'startup_feeds', nome: 'Startup feeds', buscar, FEEDS };

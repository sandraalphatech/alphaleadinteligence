// Conector: Hacker News (API pública e gratuita do Algolia)
// Procura lançamentos ("Show HN") e notícias de startups recentes.

const { baixar, limparTexto, urlSeguro, data } = require('./util');

const PESQUISAS = ['"Show HN"', 'startup launch', 'startup raises seed', 'we are hiring startup'];

async function buscar({ dias = 14, maxPorPesquisa = 25 } = {}) {
    const desde = Math.floor(Date.now() / 1000) - dias * 86400;

    const resultados = await Promise.allSettled(PESQUISAS.map(async (q) => {
        const url = 'https://hn.algolia.com/api/v1/search_by_date?tags=story'
            + `&query=${encodeURIComponent(q)}&hitsPerPage=${maxPorPesquisa}&numericFilters=created_at_i>${desde}`;
        const json = await (await baixar(url)).json();

        return json.hits.map((h) => ({
            titulo: limparTexto(h.title, 250),
            resumo: limparTexto(h.story_text || ''),
            // histórias sem ligação externa (ex.: "Ask HN") apontam para a discussão no próprio HN
            url: urlSeguro(h.url) || `https://news.ycombinator.com/item?id=${h.objectID}`,
            publicado_em: data(h.created_at),
            idioma: 'en',
            regiao: null
        }));
    }));

    return resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

module.exports = { id: 'hacker_news', nome: 'Hacker News', buscar };

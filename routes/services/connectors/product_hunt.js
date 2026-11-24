// Conector: Product Hunt (feed público de produtos acabados de lançar)

const { baixar, lerFeed } = require('./util');

async function buscar({ max = 50 } = {}) {
    const xml = await (await baixar('https://www.producthunt.com/feed')).text();
    return lerFeed(xml).slice(0, max).map((i) => ({ ...i, idioma: 'en', regiao: null }));
}

module.exports = { id: 'product_hunt', nome: 'Product Hunt', buscar };

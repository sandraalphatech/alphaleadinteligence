// Registo dos conectores do Radar.
// Cada conector é um ficheiro com { id, nome, buscar() } e devolve itens neste formato:
//   { titulo, resumo, url, publicado_em, idioma, regiao }
// Para ligar uma fonte nova: criar o ficheiro e acrescentá-lo à lista abaixo.

const CONECTORES = [
    require('./google_news')
    // Desligados (fontes em inglês/globais; o alvo é só Portugal e Brasil): startup_feeds, hacker_news, product_hunt
];

const porId = Object.fromEntries(CONECTORES.map((c) => [c.id, c]));

// Corre os conectores pedidos (todos, se não indicar nenhum) ao mesmo tempo.
// Uma fonte que falhe não impede as outras: o erro fica registado no relatório.
async function recolher({ ids, dias = 14 } = {}) {
    const escolhidos = ids && ids.length ? ids.map((id) => porId[id]).filter(Boolean) : CONECTORES;

    const relatorio = await Promise.all(escolhidos.map(async (c) => {
        const inicio = Date.now();
        try {
            const itens = await c.buscar({ dias });
            return { conector: c.id, nome: c.nome, ok: true, itens, ms: Date.now() - inicio };
        } catch (erro) {
            return { conector: c.id, nome: c.nome, ok: false, itens: [], erro: erro.message, ms: Date.now() - inicio };
        }
    }));

    // Só notícias recentes e sem repetições (a mesma ligação pode vir de várias fontes)
    const limite = Date.now() - dias * 86400000;
    const vistos = new Set();
    for (const r of relatorio) {
        r.itens = r.itens
            .filter((i) => !i.publicado_em || new Date(i.publicado_em).getTime() >= limite)
            .filter((i) => {
                if (vistos.has(i.url)) return false;
                vistos.add(i.url);
                return true;
            })
            .map((i) => ({ ...i, conector: r.conector }));
    }
    return relatorio;
}

module.exports = { CONECTORES, recolher };

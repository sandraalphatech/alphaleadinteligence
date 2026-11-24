// Respeito pelo robots.txt: antes de ler uma página de um site, vemos se o site nos deixa.
// Um site que proíbe robôs numa página não é lido nessa página.

const { descarregar } = require('./website.service');

const AGENTE = 'alpharadar';                 // o nosso nome (o User-Agent começa por "AlphaRadar/1.0")
const cache = new Map();                       // origem -> regras (um robots.txt por site e por execução)

function lerRegras(texto) {
    const grupos = [];                         // { agentes: [...], regras: [{ permitir, caminho }] }
    let atual = null, aLerAgentes = false;

    for (const bruta of String(texto).split(/\r?\n/)) {
        const linha = bruta.replace(/#.*/, '').trim();
        const m = linha.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const campo = m[1].toLowerCase(), valor = m[2].trim();

        if (campo === 'user-agent') {
            if (!atual || !aLerAgentes) { atual = { agentes: [], regras: [] }; grupos.push(atual); }
            atual.agentes.push(valor.toLowerCase());
            aLerAgentes = true;
        } else if ((campo === 'allow' || campo === 'disallow') && atual) {
            aLerAgentes = false;
            if (valor) atual.regras.push({ permitir: campo === 'allow', caminho: valor });
        } else {
            aLerAgentes = false;
        }
    }
    // o grupo que nos nomeia tem prioridade sobre o "*"
    const nosso = grupos.filter((g) => g.agentes.includes(AGENTE));
    const geral = grupos.filter((g) => g.agentes.includes('*'));
    return (nosso.length ? nosso : geral).flatMap((g) => g.regras);
}

const paraRegex = (padrao) =>
    new RegExp('^' + padrao.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));

// Devolve true se podemos ler este endereço
async function podeLer(url) {
    let u;
    try { u = new URL(url); } catch { return false; }

    if (!cache.has(u.origin)) {
        try {
            const r = await descarregar(u.origin + '/robots.txt');
            cache.set(u.origin, r.status >= 200 && r.status < 300 ? lerRegras(r.html) : []);   // sem robots.txt: tudo permitido
        } catch { cache.set(u.origin, []); }
    }

    const caminho = u.pathname + u.search;
    let melhor = null;                                        // a regra mais específica (mais longa) decide; em empate, permite
    for (const regra of cache.get(u.origin)) {
        if (paraRegex(regra.caminho).test(caminho)) {
            if (!melhor || regra.caminho.length > melhor.caminho.length || (regra.caminho.length === melhor.caminho.length && regra.permitir)) melhor = regra;
        }
    }
    return melhor ? melhor.permitir : true;
}

module.exports = { podeLer, lerRegras, paraRegex };

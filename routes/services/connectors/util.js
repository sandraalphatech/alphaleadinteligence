// Ferramentas comuns a todos os conectores: descarregar um endereço e ler feeds RSS/Atom.

const { XMLParser } = require('fast-xml-parser');

// Identificamo-nos de forma honesta nos pedidos às fontes
const USER_AGENT = 'AlphaRadar/1.0 (lead research; respects robots and rate limits)';

async function baixar(url, { tempo = 15000 } = {}) {
    const { anfitriaoSeguro } = require('../website.service');      // carregado aqui para evitar dependência circular
    const sinal = AbortSignal.timeout(tempo);
    // Seguimos os redirecionamentos à mão (máx. 5) e recusamos qualquer salto para http(s) fora da rede pública
    for (let salto = 0; salto <= 5; salto++) {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol) || !(await anfitriaoSeguro(u.hostname))) throw new Error('endereço não permitido');
        const resposta = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, */*' },
            redirect: 'manual',
            signal: sinal
        });
        if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.get('location')) {
            url = new URL(resposta.headers.get('location'), url).toString();
            continue;
        }
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        return resposta;
    }
    throw new Error('demasiados redirecionamentos');
}

// Só aceitamos endereços http(s) (nunca "javascript:" e semelhantes)
const urlSeguro = (url) => (/^https?:\/\//i.test(url || '') ? String(url).trim() : null);

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

// Tira etiquetas HTML e entidades, e corta o texto num tamanho razoável
function limparTexto(html, max = 500) {
    const texto = String(html ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (e) => ENTIDADES[e])
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/\s+/g, ' ')
        .trim();
    return texto.length > max ? texto.slice(0, max - 1) + '…' : texto;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', processEntities: true });

// Valor de texto de um nó do XML (pode vir como texto, número ou objeto com atributos)
const texto = (no) => (no && typeof no === 'object' ? (no['#text'] ?? '') : (no ?? ''));

// Lê um feed RSS 2.0 ou Atom e devolve uma lista uniforme de { titulo, resumo, url, publicado_em }
function lerFeed(xml) {
    const doc = parser.parse(xml);
    const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

    const rss = lista(doc?.rss?.channel?.item).map((i) => ({
        titulo: limparTexto(texto(i.title), 250),
        resumo: limparTexto(texto(i.description) || texto(i['content:encoded'])),
        url: urlSeguro(texto(i.link) || texto(i.guid)),
        publicado_em: data(texto(i.pubDate) || texto(i['dc:date']))
    }));

    const atom = lista(doc?.feed?.entry).map((e) => {
        const ligacoes = lista(e.link);
        const principal = ligacoes.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || ligacoes[0];
        return {
            titulo: limparTexto(texto(e.title), 250),
            resumo: limparTexto(texto(e.summary) || texto(e.content)),
            url: urlSeguro(principal?.['@_href'] || texto(e.id)),
            publicado_em: data(texto(e.published) || texto(e.updated))
        };
    });

    return [...rss, ...atom].filter((i) => i.titulo && i.url);
}

// Converte uma data de texto para ISO (ou null se for inválida)
function data(valor) {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

module.exports = { baixar, lerFeed, limparTexto, urlSeguro, data, USER_AGENT };

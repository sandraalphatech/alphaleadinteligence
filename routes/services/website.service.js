// Verificação de websites: o endereço existe, é seguro abrir, é mesmo o site da empresa?
//
// SEGURANÇA: o endereço vem da internet (resultado de pesquisa), por isso nunca é de confiança.
// Antes de o abrir, o servidor confirma que não aponta para a rede interna (localhost, 192.168.x.x,
// 10.x.x.x, ...). Isto chama-se proteção contra SSRF. Cada redirecionamento é verificado de novo.

const dns = require('dns').promises;
const net = require('net');
const { USER_AGENT } = require('./connectors/util');

const MAX_BYTES = 300000;          // lemos no máximo 300 KB de cada página
const MAX_REDIRECCOES = 4;
const TEMPO_LIMITE = 10000;

// Sites que NUNCA são o site oficial de uma empresa (redes sociais, notícias, bases de dados de startups)
const NAO_OFICIAIS = [
    'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'youtube.com', 'tiktok.com',
    'crunchbase.com', 'pitchbook.com', 'tracxn.com', 'dealroom.co', 'cbinsights.com', 'wikipedia.org', 'wikidata.org',
    'github.com', 'medium.com', 'substack.com', 'reddit.com', 'news.ycombinator.com', 'producthunt.com',
    'google.com', 'apps.apple.com', 'play.google.com', 'bloomberg.com', 'reuters.com', 'techcrunch.com',
    'tech.eu', 'sifted.eu', 'eu-startups.com', 'betakit.com', 'contxto.com', 'startupi.com.br', 'startups.com.br'
];

// ---------- endereços ----------
function normalizarDominio(url) {
    try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) return null;
        return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch { return null; }
}

const ehNaoOficial = (dominio) => NAO_OFICIAIS.some((d) => dominio === d || dominio.endsWith('.' + d));

function ipPrivado(ip) {
    if (net.isIPv6(ip)) {
        const v = ip.toLowerCase();
        if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
        const mapeado = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        return mapeado ? ipPrivado(mapeado[1]) : false;
    }
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// O endereço só é seguro se for um nome (nunca um IP direto) que aponte apenas para IPs públicos.
// Devolve 'seguro', 'inseguro' (aponta para a rede interna ou é um IP direto) ou 'sem_dns' (o nome não existe).
async function classificarAnfitriao(hostname) {
    if (!hostname || net.isIP(hostname)) return 'inseguro';
    try {
        const enderecos = await dns.lookup(hostname, { all: true });
        return enderecos.length > 0 && enderecos.every((e) => !ipPrivado(e.address)) ? 'seguro' : 'inseguro';
    } catch { return 'sem_dns'; }
}
const anfitriaoSeguro = async (hostname) => (await classificarAnfitriao(hostname)) === 'seguro';

// ---------- descarregar a página (com limites) ----------
async function descarregar(urlInicial) {
    let url = urlInicial;
    for (let salto = 0; salto <= MAX_REDIRECCOES; salto++) {
        const u = new URL(url);
        const anfitriao = /^https?:$/.test(u.protocol) ? await classificarAnfitriao(u.hostname) : 'inseguro';
        if (anfitriao === 'inseguro') { const e = new Error('endereço não permitido'); e.codigo = 'INSEGURO'; throw e; }
        if (anfitriao === 'sem_dns') throw new Error('o domínio não existe');
        const resposta = await fetch(url, {
            redirect: 'manual',
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
            signal: AbortSignal.timeout(TEMPO_LIMITE)
        });

        if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.get('location')) {
            url = new URL(resposta.headers.get('location'), url).toString();
            continue;
        }

        // lê só o início da página
        let html = '';
        if (resposta.ok && resposta.body) {
            const leitor = resposta.body.getReader();
            const decoder = new TextDecoder('utf-8', { fatal: false });
            let lidos = 0;
            while (lidos < MAX_BYTES) {
                const { done, value } = await leitor.read();
                if (done) break;
                lidos += value.length;
                html += decoder.decode(value, { stream: true });
            }
            leitor.cancel().catch(() => {});
        }
        return { urlFinal: url, status: resposta.status, html };
    }
    throw new Error('demasiados redirecionamentos');
}

// ---------- ler a página ----------
const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soLetras = (t) => semAcentos(t).replace(/[^a-z0-9]+/g, ' ').trim();

const meta = (html, regex) => (html.match(regex)?.[1] || '').replace(/\s+/g, ' ').trim();

function lerPagina(html) {
    return {
        titulo: meta(html, /<title[^>]*>([\s\S]*?)<\/title>/i).slice(0, 200),
        descricao: (meta(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
            || meta(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)).slice(0, 400),
        nomeSite: meta(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i).slice(0, 100),
        texto: html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').slice(0, 30000)
    };
}

// Palavras que não distinguem uma empresa ("Disseqt AI" é só "Disseqt" para o site)
const GENERICAS = new Set(['inc', 'ltd', 'llc', 'gmbh', 'sa', 'sl', 'lda', 'ltda', 'corp', 'co', 'the', 'limited', 'plc', 'bv', 'ab', 'ag',
    'ai', 'app', 'labs', 'lab', 'tech', 'technologies', 'technology', 'software', 'systems', 'group', 'studio', 'studios', 'hq', 'io']);

// Palavras comuns demais para provar, sozinhas, que um domínio é da empresa ("Global Pay" não é global.com)
const COMUNS = new Set(['global', 'digital', 'smart', 'future', 'solutions', 'network', 'health', 'finance', 'capital', 'media',
    'cloud', 'secure', 'bright', 'online', 'mobile', 'energy', 'systems', 'service', 'services', 'company', 'business', 'agents']);

// O nome distintivo da empresa tem de aparecer no domínio, no título ou na descrição da página.
// (Não aceitamos o texto solto da página: nomes comuns apareceriam em qualquer site.)
function nomeCorresponde(nomeEmpresa, dominio, pagina) {
    const palavras = soLetras(nomeEmpresa).split(' ').filter(Boolean);
    const distintivas = palavras.filter((p) => !GENERICAS.has(p));
    const nome = (distintivas.length ? distintivas : palavras).join(' ');
    if (nome.replace(/ /g, '').length < 3) return false;

    const rotuloDominio = soLetras(dominio.split('.').slice(0, -1).join(' ')).replace(/ /g, '');
    if (rotuloDominio.includes(nome.replace(/ /g, ''))) return true;

    // "Incredible Agents" -> incredible.one: o domínio é exatamente uma das palavras do nome (só palavras longas e não comuns)
    if (distintivas.some((p) => p.length >= 6 && !COMUNS.has(p) && rotuloDominio === p)) return true;

    const texto = ' ' + soLetras([pagina.titulo, pagina.descricao, pagina.nomeSite].join(' ')) + ' ';
    return texto.includes(' ' + nome + ' ');
}

// Resultado: { estado, urlFinal, dominio, titulo, descricao, motivo }
//   verificado: abre e é a empresa | rejeitado: abre mas não parece ser a empresa (ou não é site oficial)
//   inacessivel: não conseguimos abrir (site fora do ar, ou bloqueia robôs) | por isso não se confirma
async function verificarWebsite(url, nomeEmpresa) {
    const dominioPedido = normalizarDominio(url);
    if (!dominioPedido) return { estado: 'rejeitado', motivo: 'endereço inválido' };
    if (ehNaoOficial(dominioPedido)) return { estado: 'rejeitado', dominio: dominioPedido, motivo: 'não é um site oficial (rede social, notícia ou base de dados)' };

    let pagina;
    try {
        pagina = await descarregar(url);
    } catch (erro) {
        if (erro.codigo === 'INSEGURO') return { estado: 'rejeitado', dominio: dominioPedido, motivo: 'endereço não permitido' };
        return { estado: 'inacessivel', dominio: dominioPedido, urlFinal: url, motivo: 'não foi possível abrir: ' + erro.message };
    }

    const dominio = normalizarDominio(pagina.urlFinal) || dominioPedido;
    if (ehNaoOficial(dominio)) return { estado: 'rejeitado', dominio, motivo: 'redireciona para um site não oficial' };
    if (pagina.status >= 400) return { estado: 'inacessivel', dominio, urlFinal: pagina.urlFinal, motivo: `o site respondeu ${pagina.status}` };

    const info = lerPagina(pagina.html);
    const corresponde = nomeCorresponde(nomeEmpresa, dominio, info);
    return {
        estado: corresponde ? 'verificado' : 'rejeitado',
        dominio, urlFinal: pagina.urlFinal, titulo: info.titulo, descricao: info.descricao,
        excerto: info.texto.replace(/\s+/g, ' ').trim().slice(0, 1500),     // início do texto da página (para a Claude confirmar)
        motivo: corresponde ? 'o nome da empresa aparece no site' : 'o nome da empresa não aparece no site'
    };
}

module.exports = { verificarWebsite, normalizarDominio, ipPrivado, anfitriaoSeguro, nomeCorresponde, lerPagina, soLetras, GENERICAS, descarregar };

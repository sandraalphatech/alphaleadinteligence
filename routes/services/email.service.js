// Envio de emails de prospecção. GRATUITO: usa o SMTP de uma conta de email que já tenham (por exemplo o Gmail,
// com uma "palavra-passe de aplicação"), sem serviços pagos de envio.
//
// Se o SMTP não estiver configurado no .env, o envio direto fica desligado e a plataforma continua a funcionar:
// a mensagem abre no programa de email ou no Gmail do utilizador, e ele envia de lá.
//
// Variáveis do .env (todas opcionais):
//   SMTP_USER     o endereço de onde se envia (ex.: nome@gmail.com)
//   SMTP_PASS     a palavra-passe de aplicação (NÃO a palavra-passe normal da conta)
//   SMTP_HOST     por defeito smtp.gmail.com
//   SMTP_PORT     por defeito 465
//   SMTP_NOME     nome mostrado a quem recebe (por defeito, o nome do utilizador)
//   SMTP_TESTE    "json": não envia nada, só monta a mensagem (para testes)

const nodemailer = require('nodemailer');
const sanitizeHtml = require('sanitize-html');

const configurado = () => !!(process.env.SMTP_TESTE === 'json' || (process.env.SMTP_USER && process.env.SMTP_PASS));

let transporte = null;
function obterTransporte() {
    if (!transporte) {
        transporte = process.env.SMTP_TESTE === 'json'
            ? nodemailer.createTransport({ jsonTransport: true })
            : nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT, 10) || 465,
                secure: (parseInt(process.env.SMTP_PORT, 10) || 465) === 465,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
    }
    return transporte;
}

// Limpa cabeçalhos: uma quebra de linha num assunto permitiria injetar cabeçalhos extra (injeção de cabeçalhos de email)
const QUEBRAS = new RegExp('[\r\n' + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + ']+', 'g');
const umaLinha = (t) => String(t || '').replace(QUEBRAS, ' ').trim();
// ---------- formatação do texto ----------
// O editor da plataforma devolve HTML escrito por um browser, ou seja, não é de confiança. Antes de qualquer envio, o HTML
// passa por uma lista branca: só ficam parágrafos, negrito, itálico, sublinhado, listas e ligações http(s) ou mailto.
// Scripts, estilos, imagens, atributos de eventos (onclick...) e ligações "javascript:" desaparecem.
const TAGS_PERMITIDAS = ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a'];

// Imagens (só na assinatura, e só quando se pede): apenas PNG, JPEG ou GIF EMBUTIDAS em base64 (nunca endereços externos, que
// serviriam para seguir quem abre o email), com tamanho limitado. SVG fica de fora (pode levar scripts).
const IMAGEM_EMBUTIDA = /^data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;
const MAX_IMAGEM = 200000;          // caracteres base64 por imagem (cerca de 150 KB)
const MAX_IMAGENS = 3;
const MAX_HTML = 30000, MAX_HTML_COM_IMAGENS = 700000;

function sanitizar(html, { imagens = false } = {}) {
    let n = 0;
    return sanitizeHtml(String(html || '').slice(0, imagens ? MAX_HTML_COM_IMAGENS : MAX_HTML), {
        // na assinatura (imagens: true) também se permite uma tabela simples, que é como se põe a imagem ao lado do texto
        allowedTags: imagens ? [...TAGS_PERMITIDAS, 'img', 'table', 'tbody', 'tr', 'td'] : TAGS_PERMITIDAS,
        allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt', 'width', 'height'], table: ['border', 'cellpadding', 'cellspacing'], td: ['valign'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: { img: ['data'] },
        allowProtocolRelative: false,
        nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
        transformTags: {                                                    // o browser usa <b>, <i> e <div>: normalizamos
            b: 'strong', i: 'em', div: 'p',
            a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
            table: () => ({ tagName: 'table', attribs: { border: '0', cellpadding: '6', cellspacing: '0' } }),       // valores fixos: nada vindo do browser
            td: (tag, a) => ({ tagName: 'td', attribs: { valign: ['top', 'middle', 'bottom'].includes(a.valign) ? a.valign : 'middle' } }),
            img: (tag, a) => {
                const src = String(a.src || '');
                const dim = (v) => { const x = parseInt(v, 10); return x > 0 && x <= 800 ? String(x) : undefined; };
                const bom = IMAGEM_EMBUTIDA.test(src) && src.length <= MAX_IMAGEM && ++n <= MAX_IMAGENS;
                return { tagName: 'img', attribs: bom ? { src, alt: String(a.alt || '').slice(0, 100), ...(dim(a.width) && { width: dim(a.width) }), ...(dim(a.height) && { height: dim(a.height) }) } : {} };
            }
        },
        exclusiveFilter: (f) => f.tag === 'img' && !f.attribs.src                     // imagem inválida, externa ou a mais: desaparece
    }).trim();
}

// Passa as imagens embutidas para anexos "inline" (cid:), que é como o Gmail e o Outlook as mostram bem
function imagensParaAnexos(html) {
    const anexos = [];
    const novo = html.replace(/<img\b[^>]*?\ssrc="(data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+/=]+)"[^>]*>/gi, (tag, src, tipo) => {
        const cid = `assinatura${anexos.length + 1}@alphatech`;
        const ext = tipo.toLowerCase().replace('jpeg', 'jpg');
        anexos.push({ filename: `imagem${anexos.length + 1}.${ext}`, content: Buffer.from(src.slice(src.indexOf(',') + 1), 'base64'), cid, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, contentDisposition: 'inline' });
        return tag.replace(src, `cid:${cid}`);
    });
    return { html: novo, anexos };
}

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// Versão em texto simples de um HTML já limpo (vai junto no email, para clientes e filtros que não usam HTML)
function htmlParaTexto(html) {
    return String(html || '')
        .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, texto) => {
            const t = texto.replace(/<[^>]*>/g, '');
            return !href || t.includes(href.replace(/^mailto:/i, '')) ? t : `${t} (${href})`;
        })
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(td|tr)>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n').replace(/<\/(ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e])
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const envolver = (html) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">${html}</div>`;

// Monta a mensagem (função pura, testável sem enviar nada).
// Com "html": envia HTML limpo + a versão em texto simples (multipart). Sem "html": só texto simples.
function montarMensagem({ para, assunto, corpo, html, nomeRemetente, respostaPara }) {
    const remetente = process.env.SMTP_USER || 'teste@exemplo.com';
    const nome = umaLinha(process.env.SMTP_NOME || nomeRemetente || 'Alpha Tech Solutions').replace(/["<>]/g, '');
    const limpo = html ? sanitizar(html, { imagens: true }) : '';
    const { html: comCid, anexos } = limpo ? imagensParaAnexos(limpo) : { html: '', anexos: [] };
    return {
        from: `"${nome}" <${remetente}>`,
        to: umaLinha(para),
        subject: umaLinha(assunto).slice(0, 150),
        text: limpo ? htmlParaTexto(limpo) : String(corpo || ''),
        html: limpo ? envolver(comCid) : undefined,
        attachments: anexos.length ? anexos : undefined,
        replyTo: respostaPara ? umaLinha(respostaPara) : undefined,
        headers: { 'List-Unsubscribe': `<mailto:${remetente}?subject=remove>` }    // pedido de remoção em um clique
    };
}

async function enviar(dados) {
    if (!configurado()) throw new Error('O envio direto não está configurado (faltam SMTP_USER e SMTP_PASS no .env).');
    const mensagem = montarMensagem(dados);
    const r = await obterTransporte().sendMail(mensagem);
    return { id: r.messageId || null, mensagem };
}

module.exports = { configurado, montarMensagem, enviar, umaLinha, sanitizar, htmlParaTexto, imagensParaAnexos };

// Respostas por email: lê a caixa do Gmail de onde se envia (IMAP) e mostra no painel quando um cliente responde.
//
// COMO FUNCIONA
//  - De 3 em 3 minutos (e quando se pede), vê as mensagens recebidas nos últimos dias. Só se interessa por mensagens de quem a Alpha Tech
//    JÁ contactou por email (o endereço a que se enviou, ou uma resposta a um email enviado por aqui). Tudo o resto (pessoal, newsletters,
//    avisos) não se abre, não se guarda e não se regista.
//  - Uma resposta fica registada na ficha do lead, o lead passa a «Respondeu» e os follow-ups automáticos deixam de ser precisos
//    (aparece em «Hoje → Respostas à espera»). Respostas automáticas («fora do escritório») e avisos de falha de entrega ignoram-se.
//  - Um pedido curto para parar («remover», «unsubscribe», «não quero receber»...) passa a empresa a «Não contactar».
//  - Respostas ENVIADAS PELO GMAIL (fora do painel): lê-se também a pasta «Enviados». Uma mensagem enviada a um cliente que já respondeu fica registada
//    como resposta nossa (tipo «resposta», saída): a resposta deixa de contar como «por responder» e a tarefa «Dar retorno» fecha. Não muda o estado do lead.
//    Só conta o que for posterior à resposta do cliente, e nunca duplica o que a plataforma enviou (reconhece-se pelo id ou pela hora).
//  - Nunca se altera a caixa: não se marca como lida, não se move, não se apaga. A mesma mensagem nunca se regista duas vezes.
// Usa o SMTP_USER e o SMTP_PASS do .env (a palavra-passe de aplicação do Gmail serve para ler também). Opcionais: IMAP_HOST, IMAP_PORT,
// EMAIL_RESPOSTAS=0 (desliga), EMAIL_RESPOSTAS_MINUTOS (por defeito 3), EMAIL_RESPOSTAS_DIAS (por defeito 14).
const { supabaseAdmin } = require('./supabase.service');

const DIA = 86400000;
const MAX_TEXTO = 4000;
const MAX_ORIGEM = 300000;                     // bytes lidos de cada mensagem
const MAX_MENSAGENS = 400;                     // por verificação
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });

// ---------- configuração ----------
const cfg = () => {
    const e = process.env;
    const gmail = !e.SMTP_HOST || /gmail\.com$/i.test(e.SMTP_HOST);
    return { user: e.SMTP_USER || '', pass: e.SMTP_PASS || '', host: e.IMAP_HOST || (gmail ? 'imap.gmail.com' : ''), port: parseInt(e.IMAP_PORT, 10) || 993,
        minutos: Math.min(Math.max(parseInt(e.EMAIL_RESPOSTAS_MINUTOS, 10) || 3, 1), 60), dias: Math.min(Math.max(parseInt(e.EMAIL_RESPOSTAS_DIAS, 10) || 14, 1), 60) };
};
const configurado = () => { const c = cfg(); return !!(c.user && c.pass && c.host) && process.env.EMAIL_RESPOSTAS !== '0' && process.env.SMTP_TESTE !== 'json'; };

// ---------- funções puras (testáveis sem caixa de email) ----------
const minusculas = (v) => String(v || '').trim().toLowerCase();
const endereco = (v) => { const m = /<([^<>\s]+@[^<>\s]+)>/.exec(String(v || '')) || /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(String(v || '')); return m ? minusculas(m[1]) : ''; };
const ids = (v) => (String(v || '').match(/<[^<>\s]+>/g) || []).map(minusculas);

// Respostas automáticas e avisos de falha de entrega: não são o cliente a responder
const ASSUNTO_AUTO = /^\s*(re:\s*)?(automatic reply|auto(-|\s)?reply|autoreply|out of office|resposta autom[aá]tica|fora do escrit[oó]rio|ausente|respuesta autom[aá]tica|fuera de la oficina|undeliverable|delivery status|returned mail|mail delivery|failure notice|falha na entrega|no se pudo entregar)/i;
const REMETENTE_AUTO = /^(mailer-daemon|postmaster|no-?reply|noreply|do-?not-?reply|notifications?|bounce)/i;
function ehAutomatica({ cabecalhos = {}, de = '', assunto = '' }) {
    const h = (k) => minusculas(cabecalhos[k]);
    if (h('auto-submitted') && h('auto-submitted') !== 'no') return true;
    if (/auto_reply|auto-reply|bulk|junk|list/.test(h('precedence'))) return true;
    if (h('x-autoreply') || h('x-autorespond') || h('x-auto-response-suppress')) return true;
    if (REMETENTE_AUTO.test(String(de).split('@')[0])) return true;
    return ASSUNTO_AUTO.test(String(assunto));
}

// Só o que o cliente escreveu: corta a citação do email anterior e as linhas com «>»
const CORTE = /^\s*(em .{5,120}escreveu:?|on .{5,120}wrote:?|el .{5,120}escribi[oó]:?|-{2,}\s*(original message|mensagem original|mensaje original)|_{5,}|de:\s.+|from:\s.+|enviado:\s.+|sent:\s.+)\s*$/i;
function limparTexto(texto) {
    const linhas = String(texto || '').replace(/\r/g, '').split('\n');
    const fim = linhas.findIndex((l, i) => i > 0 && CORTE.test(l));
    return (fim >= 0 ? linhas.slice(0, fim) : linhas).filter((l) => !/^\s*>/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXTO);
}

// Pedido para parar: curto, e com a palavra no início ou uma frase inequívoca. «Podemos parar e falar amanhã?» não conta.
const PARAR_INICIO = /^\W*(remover|remove|eliminar|unsubscribe|parar|stop|baja|cancelar|sair)\b/i;
const PARAR_FRASE = /((por\s+favor|please|favor)\s*[,:]?\s*(parar|stop|remover?|cancelar|eliminar)|n[aã]o\s+(quero|desejo|pretendo)\s+(mais\s+)?(receber|ser\s+contactad)|do\s+not\s+(contact|email|write)|don'?t\s+(contact|email|write)|no\s+(quiero|deseo)\s+recibir|n[aã]o\s+nos\s+contacte|please\s+remove\s+me|remova-?me|elim[ií]nenme)/i;
const pedeParar = (texto) => { const t = String(texto || '').trim(); const palavras = t.split(/\s+/).filter(Boolean).length; return palavras > 0 && palavras <= 40 && (PARAR_INICIO.test(t) || PARAR_FRASE.test(t)) && !(PARAR_INICIO.test(t) && palavras > 8 && !PARAR_FRASE.test(t)); };

// Índices a partir dos emails que enviámos: id da mensagem → lead, e endereço → lead
function montarIndices(enviados) {
    const porId = new Map(), porEndereco = new Map();
    for (const e of enviados) {
        const alvo = { lead_id: e.lead_id, empresa_id: e.empresa_id };
        if (e.externo_id) porId.set(minusculas(e.externo_id), alvo);
        const a = endereco(e.destinatario);
        if (a && !porEndereco.has(a)) porEndereco.set(a, alvo);
    }
    return { porId, porEndereco };
}
// A que lead pertence esta mensagem? Primeiro pela mensagem a que responde, depois pelo endereço de quem escreve. null = não é de ninguém que contactámos.
function ligarAoLead(m, { porId, porEndereco }) {
    for (const ref of [...ids(m.inReplyTo), ...ids(m.references)]) if (porId.has(ref)) return porId.get(ref);
    return porEndereco.get(endereco(m.de)) || null;
}

// ---------- leitura da caixa (IMAP, só leitura) ----------
async function lerCaixa({ dias, enviadosIds, enderecos }) {
    const { ImapFlow } = require('imapflow'); const { simpleParser } = require('mailparser');
    const c = cfg();
    const cliente = new ImapFlow({ host: c.host, port: c.port, secure: true, auth: { user: c.user, pass: c.pass }, logger: false, socketTimeout: 60000 });
    cliente.on('error', () => { /* a ligação é fechada no fim; os erros ficam no resultado */ });
    await cliente.connect();
    const mensagens = [], enviadas = [];
    const proprio = minusculas(c.user);
    const cabecalhosDe = (msg) => { const cab = {}; String(msg.headers || '').replace(/\r/g, '').replace(/\n[ \t]+/g, ' ').split('\n').forEach((l) => { const i = l.indexOf(':'); if (i > 0) cab[l.slice(0, i).toLowerCase()] = l.slice(i + 1).trim(); }); return cab; };
    const texto = async (uid) => { const { content } = await cliente.download(uid, undefined, { uid: true, maxBytes: MAX_ORIGEM }); const bufs = []; for await (const parte of content) bufs.push(parte); const p = await simpleParser(Buffer.concat(bufs)); return p.text || String(p.html || '').replace(/<[^>]+>/g, ' '); };
    const lock = await cliente.getMailboxLock('INBOX', { readOnly: true });
    try {
        const uids = (await cliente.search({ since: new Date(Date.now() - dias * DIA) }, { uid: true })) || [];
        const recentes = uids.slice(-MAX_MENSAGENS * 3);
        // 1.ª passagem (só cabeçalhos): quem escreve, a que responde, e se é automática
        const candidatos = [];
        for await (const msg of cliente.fetch(recentes, { uid: true, envelope: true, headers: ['message-id', 'in-reply-to', 'references', 'auto-submitted', 'precedence', 'x-autoreply', 'x-autorespond', 'x-auto-response-suppress'] }, { uid: true })) {
            const de = endereco(msg.envelope?.from?.[0]?.address || '');
            if (!de || de === proprio) continue;
            const cab = cabecalhosDe(msg);
            const refs = [...ids(cab['in-reply-to']), ...ids(cab.references)];
            if (!enderecos.has(de) && !refs.some((r) => enviadosIds.has(r))) continue;                 // não é de quem contactámos: nem se abre
            candidatos.push({ uid: msg.uid, de, assunto: msg.envelope?.subject || '', data: msg.envelope?.date || new Date(), messageId: cab['message-id'] || '', inReplyTo: cab['in-reply-to'] || '', references: cab.references || '', cabecalhos: cab });
            if (candidatos.length >= MAX_MENSAGENS) break;
        }
        // 2.ª passagem: só o texto dos candidatos
        for (const cand of candidatos) {
            if (ehAutomatica(cand)) continue;
            try {
                mensagens.push({ ...cand, texto: await texto(cand.uid) });
            } catch { /* mensagem ilegível: fica para a próxima */ }
        }
    } finally { lock.release(); }
    // pasta de enviados (a que o Gmail marca como «Sent», seja qual for o idioma): só mensagens enviadas a quem já contactámos
    try {
        const pasta = (await cliente.list()).find((p) => p.specialUse === '\\Sent');
        if (pasta) {
            const lockEnv = await cliente.getMailboxLock(pasta.path, { readOnly: true });
            try {
                const uids = (await cliente.search({ since: new Date(Date.now() - dias * DIA) }, { uid: true })) || [];
                const cands = [];
                for await (const msg of cliente.fetch(uids.slice(-MAX_MENSAGENS * 3), { uid: true, envelope: true, headers: ['message-id', 'in-reply-to', 'references'] }, { uid: true })) {
                    const para = [...(msg.envelope?.to || []), ...(msg.envelope?.cc || [])].map((x) => endereco(x.address || '')).filter((a) => a && a !== proprio);
                    if (!para.some((a) => enderecos.has(a))) continue;
                    const cab = cabecalhosDe(msg);
                    cands.push({ uid: msg.uid, para, assunto: msg.envelope?.subject || '', data: msg.envelope?.date || new Date(), messageId: cab['message-id'] || '' });
                    if (cands.length >= MAX_MENSAGENS) break;
                }
                for (const cand of cands) { try { enviadas.push({ ...cand, texto: await texto(cand.uid) }); } catch { /* ilegível: fica para a próxima */ } }
            } finally { lockEnv.release(); }
        }
    } catch { /* sem pasta de enviados acessível: só se lêem as respostas dos clientes */ }
    await cliente.logout().catch(() => {});
    return { recebidas: mensagens, enviadas };
}

// ---------- verificar ----------
let aCorrer = false;
let ultimo = { quando: null, lidas: 0, registadas: 0, paradas: 0, erro: null };

async function carregarEnviados() {
    const desde = new Date(Date.now() - 365 * DIA).toISOString();
    let { data, error } = await supabaseAdmin.from('interaccoes').select('lead_id, empresa_id, destinatario, externo_id, ocorrida_em').eq('canal', 'email').eq('direcao', 'saida').gte('ocorrida_em', desde).limit(3000);
    if (error && /externo_id/.test(error.message)) ({ data, error } = await supabaseAdmin.from('interaccoes').select('lead_id, empresa_id, destinatario, ocorrida_em').eq('canal', 'email').eq('direcao', 'saida').gte('ocorrida_em', desde).limit(3000));
    if (error) throw new Error(error.message);
    return data || [];
}

// Regista uma resposta: interação, lead «Respondeu», follow-ups fechados; ou «Não contactar» se pediu para parar
async function registarResposta(m, alvo) {
    const texto = limparTexto(m.texto);
    const parar = pedeParar(texto);
    const ocorrida = new Date(m.data); const quando = Number.isNaN(ocorrida.getTime()) ? new Date() : ocorrida;
    const { error } = await supabaseAdmin.from('interaccoes').insert({
        lead_id: alvo.lead_id, empresa_id: alvo.empresa_id, canal: 'email', direcao: 'entrada', tipo: 'resposta', destinatario: m.de, assunto: String(m.assunto || '').replace(/\s+/g, ' ').trim().slice(0, 150) || null,
        conteudo: texto || '(mensagem sem texto)', metodo: 'gmail', externo_id: minusculas(m.messageId), resultado: parar ? 'pediu_parar' : 'recebida', utilizador_id: null, ocorrida_em: quando.toISOString()
    });
    if (error) throw new Error(error.message);
    const agora = new Date().toISOString();
    const { data: lead } = await supabaseAdmin.from('leads').select('id, estado, empresa_id').eq('id', alvo.lead_id).maybeSingle();
    const estadoAntes = lead?.estado;
    if (parar) {
        await supabaseAdmin.from('empresas').update({ nao_contactar: true, ultima_origem: 'email' }).eq('id', alvo.empresa_id);
        await supabaseAdmin.from('leads').update({ estado: 'nao_contactar', ultima_origem: 'email' }).eq('id', alvo.lead_id);
        await supabaseAdmin.from('tarefas').update({ concluida_em: agora }).eq('lead_id', alvo.lead_id).is('concluida_em', null);
        return 'parar';
    }
    const passa = ['novo', 'analisado', 'contactado'].includes(estadoAntes);
    if (passa) await supabaseAdmin.from('leads').update({ estado: 'respondeu', ultima_origem: 'email' }).eq('id', alvo.lead_id);
    await supabaseAdmin.from('tarefas').update({ concluida_em: agora }).eq('lead_id', alvo.lead_id).eq('tipo', 'follow_up').eq('origem', 'automatica').is('concluida_em', null);
    if (passa) { try { await require('./task-automation.service').aoMudarEstado({ id: alvo.lead_id, empresa_id: alvo.empresa_id }, 'respondeu', {}); } catch (e) { console.error('Tarefas automáticas:', String(e.message).slice(0, 200)); } }
    return 'resposta';
}

// A resposta que se enviou pelo Gmail a um cliente: fica registada (saída, tipo «resposta») e a tarefa «Dar retorno» fecha. O estado do lead não muda.
async function registarEnviada(m, alvo, destinatario) {
    const ocorrida = new Date(m.data); const quando = Number.isNaN(ocorrida.getTime()) ? new Date() : ocorrida;
    const { error } = await supabaseAdmin.from('interaccoes').insert({
        lead_id: alvo.lead_id, empresa_id: alvo.empresa_id, canal: 'email', direcao: 'saida', tipo: 'resposta', destinatario, assunto: String(m.assunto || '').replace(/\s+/g, ' ').trim().slice(0, 150) || null,
        conteudo: limparTexto(m.texto) || '(mensagem sem texto)', metodo: 'gmail', externo_id: minusculas(m.messageId), resultado: 'enviado', utilizador_id: null, ocorrida_em: quando.toISOString()
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from('tarefas').update({ concluida_em: new Date().toISOString() }).eq('lead_id', alvo.lead_id).eq('origem', 'automatica').eq('tipo', 'outro').is('concluida_em', null);
}

// Quando respondeu cada lead pela 1.ª vez (por email): uma resposta nossa só conta se for DEPOIS desta
async function primeirasRespostas() {
    const { data, error } = await supabaseAdmin.from('interaccoes').select('lead_id, ocorrida_em').eq('canal', 'email').eq('direcao', 'entrada').gte('ocorrida_em', new Date(Date.now() - 365 * DIA).toISOString()).limit(3000);
    if (error) throw new Error(error.message);
    const mapa = new Map();
    for (const i of data || []) { const ms = new Date(i.ocorrida_em).getTime(); if (!mapa.has(i.lead_id) || ms < mapa.get(i.lead_id)) mapa.set(i.lead_id, ms); }
    return mapa;
}

// leitor (opcional, para testes): async ({ dias, enviadosIds, enderecos }) => mensagens (ou { recebidas, enviadas })
async function verificar({ leitor } = {}) {
    if (aCorrer) return { ...ultimo, ocupado: true };
    if (!leitor && !configurado()) throw erro('CONFIG', 'A leitura das respostas por email não está configurada.');
    aCorrer = true;
    const r = { quando: new Date().toISOString(), lidas: 0, registadas: 0, paradas: 0, enviadas: 0, erro: null };
    try {
        const enviados = await carregarEnviados();
        const indices = montarIndices(enviados);
        const lido = await (leitor || lerCaixa)({ dias: cfg().dias, enviadosIds: new Set(indices.porId.keys()), enderecos: new Set(indices.porEndereco.keys()) });
        const mensagens = Array.isArray(lido) ? lido : (lido.recebidas || []), enviadas = Array.isArray(lido) ? [] : (lido.enviadas || []);
        r.lidas = mensagens.length;
        const idsMensagens = [...mensagens, ...enviadas].map((m) => minusculas(m.messageId)).filter(Boolean);
        const { data: jaRegistadas } = idsMensagens.length ? await supabaseAdmin.from('interaccoes').select('externo_id').in('externo_id', idsMensagens) : { data: [] };
        const feitas = new Set((jaRegistadas || []).map((x) => minusculas(x.externo_id)));
        for (const m of mensagens.sort((a, b) => new Date(a.data) - new Date(b.data))) {
            const id = minusculas(m.messageId);
            if (!id || feitas.has(id) || ehAutomatica(m)) continue;                          // sem identificador não há como evitar duplicados
            const alvo = ligarAoLead(m, indices); if (!alvo) continue;
            try { const acao = await registarResposta(m, alvo); feitas.add(id); if (acao === 'parar') r.paradas++; else r.registadas++; }
            catch (e) { console.error('Resposta por email:', String(e.message).slice(0, 200)); }
        }
        // respostas enviadas pelo Gmail (fora do painel), a quem já respondeu
        if (enviadas.length) {
            const primeiras = await primeirasRespostas();
            for (const m of enviadas.sort((a, b) => new Date(a.data) - new Date(b.data))) {
                const id = minusculas(m.messageId);
                if (!id || feitas.has(id)) continue;
                const destinatario = (m.para || []).find((a) => indices.porEndereco.has(a)); if (!destinatario) continue;
                const alvo = indices.porEndereco.get(destinatario);
                const primeira = primeiras.get(alvo.lead_id), quando = new Date(m.data).getTime();
                if (!primeira || Number.isNaN(quando) || quando < primeira) continue;                        // só conta o que for depois de o cliente responder
                if (enviados.some((e) => e.lead_id === alvo.lead_id && endereco(e.destinatario) === destinatario && Math.abs(new Date(e.ocorrida_em).getTime() - quando) < 5 * 60000)) continue;   // já registado pela plataforma
                try { await registarEnviada(m, alvo, destinatario); feitas.add(id); r.enviadas++; }
                catch (e) { console.error('Resposta enviada pelo Gmail:', String(e.message).slice(0, 200)); }
            }
        }
    } catch (e) {
        r.erro = e.codigo === 'CONFIG' ? e.message : /auth|credentials|invalid|login/i.test(String(e.message)) ? 'A caixa recusou o acesso: confirme o SMTP_USER e o SMTP_PASS (palavra-passe de aplicação).' : 'Não foi possível ler a caixa de email.';
        console.error('Leitura das respostas por email:', String(e.message).slice(0, 200));
    } finally { aCorrer = false; ultimo = r; }
    return r;
}

// Arranque: verifica pouco depois de o servidor subir e depois de 3 em 3 minutos
let temporizador = null;
function iniciar() {
    if (temporizador || !configurado()) return false;
    const c = cfg();
    setTimeout(() => verificar().catch(() => {}), 20000).unref?.();
    temporizador = setInterval(() => verificar().catch(() => {}), c.minutos * 60000);
    temporizador.unref?.();
    return true;
}
const estado = () => ({ configurado: configurado(), ultimo, a_correr: aCorrer });

module.exports = { configurado, verificar, iniciar, estado, ehAutomatica, limparTexto, pedeParar, montarIndices, ligarAoLead, endereco, registarResposta };

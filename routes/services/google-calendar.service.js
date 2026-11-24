// Google Calendar ↔ Tarefas.
//
// COMO FUNCIONA
//  - Uma ligação para a empresa: um administrador clica em «Ligar Google Calendar», autoriza no Google e o servidor guarda o refresh token
//    CIFRADO (tabela google_ligacao). O token nunca vai para o browser.
//  - Tarefas → Google: as reuniões (tarefas do tipo «reunião») e qualquer tarefa com hora ganham um evento no calendário ligado
//    (reunião sem hora = dia inteiro; com hora = 1 hora por defeito). Criar, alterar ou apagar a tarefa atualiza ou apaga o evento.
//    Tarefas concluídas ficam como estão no Google.
//  - Google → Tarefas: o calendário das Tarefas mostra os eventos do Google (só leitura), exceto os que a própria plataforma criou.
//  - O Google nunca bloqueia nada: se falhar (sem rede, autorização revogada), a tarefa grava-se na mesma e o erro fica registado.
//  - Não se convida ninguém (sendUpdates=none): os eventos são só do calendário ligado.
// Credenciais (no .env): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI (ou APP_URL). Opcionais: GOOGLE_TIMEZONE, GOOGLE_CALENDAR_ID,
// GOOGLE_LOGIN_HINT, GOOGLE_DURACAO_MIN. Passo a passo em docs/google-calendar.md.
const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase.service');

const ESCOPO = 'https://www.googleapis.com/auth/calendar.events';
const ESCOPOS_PEDIDOS = `${ESCOPO} openid email`;               // «openid email» só serve para mostrar a que conta Google está ligado
const API = 'https://www.googleapis.com/calendar/v3';
const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const VALIDADE_ESTADO_MS = 10 * 60 * 1000;
const erro = (codigo, mensagem, extra = {}) => Object.assign(new Error(mensagem), { codigo }, extra);

const cfg = () => {
    const e = process.env;
    const app = String(e.APP_URL || '').replace(/\/+$/, '');
    return { id: e.GOOGLE_CLIENT_ID || '', segredo: e.GOOGLE_CLIENT_SECRET || '', redirect: e.GOOGLE_REDIRECT_URI || (app ? `${app}/api/google/callback` : ''), app,
        fuso: e.GOOGLE_TIMEZONE || 'Europe/Lisbon', calendario: e.GOOGLE_CALENDAR_ID || 'primary', dica: e.GOOGLE_LOGIN_HINT || '', duracao: Math.min(Math.max(parseInt(e.GOOGLE_DURACAO_MIN, 10) || 60, 15), 720) };
};
const configurado = () => { const c = cfg(); return !!(c.id && c.segredo && c.redirect); };

// ---------- cifra do token e assinatura do «state» ----------
const chave = () => crypto.createHash('sha256').update(`${cfg().segredo}|ns-google|v1`).digest();
function cifrar(texto) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
    const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64');
}
function decifrar(b64) {
    const b = Buffer.from(String(b64), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', chave(), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
const assinar = (texto) => crypto.createHmac('sha256', chave()).update(texto).digest('base64url');
// O «state» liga o regresso do Google a quem o pediu (administrador) e expira em 10 minutos
function criarEstado(utilizadorId, agora = Date.now()) {
    const corpo = Buffer.from(JSON.stringify({ u: utilizadorId, e: agora + VALIDADE_ESTADO_MS, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
    return `${corpo}.${assinar(corpo)}`;
}
function lerEstado(estado, agora = Date.now()) {
    const [corpo, sig] = String(estado || '').split('.');
    if (!corpo || !sig) return null;
    const esperado = assinar(corpo);
    if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
    try { const j = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); return j.e > agora ? j : null; } catch { return null; }
}

// ---------- chamadas ao Google ----------
async function pedir(url, opcoes = {}) {
    const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(15000) });
    const texto = await r.text();
    let json = null; try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    return { ok: r.ok, estado: r.status, json };
}
let cache = { token: null, ate: 0 };
const esquecerToken = () => { cache = { token: null, ate: 0 }; };

async function lerLigacao() {
    const { data, error } = await supabaseAdmin.from('google_ligacao').select('id, email, calendario_id, token_cifrado, ligado_em, ultimo_erro, ultimo_erro_em').eq('id', 1).maybeSingle();
    return error ? null : (data || null);
}
async function registarErro(mensagem) {
    try { await supabaseAdmin.from('google_ligacao').update({ ultimo_erro: String(mensagem).slice(0, 300), ultimo_erro_em: new Date().toISOString() }).eq('id', 1); } catch { /* sem base de dados: já está registado no log */ }
}
async function limparErro() { try { await supabaseAdmin.from('google_ligacao').update({ ultimo_erro: null, ultimo_erro_em: null }).eq('id', 1); } catch { /* não faz mal */ } }

// Token de acesso (dura ~1 hora; renova-se com o refresh token). Devolve null se a ligação deixou de valer.
async function tokenDeAcesso(ligacao) {
    if (cache.token && cache.ate > Date.now() + 30000) return cache.token;
    const c = cfg();
    let refresh; try { refresh = decifrar(ligacao.token_cifrado); } catch { await registarErro('Não foi possível ler a autorização guardada: ligue outra vez.'); return null; }
    const r = await pedir(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.id, client_secret: c.segredo, refresh_token: refresh, grant_type: 'refresh_token' }) });
    if (!r.ok || !r.json?.access_token) {
        await registarErro(r.json?.error === 'invalid_grant' ? 'A autorização do Google expirou ou foi revogada: ligue outra vez.' : `O Google recusou o pedido (${r.estado}).`);
        esquecerToken(); return null;
    }
    cache = { token: r.json.access_token, ate: Date.now() + (Number(r.json.expires_in) || 3600) * 1000 };
    return cache.token;
}
async function calendario(metodo, caminho, { corpo, params, ligacao } = {}) {
    const l = ligacao || await lerLigacao();
    if (!l) throw erro('NAO_LIGADO', 'O Google Calendar não está ligado.');
    const token = await tokenDeAcesso(l);
    if (!token) throw erro('AUTORIZACAO', 'A autorização do Google expirou: ligue outra vez.');
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    const r = await pedir(`${API}/calendars/${encodeURIComponent(l.calendario_id || 'primary')}/events${caminho}${qs}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (!r.ok && r.estado !== 404 && r.estado !== 410) { await registarErro(`Google Calendar: ${r.json?.error?.message || r.estado}`.slice(0, 200)); throw erro('GOOGLE', `Google Calendar ${r.estado}`, { estado: r.estado }); }
    return r;
}

// ---------- ligar e desligar ----------
async function urlParaLigar(utilizador) {
    if (!configurado()) throw erro('CONFIG', 'O Google Calendar ainda não está configurado (faltam as credenciais no .env).');
    const c = cfg();
    const p = new URLSearchParams({ client_id: c.id, redirect_uri: c.redirect, response_type: 'code', scope: ESCOPOS_PEDIDOS, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: criarEstado(utilizador.id) });
    if (c.dica) p.set('login_hint', c.dica);
    return `${AUTORIZAR}?${p}`;
}

// Regresso do Google: troca o código pelo refresh token e guarda-o cifrado
async function concluirLigacao({ code, state, error: erroGoogle }) {
    const est = lerEstado(state);
    if (!est) throw erro('ESTADO', 'O pedido de ligação expirou ou não é válido: tente outra vez.');
    if (erroGoogle) throw erro('RECUSADO', 'A ligação ao Google Calendar foi cancelada.');
    if (!code) throw erro('ESTADO', 'O pedido de ligação expirou ou não é válido: tente outra vez.');
    const c = cfg();
    const r = await pedir(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: c.id, client_secret: c.segredo, redirect_uri: c.redirect, grant_type: 'authorization_code' }) });
    if (!r.ok || !r.json?.access_token) {
        // o motivo (invalid_client = ID ou segredo errados; redirect_uri_mismatch = URI diferente do registado) fica no log e segue para o ecrã, sem nunca incluir valores secretos
        const g = String(r.json?.error || r.estado).replace(/[^a-z_0-9]/gi, '').slice(0, 40);
        console.error('Google Calendar (token):', g, String(r.json?.error_description || '').replace(/[^\w .,:;'-]/g, '').slice(0, 120));
        throw erro('GOOGLE', 'O Google não aceitou a autorização.', { motivo: g === 'invalid_client' || g === 'unauthorized_client' ? 'CREDENCIAIS' : g === 'redirect_uri_mismatch' ? 'REDIRECT' : g === 'invalid_grant' ? 'CODIGO' : 'GOOGLE' });
    }
    if (!r.json.refresh_token) throw erro('SEM_REFRESH', 'O Google não devolveu a autorização permanente: remova o acesso da aplicação na conta Google e ligue outra vez.');
    if (!String(r.json.scope || '').split(' ').includes(ESCOPO)) throw erro('RECUSADO', 'Faltou autorizar o acesso aos eventos do calendário: ligue outra vez e marque a permissão.');
    let email = null;
    try { const info = await pedir('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${r.json.access_token}` } }); email = info.json?.email || null; } catch { email = null; }
    await supabaseAdmin.from('google_ligacao').delete().eq('id', 1);
    const { error } = await supabaseAdmin.from('google_ligacao').insert({ id: 1, email, calendario_id: c.calendario, token_cifrado: cifrar(r.json.refresh_token), ligado_por: est.u || null, ligado_em: new Date().toISOString() });
    if (error) { console.error('Google Calendar: guardar a ligação:', error.message); throw erro('CONFIG', 'A base de dados ainda não está pronta para o Google Calendar (corra database/google.sql).'); }
    cache = { token: r.json.access_token, ate: Date.now() + (Number(r.json.expires_in) || 3600) * 1000 };
    return { email };
}

async function desligar() {
    const l = await lerLigacao();
    if (l) { try { await pedir(REVOGAR, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decifrar(l.token_cifrado) }) }); } catch { /* se não conseguir revogar, apaga na mesma */ } }
    await supabaseAdmin.from('google_ligacao').delete().eq('id', 1);
    esquecerToken();
}

async function estado() {
    const l = configurado() ? await lerLigacao() : null;
    return { configurado: configurado(), ligado: !!l, email: l?.email || null, calendario: l?.calendario_id || null, ligado_em: l?.ligado_em || null, erro: l?.ultimo_erro || null, fuso: cfg().fuso };
}

// ---------- tarefa → evento ----------
const hora5 = (h) => (h ? String(h).slice(0, 5) : null);
const elegivel = (t) => !!t && (t.tipo === 'reuniao' || !!hora5(t.hora));
function somarMinutos(dia, hhmm, min) {                 // aritmética de relógio, sem fusos: «2026-12-01 23:30» + 60 min = «2026-12-02T00:30:00»
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), h, m + min));
    return d.toISOString().slice(0, 19);
}
const diaSeguinte = (dia) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

function montarEvento(t, { empresa, lead_id } = {}) {
    const c = cfg(), h = hora5(t.hora);
    const ligacao = c.app && lead_id ? `${c.app}/assets/pages/leads.html#lead=${lead_id}` : '';
    const descricao = [empresa ? `Empresa: ${empresa}` : null, `Tarefa (${t.tipo})`, ligacao, 'Criado pela Alpha Leads Intelligence.'].filter(Boolean).join('\n');
    const quando = h ? { start: { dateTime: `${t.prazo}T${h}:00`, timeZone: c.fuso }, end: { dateTime: somarMinutos(t.prazo, h, c.duracao), timeZone: c.fuso } }
        : { start: { date: t.prazo }, end: { date: diaSeguinte(t.prazo) } };
    return { summary: String(t.titulo).slice(0, 200), description: descricao, ...quando, extendedProperties: { private: { ns_tarefa: t.id } } };
}

// Cria, atualiza ou apaga o evento desta tarefa. Nunca lança: devolve { acao } ou { erro }.
async function sincronizarTarefa(id, { ligacao } = {}) {
    try {
        if (!configurado()) return { acao: 'nada' };
        const l = ligacao || await lerLigacao();
        if (!l) return { acao: 'nada' };
        let { data: t, error } = await supabaseAdmin.from('tarefas').select('id, lead_id, empresa_id, titulo, tipo, prazo, hora, concluida_em, google_event_id').eq('id', id).maybeSingle();
        if (error && /hora|google_event_id/.test(error.message)) return { acao: 'nada', erro: 'sql' };   // database/tasks.sql ou google.sql por correr
        if (error || !t) return { acao: 'nada' };
        if (t.concluida_em) return { acao: 'concluida' };
        if (!elegivel(t)) {
            if (t.google_event_id) { await calendario('DELETE', `/${encodeURIComponent(t.google_event_id)}`, { ligacao: l, params: { sendUpdates: 'none' } }); await supabaseAdmin.from('tarefas').update({ google_event_id: null }).eq('id', id); return { acao: 'apagado' }; }
            return { acao: 'nada' };
        }
        const { data: emp } = await supabaseAdmin.from('empresas').select('nome').eq('id', t.empresa_id).maybeSingle();
        const evento = montarEvento(t, { empresa: emp?.nome, lead_id: t.lead_id });
        if (t.google_event_id) {
            const r = await calendario('PATCH', `/${encodeURIComponent(t.google_event_id)}`, { ligacao: l, corpo: evento, params: { sendUpdates: 'none' } });
            if (r.ok) { await limparErro(); return { acao: 'atualizado' }; }
            // o evento foi apagado no Google: cria-se de novo
        }
        const r = await calendario('POST', '', { ligacao: l, corpo: evento, params: { sendUpdates: 'none' } });
        if (!r.ok || !r.json?.id) return { acao: 'nada', erro: 'google' };
        await supabaseAdmin.from('tarefas').update({ google_event_id: r.json.id }).eq('id', id);
        await limparErro();
        return { acao: 'criado' };
    } catch (e) { console.error('Google Calendar:', String(e.message).slice(0, 200)); return { acao: 'nada', erro: e.codigo || 'erro' }; }
}

// Chamadas feitas pelas tarefas: não bloqueiam (o Google pode demorar) e nunca falham. Os testes esperam por esperar().
const emCurso = new Set();
function seguir(promessa) { const p = promessa.catch(() => {}).finally(() => emCurso.delete(p)); emCurso.add(p); return p; }
const esperar = async () => { while (emCurso.size) await Promise.all([...emCurso]); };
const aoMudarTarefa = (id) => (configurado() && id ? seguir(sincronizarTarefa(id)) : Promise.resolve());

async function apagarEvento(eventId) {
    try {
        if (!configurado() || !eventId) return;
        const l = await lerLigacao(); if (!l) return;
        await calendario('DELETE', `/${encodeURIComponent(eventId)}`, { ligacao: l, params: { sendUpdates: 'none' } });
    } catch (e) { console.error('Google Calendar:', String(e.message).slice(0, 200)); }
}
const aoApagarTarefa = (eventId) => (configurado() && eventId ? seguir(apagarEvento(eventId)) : Promise.resolve());

// ids de eventos das tarefas (para apagar antes de a tarefa desaparecer); tolera a coluna ainda não existir
async function eventosDasTarefas(ids) {
    if (!configurado() || !ids?.length) return [];
    const { data, error } = await supabaseAdmin.from('tarefas').select('id, google_event_id').in('id', ids);
    return error ? [] : (data || []).filter((t) => t.google_event_id).map((t) => ({ id: t.id, evento: t.google_event_id }));
}
// Reuniões que deixaram de fazer sentido (lead perdido, não contactar...): o evento sai do Google
async function removerEventosDeTarefas(ids) {
    for (const { id, evento } of await eventosDasTarefas(ids)) { await apagarEvento(evento); await supabaseAdmin.from('tarefas').update({ google_event_id: null }).eq('id', id); }
}
const aoFecharReunioes = (ids) => (configurado() && ids?.length ? seguir(removerEventosDeTarefas(ids)) : Promise.resolve());

// Sincroniza as tarefas elegíveis que ainda estão por fazer (por exemplo, as reuniões que já existiam antes de ligar o Google)
async function sincronizarTodas() {
    const l = await lerLigacao();
    if (!l) throw erro('NAO_LIGADO', 'O Google Calendar não está ligado.');
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin.from('tarefas').select('id, tipo, hora, prazo').is('concluida_em', null).gte('prazo', hoje).limit(300);
    if (error) throw erro('CONFIG', 'A base de dados ainda não está pronta para o Google Calendar (corra database/google.sql e database/tasks.sql).');
    const resultado = { criados: 0, atualizados: 0, apagados: 0, erros: 0, total: 0 };
    for (const t of (data || []).filter(elegivel)) {
        resultado.total++;
        const r = await sincronizarTarefa(t.id, { ligacao: l });
        if (r.erro) resultado.erros++; else if (r.acao === 'criado') resultado.criados++; else if (r.acao === 'atualizado') resultado.atualizados++; else if (r.acao === 'apagado') resultado.apagados++;
    }
    return resultado;
}

// ---------- Google → calendário das Tarefas ----------
const DIA = /^\d{4}-\d{2}-\d{2}$/;
async function listarEventos({ de, ate } = {}) {
    if (!DIA.test(String(de)) || !DIA.test(String(ate)) || ate < de) throw erro('INVALIDO', 'Intervalo de datas inválido.');
    if ((Date.parse(ate) - Date.parse(de)) / 86400000 > 62) throw erro('INVALIDO', 'Intervalo de datas inválido.');
    const l = configurado() ? await lerLigacao() : null;
    if (!l) return { eventos: [], ligado: false };
    const r = await calendario('GET', '', { ligacao: l, params: { timeMin: `${de}T00:00:00Z`, timeMax: `${diaSeguinte(ate)}T12:00:00Z`, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' } });
    const eventos = [];
    for (const e of r.json?.items || []) {
        if (e.status === 'cancelled' || e.extendedProperties?.private?.ns_tarefa) continue;   // os da própria plataforma já aparecem como tarefas
        const inicioDia = e.start?.date || String(e.start?.dateTime || '').slice(0, 10);
        if (!DIA.test(inicioDia)) continue;
        const hora = e.start?.dateTime ? String(e.start.dateTime).slice(11, 16) : null;
        let fimDia = e.end?.date ? (() => { const d = new Date(`${e.end.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })() : inicioDia;
        if (fimDia < inicioDia) fimDia = inicioDia;
        for (let dia = inicioDia, n = 0; dia <= fimDia && n < 31; dia = diaSeguinte(dia), n++) {
            if (dia < de || dia > ate) continue;
            eventos.push({ id: e.id, titulo: String(e.summary || '(sem título)').slice(0, 120), dia, hora: n === 0 ? hora : null, link: e.htmlLink || null });
        }
    }
    return { eventos, ligado: true };
}

module.exports = {
    configurado, estado, urlParaLigar, concluirLigacao, desligar, listarEventos, sincronizarTarefa, sincronizarTodas, aoMudarTarefa, aoApagarTarefa, aoFecharReunioes, eventosDasTarefas, esperar,
    elegivel, montarEvento, criarEstado, lerEstado, cifrar, decifrar, esquecerToken, ESCOPO
};

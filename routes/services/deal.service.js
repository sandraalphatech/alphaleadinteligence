// Negócios (página «Negócios»): as oportunidades de venda, num quadro de etapas com valores, como num CRM.
//
// REGRAS
//  - Um negócio tem empresa, título, valor (e moeda), etapa, responsável e previsão de fecho. Acaba «ganho» ou «perdido» (com motivo).
//  - Não se criam negócios para empresas em «Não contactar».
//  - Se o negócio está ligado a um lead, fechá-lo atualiza o lead: ganho → «negócio fechado», perdido → «oportunidade perdida»
//    (assim o funil e os relatórios refletem o resultado). Reabrir um negócio não mexe no lead.
//  - O servidor valida tudo (números, datas, etapas) e calcula os totais por etapa e moeda; o browser nunca decide um total.
const { supabaseAdmin } = require('./supabase.service');
const { escaparPesquisa } = require('./pipeline.service');

const ETAPAS = ['qualificado', 'contactado', 'reuniao', 'proposta', 'negociacao'];
const ESTADOS = ['aberto', 'ganho', 'perdido'];
const MOEDAS = ['EUR', 'USD', 'GBP', 'BRL'];
const MAX_VALOR = 1000000000;
const MAX_NEGOCIOS = 1000;
const UUID = /^[0-9a-f-]{36}$/i;
const erro = (codigo, mensagem, extra = {}) => Object.assign(new Error(mensagem), { codigo }, extra);
const BD_NAO_PRONTA = 'A base de dados ainda não está pronta para os negócios (corra database/deals.sql).';
const linha = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------- validação (função pura) ----------
function valor(v) {
    const n = typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_VALOR) throw erro('INVALIDO', 'O valor não é válido.');
    return Math.round(n * 100) / 100;
}
function dataPrevista(v) {
    if (v == null || v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw erro('INVALIDO', 'A data prevista não é válida.');
    const d = new Date(`${v}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw erro('INVALIDO', 'A data prevista não é válida.');
    const hoje = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const dias = Math.round((d.getTime() - hoje) / 86400000);
    if (dias < -3650 || dias > 3650) throw erro('INVALIDO', 'A data prevista não é válida.');
    return String(v);
}

// Normaliza o que vem do formulário. parcial = só valida os campos presentes (para atualizar).
function validarNegocio(e = {}, { parcial = false } = {}) {
    const r = {};
    if (!parcial || 'titulo' in e) {
        r.titulo = linha(e.titulo, 120);
        if (!r.titulo) throw erro('VAZIO', 'O título do negócio é obrigatório.');
    }
    if (!parcial || 'valor' in e) r.valor = e.valor == null || e.valor === '' ? 0 : valor(e.valor);
    if (!parcial || 'moeda' in e) { r.moeda = e.moeda == null || e.moeda === '' ? 'EUR' : e.moeda; if (!MOEDAS.includes(r.moeda)) throw erro('INVALIDO', 'Moeda inválida.'); }
    if (!parcial || 'etapa' in e) { r.etapa = e.etapa == null || e.etapa === '' ? 'qualificado' : e.etapa; if (!ETAPAS.includes(r.etapa)) throw erro('INVALIDO', 'Etapa inválida.'); }
    if (!parcial || 'data_prevista' in e) r.data_prevista = dataPrevista(e.data_prevista);
    if ('responsavel_id' in e) {
        if (e.responsavel_id !== null && e.responsavel_id !== '' && !UUID.test(String(e.responsavel_id))) throw erro('INVALIDO', 'Responsável inválido.');
        r.responsavel_id = e.responsavel_id || null;
    }
    return r;
}

// ---------- totais ----------
// Por etapa: quantos e quanto (por moeda, para nunca somar euros com dólares).
function calcularTotais(negocios) {
    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, { n: 0, valores: {} }]));
    const total = { n: 0, valores: {} };
    for (const n of negocios) {
        if (n.estado !== 'aberto') continue;
        const e = porEtapa[n.etapa] || (porEtapa[n.etapa] = { n: 0, valores: {} });
        for (const alvo of [e, total]) { alvo.n++; alvo.valores[n.moeda] = Math.round(((alvo.valores[n.moeda] || 0) + Number(n.valor)) * 100) / 100; }
    }
    return { por_etapa: porEtapa, abertos: total };
}

// ---------- ler ----------
const CAMPOS = 'id, empresa_id, lead_id, proposta_id, titulo, valor, moeda, etapa, estado, motivo_perda, responsavel_id, data_prevista, criado_em, atualizado_em, fechado_em';
const emLotes = (lista, n = 100) => { const r = []; for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n)); return r; };

async function enriquecer(lista) {
    const empresas = new Map(), tarefas = new Map(), equipa = new Map(), propostas = new Map();
    const idsEmpresas = [...new Set(lista.map((n) => n.empresa_id))], idsLeads = [...new Set(lista.map((n) => n.lead_id).filter(Boolean))];
    for (const parte of emLotes(idsEmpresas)) { const { data } = await supabaseAdmin.from('empresas').select('id, nome, pais').in('id', parte); (data || []).forEach((e) => empresas.set(e.id, e)); }
    for (const parte of emLotes(idsLeads)) {
        const { data } = await supabaseAdmin.from('tarefas').select('lead_id, titulo, prazo').in('lead_id', parte).is('concluida_em', null);
        (data || []).forEach((t) => { const a = tarefas.get(t.lead_id); if (!a || t.prazo < a.prazo) tarefas.set(t.lead_id, t); });
    }
    const idsPropostas = [...new Set(lista.map((n) => n.proposta_id).filter(Boolean))];
    for (const parte of emLotes(idsPropostas)) {
        const { data } = await supabaseAdmin.from('propostas').select('id, numero, criado_em').in('id', parte);
        (data || []).forEach((p) => propostas.set(p.id, { id: p.id, numero: require('./proposal.service').nomeProposta(p) }));
    }
    const { data: us } = await supabaseAdmin.from('utilizadores').select('id, nome').order('nome');
    (us || []).forEach((u) => equipa.set(u.id, u));
    return {
        equipa: [...equipa.values()],
        negocios: lista.map((n) => ({
            ...n, valor: Number(n.valor), empresa: empresas.get(n.empresa_id) || null, responsavel: n.responsavel_id ? (equipa.get(n.responsavel_id) || null) : null,
            proposta: n.proposta_id ? (propostas.get(n.proposta_id) || null) : null,
            proxima_atividade: n.lead_id && tarefas.has(n.lead_id) ? { titulo: tarefas.get(n.lead_id).titulo, prazo: tarefas.get(n.lead_id).prazo } : null
        }))
    };
}

// estado: aberto (por defeito) | ganho | perdido | todos
async function listarNegocios({ estado = 'aberto', q, responsavel } = {}) {
    let consulta = supabaseAdmin.from('negocios').select(CAMPOS).order('criado_em', { ascending: false }).limit(MAX_NEGOCIOS);
    if (ESTADOS.includes(estado)) consulta = consulta.eq('estado', estado);
    if (UUID.test(String(responsavel || ''))) consulta = consulta.eq('responsavel_id', responsavel);
    const { data, error } = await consulta;
    if (error) { console.error('Negócios:', error.message); throw erro('CONFIG', BD_NAO_PRONTA); }
    let lista = data || [];
    const r = await enriquecer(lista);
    const termo = escaparPesquisa(q).toLowerCase();
    if (termo) r.negocios = r.negocios.filter((n) => `${n.titulo} ${n.empresa?.nome || ''}`.toLowerCase().includes(termo));
    return { ...r, totais: calcularTotais(r.negocios), fechados: await resumoFechados(), limite: MAX_NEGOCIOS, etapas: ETAPAS };
}

// Quantos negócios ganhos e perdidos há (e quanto valem os ganhos), para a barra da página: quem procura um negócio fechado vê logo que ele existe.
async function resumoFechados() {
    const r = { ganho: { n: 0, valores: {} }, perdido: { n: 0, valores: {} } };
    const { data } = await supabaseAdmin.from('negocios').select('estado, valor, moeda').in('estado', ['ganho', 'perdido']).limit(5000);
    for (const n of data || []) {
        const alvo = r[n.estado]; if (!alvo) continue;
        alvo.n++; alvo.valores[n.moeda] = Math.round(((alvo.valores[n.moeda] || 0) + Number(n.valor)) * 100) / 100;
    }
    return r;
}

async function procurarEmpresas(q) {
    const termo = escaparPesquisa(q);
    if (termo.length < 2) return [];
    const { data, error } = await supabaseAdmin.from('empresas').select('id, nome, pais').ilike('nome', `%${termo}%`).eq('nao_contactar', false).order('nome').limit(15);
    if (error) throw new Error(error.message);
    // cada empresa vem com o seu melhor lead (o de maior pontuação), para o negócio se ligar a ele
    const lista = data || [];
    const leads = new Map();
    if (lista.length) {
        const { data: ls } = await supabaseAdmin.from('leads').select('id, empresa_id, pontuacao').in('empresa_id', lista.map((e) => e.id));
        (ls || []).forEach((l) => { const x = leads.get(l.empresa_id); if (!x || (l.pontuacao ?? -1) > (x.pontuacao ?? -1)) leads.set(l.empresa_id, l); });
    }
    return lista.map((e) => ({ id: e.id, nome: e.nome, pais: e.pais, lead_id: leads.get(e.id)?.id || null }));
}

// As propostas de um lead, cada uma com o valor sugerido para o negócio (para o botão «usar este valor»). Sem a tabela das propostas, devolve [].
async function propostasDoLead(leadId) {
    if (!UUID.test(String(leadId || ''))) return [];
    const { data, error } = await supabaseAdmin.from('propostas').select('id, numero, titulo, estado, dados, criado_em').eq('lead_id', leadId).order('criado_em', { ascending: false }).limit(20);
    if (error) return [];
    const { nomeProposta, valorDoNegocio } = require('./proposal.service');
    return (data || []).map((p) => ({ id: p.id, numero: nomeProposta(p), titulo: p.titulo, estado: p.estado, criado_em: p.criado_em, ...valorDoNegocio(p.dados) }));
}

// Ao marcar uma proposta como enviada: o negócio aberto desse lead passa a «proposta feita» (nunca recua de «negociação»), fica ligado à proposta
// e, se ainda não tinha valor, recebe o da proposta (um valor que alguém já pôs não se sobrepõe). Se não há negócio aberto, cria-se um.
// Empresas em «Não contactar» não ganham negócio. Devolve { id, criado, etapa, valor_preenchido } ou null.
async function sincronizarComProposta(p, utilizador) {
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nao_contactar').eq('id', p.empresa_id).maybeSingle();
    if (!empresa || empresa.nao_contactar) return null;
    const v = require('./proposal.service').valorDoNegocio(p.dados);
    const { data: abertos, error } = await supabaseAdmin.from('negocios').select(CAMPOS).eq('lead_id', p.lead_id).eq('estado', 'aberto').order('criado_em', { ascending: false }).limit(1);
    if (error) throw erro('CONFIG', BD_NAO_PRONTA);
    const agora = new Date().toISOString();
    const atual = abertos?.[0];
    if (atual) {
        const mudanca = { proposta_id: p.id, atualizado_em: agora };
        if (ETAPAS.indexOf(atual.etapa) < ETAPAS.indexOf('proposta')) mudanca.etapa = 'proposta';
        if (Number(atual.valor) === 0) { mudanca.valor = v.valor; mudanca.moeda = v.moeda; }
        const { error: e2 } = await supabaseAdmin.from('negocios').update(mudanca).eq('id', atual.id);
        if (e2) throw new Error(e2.message);
        return { id: atual.id, criado: false, etapa: mudanca.etapa || atual.etapa, moveu: 'etapa' in mudanca, valor_preenchido: 'valor' in mudanca };
    }
    const { data, error: e3 } = await supabaseAdmin.from('negocios').insert({
        empresa_id: p.empresa_id, lead_id: p.lead_id, proposta_id: p.id, titulo: linha(p.titulo, 120) || 'Proposta', valor: v.valor, moeda: v.moeda, etapa: 'proposta', estado: 'aberto',
        responsavel_id: utilizador?.id || null, criado_por: utilizador?.id || null, criado_em: agora, atualizado_em: agora
    }).select('id').single();
    if (e3) throw new Error(e3.message);
    return { id: data.id, criado: true, etapa: 'proposta', moveu: false, valor_preenchido: true };
}

async function obter(id) {
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Negócio não encontrado.');
    const { data, error } = await supabaseAdmin.from('negocios').select(CAMPOS).eq('id', id).maybeSingle();
    if (error) throw erro('CONFIG', BD_NAO_PRONTA);
    if (!data) throw erro('NAO_ENCONTRADA', 'Negócio não encontrado.');
    return data;
}

// ---------- criar e alterar ----------
async function criarNegocio(entrada, utilizador) {
    if (!UUID.test(String(entrada?.empresa_id || ''))) throw erro('VAZIO', 'Escolha a empresa do negócio.');
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nome, nao_contactar').eq('id', entrada.empresa_id).maybeSingle();
    if (!empresa) throw erro('NAO_ENCONTRADA', 'Empresa não encontrada.');
    if (empresa.nao_contactar) throw erro('BLOQUEADO', 'Esta empresa está em «Não contactar»: não se criam negócios para ela.');
    let leadId = null;
    if (entrada.lead_id) {
        if (!UUID.test(String(entrada.lead_id))) throw erro('NAO_ENCONTRADA', 'Lead não encontrado.');
        const { data: lead } = await supabaseAdmin.from('leads').select('id, empresa_id').eq('id', entrada.lead_id).maybeSingle();
        if (!lead || lead.empresa_id !== empresa.id) throw erro('NAO_ENCONTRADA', 'Lead não encontrado.');
        leadId = lead.id;
    }
    const dados = validarNegocio({ ...entrada, titulo: entrada.titulo || empresa.nome, responsavel_id: 'responsavel_id' in entrada ? entrada.responsavel_id : utilizador.id });
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('negocios').insert({ empresa_id: empresa.id, lead_id: leadId, estado: 'aberto', ...dados, criado_por: utilizador.id, criado_em: agora, atualizado_em: agora }).select(CAMPOS).single();
    if (error) { console.error('Criar negócio:', error.message); throw erro('CONFIG', BD_NAO_PRONTA); }
    return data;
}

async function atualizarNegocio(id, corpo) {
    const atual = await obter(id);
    const mudanca = validarNegocio(corpo || {}, { parcial: true });
    if (!Object.keys(mudanca).length) throw erro('VAZIO', 'Nada para alterar.');
    if (atual.estado !== 'aberto' && 'etapa' in mudanca && mudanca.etapa !== atual.etapa) throw erro('INVALIDO', 'O negócio já está fechado.');
    const { data, error } = await supabaseAdmin.from('negocios').update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq('id', id).select(CAMPOS).single();
    if (error) throw new Error(error.message);
    return data;
}

// Fecha o negócio como ganho ou perdido; se há lead ligado, o lead acompanha.
async function fecharNegocio(id, resultado, motivo, { tocarLead = true } = {}) {
    if (!['ganho', 'perdido'].includes(resultado)) throw erro('INVALIDO', 'Estado inválido.');
    const atual = await obter(id);
    if (atual.estado !== 'aberto') throw erro('INVALIDO', 'O negócio já está fechado.');
    const agora = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('negocios').update({ estado: resultado, motivo_perda: resultado === 'perdido' ? (linha(motivo, 200) || null) : null, fechado_em: agora, atualizado_em: agora }).eq('id', id).select(CAMPOS).single();
    if (error) throw new Error(error.message);
    let lead_estado = null;
    if (atual.lead_id && tocarLead) {
        const novo = resultado === 'ganho' ? 'negocio_fechado' : 'oportunidade_perdida';
        const r = await supabaseAdmin.from('leads').update({ estado: novo, ultima_origem: 'negocio' }).eq('id', atual.lead_id);
        if (!r.error) {
            lead_estado = novo;
            try { await require('./task-automation.service').aoMudarEstado({ id: atual.lead_id, empresa_id: atual.empresa_id }, novo, {}); } catch (e) { console.error('Tarefas automáticas:', String(e.message).slice(0, 200)); }
        }
    }
    return { ...data, lead_estado };
}

// O caminho inverso: o LEAD mudou de estado (na ficha ou no quadro dos Leads) e o negócio tem de acompanhar.
//  - negócio fechado: o negócio aberto desse lead fecha como GANHO; se não havia nenhum (e ainda não há um ganho), cria-se já ganho, com o valor
//    da proposta mais recente (ou 0), para o negócio aparecer em «Ganhos». Empresas em «Não contactar» não ganham negócio.
//  - oportunidade perdida ou proposta recusada: o negócio aberto desse lead fecha como PERDIDO (nunca se cria um perdido).
//  - os outros estados não mexem em negócios. Devolve { id, resultado, criado } ou null.
async function sincronizarComLead(lead, novoEstado) {
    const GANHO = ['negocio_fechado'], PERDIDO = ['oportunidade_perdida', 'proposta_recusada'];
    if (!GANHO.includes(novoEstado) && !PERDIDO.includes(novoEstado)) return null;
    const { data: abertos, error } = await supabaseAdmin.from('negocios').select(CAMPOS).eq('lead_id', lead.id).eq('estado', 'aberto').order('criado_em', { ascending: false }).limit(1);
    if (error) throw erro('CONFIG', BD_NAO_PRONTA);
    if (abertos?.[0]) {
        const f = await fecharNegocio(abertos[0].id, GANHO.includes(novoEstado) ? 'ganho' : 'perdido', undefined, { tocarLead: false });
        return { id: f.id, resultado: f.estado, criado: false };
    }
    if (!GANHO.includes(novoEstado)) return null;
    const { data: ganho } = await supabaseAdmin.from('negocios').select('id').eq('lead_id', lead.id).eq('estado', 'ganho').limit(1);
    if (ganho?.length) return null;
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nome, nao_contactar').eq('id', lead.empresa_id).maybeSingle();
    if (!empresa || empresa.nao_contactar) return null;
    const propostas = await propostasDoLead(lead.id);
    const p = propostas[0];
    const agora = new Date().toISOString();
    const { data, error: e2 } = await supabaseAdmin.from('negocios').insert({
        empresa_id: empresa.id, lead_id: lead.id, proposta_id: p?.id || null, titulo: linha(p?.titulo || empresa.nome, 120) || 'Negócio', valor: p?.valor || 0, moeda: p?.moeda || 'EUR',
        etapa: 'negociacao', estado: 'ganho', criado_em: agora, atualizado_em: agora, fechado_em: agora
    }).select('id').single();
    if (e2) throw new Error(e2.message);
    return { id: data.id, resultado: 'ganho', criado: true };
}

async function reabrirNegocio(id) {
    const atual = await obter(id);
    if (atual.estado === 'aberto') throw erro('INVALIDO', 'O negócio não está fechado.');
    const { data, error } = await supabaseAdmin.from('negocios').update({ estado: 'aberto', motivo_perda: null, fechado_em: null, atualizado_em: new Date().toISOString() }).eq('id', id).select(CAMPOS).single();
    if (error) throw new Error(error.message);
    return data;
}

async function apagarNegocio(id) {
    await obter(id);
    const { error } = await supabaseAdmin.from('negocios').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

module.exports = { propostasDoLead, sincronizarComProposta, sincronizarComLead, listarNegocios, procurarEmpresas, obter, criarNegocio, atualizarNegocio, fecharNegocio, reabrirNegocio, apagarNegocio, validarNegocio, calcularTotais, ETAPAS, ESTADOS, MOEDAS };

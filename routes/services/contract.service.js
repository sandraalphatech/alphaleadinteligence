// Clientes e contratos de prestação de serviços (página «Clientes»).
//
// REGRAS
//  - Cliente = lead em «negócio fechado». Só se criam contratos para clientes.
//  - O contrato nasce de um formulário que a Alpha Tech preenche (partes, serviços, preços, pagamento, duração e cláusulas), podendo
//    partir de uma proposta já feita ao cliente. As cláusulas jurídicas são geradas a partir destes dados no browser
//    (assets/js/contract-render.js); o servidor valida e guarda os dados e calcula os totais, as datas e os pendentes.
//  - Estados: rascunho -> enviado -> assinado. Um contrato só se edita em rascunho (o que foi enviado não muda sem o reabrir).
//  - O contrato assinado pelas duas partes (PDF ou imagem) fica no bucket privado «contratos» do Supabase Storage.
//  - As sugestões de propostas futuras são regras (serviços que ainda não contratou e que a análise ou os já contratados aconselham,
//    e a renovação quando o contrato está a acabar): sem IA, sem custo.
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('./supabase.service');
const proposta = require('./proposal.service');

const IDIOMAS = ['pt', 'en', 'es'];
const MOEDAS = ['EUR', 'USD', 'BRL', 'GBP'];
const IVAS = ['mais_iva', 'incluido', 'isento'];
const PLANOS = ['mensal_antecipado', 'entrada_saldo', 'unico'];
const RENOVACOES = ['nenhuma', 'automatica'];
const ESTADOS = ['rascunho', 'enviado', 'assinado'];
const MAX_ITENS = 8, MAX_EXTRAS = 5;
const MAX_FICHEIRO = 10 * 1024 * 1024;
const BUCKET = 'contratos';
const UUID = /^[0-9a-f-]{36}$/i;
const BD_NAO_PRONTA = 'A base de dados ainda não está pronta para os contratos (corra database/clients.sql).';
const ARMAZENAMENTO_NAO_PRONTO = 'O armazenamento dos contratos ainda não está pronto (corra database/clients.sql).';
const erro = (codigo, mensagem, extra = {}) => Object.assign(new Error(mensagem), { codigo }, extra);
const defeitos = () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'contract-defaults.json'), 'utf8'));
const METODO = { pt: 'transferência bancária', en: 'bank transfer', es: 'transferencia bancaria' };

// ---------- limpeza e validação (funções puras) ----------
const linha = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const lista = (v, max, tam) => (Array.isArray(v) ? v : []).map((x) => linha(x, tam)).filter(Boolean).slice(0, max);
const numero = (v, { min = 0, max = 10000000, nome = 'valor' } = {}) => {
    const n = typeof v === 'string' ? Number(v.replace(',', '.').trim()) : v;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw erro('INVALIDO', `O ${nome} não é válido.`);
    return Math.round(n * 100) / 100;
};
const opcional = (v, def, cfg) => (v == null || v === '' ? def : numero(v, cfg));
const data = (v, nome) => {
    if (v == null || v === '') return null;
    const d = new Date(`${v}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw erro('INVALIDO', `A ${nome} não é válida.`);
    return String(v);
};
const email = (v) => { const e = linha(v, 120); if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw erro('INVALIDO', 'O email indicado não é válido.'); return e; };
const iban = (v) => { const i = String(v ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40); if (i && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) throw erro('INVALIDO', 'O IBAN indicado não é válido.'); return i; };
const parte = (p = {}) => ({ nome: linha(p.nome, 120), nif: linha(p.nif, 30), morada: linha(p.morada, 220), representante: linha(p.representante, 100), cargo: linha(p.cargo, 80), email: email(p.email) });

function somarMeses(iso, n) {
    const [a, m, d] = iso.split('-').map(Number);
    const x = new Date(Date.UTC(a, m - 1 + n, 1));
    const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
    x.setUTCDate(Math.min(d, ultimo));
    return x.toISOString().slice(0, 10);
}
const somarDias = (iso, n) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function fimPrevisto(d) {
    if (d.fim) return d.fim;
    return d.inicio && d.duracao_meses > 0 ? somarDias(somarMeses(d.inicio, d.duracao_meses), -1) : null;
}
const arred = (n) => Math.round(n * 100) / 100;
function tipoContrato(d) {
    const temMensal = d.itens.some((i) => i.modelo === 'mensal' && i.valor > 0);
    return temMensal ? (d.duracao_meses > 0 ? 'fixo' : 'indeterminado') : 'projeto';
}
// valor total: só existe se o contrato tem duração (meses × mensalidade) ou se não tem mensalidade (só pontual); a percentagem sobre resultados não conta
function totais(d) {
    const soma = (m) => arred(d.itens.filter((i) => i.modelo === m).reduce((s, i) => s + i.valor, 0));
    const desc = (v) => arred(v * (1 - (d.desconto_pct || 0) / 100));
    const mensal = soma('mensal'), pontual = soma('pontual'), tipo = tipoContrato(d);
    const mensalL = desc(mensal), pontualL = desc(pontual), meses = tipo === 'fixo' ? d.duracao_meses : 0;
    return { mensal, pontual, mensal_liquido: mensalL, pontual_liquido: pontualL, meses, tipo, total_contrato: tipo === 'fixo' ? arred(pontualL + mensalL * meses) : (tipo === 'projeto' ? pontualL : null) };
}

function validarContrato(entrada = {}) {
    const idioma = IDIOMAS.includes(entrada.idioma) ? entrada.idioma : null;
    if (!idioma) throw erro('INVALIDO', 'Escolha o idioma do contrato.');
    const itens = (Array.isArray(entrada.itens) ? entrada.itens : []).slice(0, MAX_ITENS).map((i) => proposta.validarItem(i, idioma));
    if (!itens.length) throw erro('VAZIO', 'Acrescente pelo menos um serviço ao contrato.');
    const titulo = linha(entrada.titulo, 120);
    if (!titulo) throw erro('VAZIO', 'O contrato precisa de um título.');
    const base = {
        idioma, titulo, prestador: parte(entrada.prestador), cliente: { ...parte(entrada.cliente), pais: linha(entrada.cliente?.pais, 60) },
        itens, moeda: MOEDAS.includes(entrada.moeda) ? entrada.moeda : 'EUR', iva: IVAS.includes(entrada.iva) ? entrada.iva : 'mais_iva',
        desconto_pct: opcional(entrada.desconto_pct, 0, { max: 100, nome: 'desconto' }),
        inicio: data(entrada.inicio, 'data de início'), fim: data(entrada.fim, 'data de fim'),
        duracao_meses: Math.round(opcional(entrada.duracao_meses, 0, { max: 120, nome: 'duração do contrato' })),
        renovacao: RENOVACOES.includes(entrada.renovacao) ? entrada.renovacao : 'nenhuma',
        aviso_dias: Math.round(opcional(entrada.aviso_dias, 30, { max: 365, nome: 'prazo de aviso' })),
        prazo_aprovacao_dias: Math.round(opcional(entrada.prazo_aprovacao_dias, 5, { min: 1, max: 30, nome: 'prazo de aprovação' })),
        revisoes: Math.round(opcional(entrada.revisoes, 2, { max: 10, nome: 'número de revisões' })),
        confidencialidade_anos: Math.round(opcional(entrada.confidencialidade_anos, 3, { min: 1, max: 10, nome: 'prazo de confidencialidade' })),
        pagamento: {
            plano: PLANOS.includes(entrada.pagamento?.plano) ? entrada.pagamento.plano : null,
            entrada_pct: Math.round(opcional(entrada.pagamento?.entrada_pct, 50, { min: 1, max: 99, nome: 'percentagem de entrada' })),
            metodo: linha(entrada.pagamento?.metodo, 80) || METODO[idioma], iban: iban(entrada.pagamento?.iban),
            prazo_dias: Math.round(opcional(entrada.pagamento?.prazo_dias, 8, { max: 90, nome: 'prazo de pagamento' }))
        },
        dados_pessoais: entrada.dados_pessoais !== false,
        clausulas_extra: lista(entrada.clausulas_extra, MAX_EXTRAS, 900),
        foro: linha(entrada.foro, 60) || 'São Paulo', local: linha(entrada.local, 60) || 'São Paulo', data_contrato: data(entrada.data_contrato, 'data do contrato'),
        proposta_numero: linha(entrada.proposta_numero, 40)
    };
    base.pagamento.plano = base.pagamento.plano || (tipoContrato(base) === 'projeto' ? 'entrada_saldo' : 'mensal_antecipado');
    if (base.inicio && base.fim && base.fim < base.inicio) throw erro('INVALIDO', 'A data de fim não pode ser anterior à de início.');
    return base;
}

// O que falta preencher antes de emitir (enviar) o contrato
function pendentes(d) {
    const falta = [];
    for (const k of ['nome', 'nif', 'morada', 'representante']) { if (!d.prestador[k]) falta.push(`prestador.${k}`); if (!d.cliente[k]) falta.push(`cliente.${k}`); }
    if (!d.inicio) falta.push('inicio');
    return falta;
}

// ---------- sugestões de propostas futuras ----------
const COMPLEMENTOS = {
    sistemas: ['automacao_ia', 'website', 'design_grafico'], website: ['marketing_digital', 'sistemas', 'redes_sociais'],
    marketing_digital: ['website', 'redes_sociais'], redes_sociais: ['automacao_ia', 'design_grafico', 'marketing_digital'],
    automacao_ia: ['sistemas', 'website'], design_grafico: ['sistemas', 'redes_sociais', 'website']
};
// contratados: códigos dos serviços que já tem; analise: lista de códigos recomendados pela análise (por ordem); fimEm: dias até ao fim do contrato assinado (ou null)
function sugerirPropostas({ contratados = [], analise = [], fimEm = null } = {}) {
    const tem = new Set(contratados.filter((s) => proposta.SERVICOS.includes(s)));
    const porServico = new Map();
    const juntar = (servico, motivo) => { if (!proposta.SERVICOS.includes(servico) || tem.has(servico)) return; (porServico.get(servico) || porServico.set(servico, []).get(servico)).push(motivo); };
    analise.forEach((s) => juntar(s, { tipo: 'analise' }));
    [...tem].forEach((base) => (COMPLEMENTOS[base] || []).forEach((s) => juntar(s, { tipo: 'complementa', servico: base })));
    const servicos = [...porServico.entries()].map(([servico, motivos]) => ({ tipo: 'servico', servico, motivos: motivos.slice(0, 2), pontos: motivos.reduce((p, m) => p + (m.tipo === 'analise' ? 3 : 1), 0) }))
        .sort((a, b) => b.pontos - a.pontos).slice(0, 4).map(({ pontos, ...s }) => s);
    const renovacao = fimEm != null && fimEm <= 60 ? [{ tipo: 'renovacao', dias: fimEm }] : [];
    return [...renovacao, ...servicos];
}

// ---------- ler da base de dados ----------
const CAMPOS = 'id, numero, lead_id, empresa_id, proposta_id, titulo, idioma, estado, dados, inicio, fim_previsto, enviado_em, assinado_em, ficheiro_path, ficheiro_nome, ficheiro_tipo, criada_por, criado_em, atualizado_em';
const nomeContrato = (c) => `NS-C-${new Date(c.criado_em).getUTCFullYear()}-${c.numero != null ? String(c.numero).padStart(4, '0') : String(c.id).slice(0, 4).toUpperCase()}`;
const resumoContrato = (c) => {
    const t = totais(c.dados);
    return { id: c.id, numero: nomeContrato(c), lead_id: c.lead_id, empresa_id: c.empresa_id, proposta_id: c.proposta_id || null, titulo: c.titulo, idioma: c.idioma, estado: c.estado,
        inicio: c.inicio || null, fim_previsto: c.fim_previsto || null, enviado_em: c.enviado_em || null, assinado_em: c.assinado_em || null, tem_ficheiro: !!c.ficheiro_path, ficheiro_nome: c.ficheiro_nome || null,
        moeda: c.dados.moeda, total: t.total_contrato, mensal: t.mensal_liquido, tipo: t.tipo, servicos: [...new Set(c.dados.itens.map((i) => i.servico))], criado_em: c.criado_em, atualizado_em: c.atualizado_em };
};
const diasAte = (iso) => (iso ? Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`)) / 86400000) : null);

async function contratosDe(leadIds) {
    if (!leadIds.length) return { lista: [], disponivel: true };
    const { data: linhas, error } = await supabaseAdmin.from('contratos').select(CAMPOS).in('lead_id', leadIds).order('criado_em', { ascending: false }).limit(1000);
    if (error) return { lista: [], disponivel: false };
    return { lista: linhas || [], disponivel: true };
}

// O contrato que representa o cliente: o assinado mais recente, senão o enviado, senão o rascunho
function contratoRelevante(contratos) {
    for (const e of ['assinado', 'enviado', 'rascunho']) { const c = contratos.find((x) => x.estado === e); if (c) return c; }
    return null;
}

async function listarClientes() {
    const { data: leads, error } = await supabaseAdmin.from('leads').select('id, empresa_id, actualizado_em').eq('estado', 'negocio_fechado').limit(500);
    if (error) throw new Error(error.message);
    const ids = (leads || []).map((l) => l.id), empresasIds = [...new Set((leads || []).map((l) => l.empresa_id))];
    const lotes = (arr, n = 100) => { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; };
    const empresas = new Map(), ganhos = new Map();
    for (const parte_ of lotes(empresasIds)) { const { data: d } = await supabaseAdmin.from('empresas').select('id, nome, pais, website').in('id', parte_); (d || []).forEach((e) => empresas.set(e.id, e)); }
    for (const parte_ of lotes(ids)) {
        const { data: d } = await supabaseAdmin.from('negocios').select('lead_id, valor, moeda, fechado_em').in('lead_id', parte_).eq('estado', 'ganho');
        (d || []).forEach((n) => { const a = ganhos.get(n.lead_id); if (!a || String(n.fechado_em) > String(a.fechado_em)) ganhos.set(n.lead_id, n); });
    }
    const { lista: contratos, disponivel } = await contratosDe(ids);
    const clientes = (leads || []).map((l) => {
        const meus = contratos.filter((c) => c.lead_id === l.id);
        const rel = contratoRelevante(meus), g = ganhos.get(l.id);
        const fim = rel?.fim_previsto || null;
        return {
            lead_id: l.id, empresa: empresas.get(l.empresa_id) ? { id: l.empresa_id, nome: empresas.get(l.empresa_id).nome, pais: empresas.get(l.empresa_id).pais || null, website: empresas.get(l.empresa_id).website || null } : { id: l.empresa_id, nome: null },
            cliente_desde: g?.fechado_em || l.actualizado_em || null, valor_ganho: g ? Number(g.valor) : null, moeda_ganho: g?.moeda || null,
            contrato_estado: rel?.estado || 'sem_contrato', contrato: rel ? resumoContrato(rel) : null, contratos: meus.length,
            inicio: rel?.inicio || null, fim_previsto: fim, dias_para_fim: rel?.estado === 'assinado' ? diasAte(fim) : null
        };
    }).sort((a, b) => String(a.empresa.nome).localeCompare(String(b.empresa.nome), 'pt', { sensitivity: 'base' }));
    const conta = (e) => clientes.filter((c) => c.contrato_estado === e).length;
    // contratos enviados, à espera do assinado (todos, mesmo que o cliente já tenha outro contrato assinado)
    const nomeDaEmpresa = (leadId) => clientes.find((c) => c.lead_id === leadId)?.empresa.nome || null;
    const por_assinar = contratos.filter((c) => c.estado === 'enviado').map((c) => ({ id: c.id, numero: nomeContrato(c), titulo: c.titulo, lead_id: c.lead_id, empresa: nomeDaEmpresa(c.lead_id), enviado_em: c.enviado_em || null }))
        .sort((a, b) => String(a.empresa).localeCompare(String(b.empresa), 'pt', { sensitivity: 'base' }));
    return { clientes, por_assinar, contratos_disponivel: disponivel, resumo: { total: clientes.length, sem_contrato: conta('sem_contrato'), rascunho: conta('rascunho'), enviado: conta('enviado'), assinado: conta('assinado'), a_terminar: clientes.filter((c) => c.dias_para_fim != null && c.dias_para_fim <= 60).length } };
}

async function lerCliente(leadId) {
    if (!UUID.test(String(leadId || ''))) throw erro('NAO_ENCONTRADA', 'Cliente não encontrado.');
    const { data: lead } = await supabaseAdmin.from('leads').select('id, estado, empresa_id, analise, servico_interesse').eq('id', leadId).maybeSingle();
    if (!lead) throw erro('NAO_ENCONTRADA', 'Cliente não encontrado.');
    if (lead.estado !== 'negocio_fechado') throw erro('CLIENTE_ESTADO', 'Só se criam contratos para clientes (negócio fechado).', { estado: lead.estado });
    return lead;
}

async function obterCliente(leadId) {
    const lead = await lerCliente(leadId);
    const [{ data: empresa }, { data: decisores }, { lista: contratos, disponivel }] = await Promise.all([
        supabaseAdmin.from('empresas').select('id, nome, pais, website, idioma').eq('id', lead.empresa_id).maybeSingle(),
        supabaseAdmin.from('decisores').select('id, nome, cargo, email').eq('empresa_id', lead.empresa_id),
        contratosDe([lead.id])
    ]);
    let propostas = [];
    try { propostas = (await proposta.listarPropostas({ leadId: lead.id })).map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo, estado: p.estado, criado_em: p.criado_em, moeda: p.moeda, totais: p.totais })); } catch { propostas = []; }
    const rel = contratoRelevante(contratos);
    const contratados = [...new Set(contratos.filter((c) => c.estado !== 'rascunho').flatMap((c) => c.dados.itens.map((i) => i.servico)))];
    if (!contratados.length) {                                                // sem contrato ainda: os serviços da proposta enviada
        const enviada = (await supabaseAdmin.from('propostas').select('dados, estado').eq('lead_id', lead.id).eq('estado', 'enviada').limit(5)).data || [];
        enviada.forEach((p) => p.dados.itens.forEach((i) => contratados.push(i.servico)));
    }
    const analise = (lead.analise?.servicos || []).map((s) => s?.servico).filter(Boolean);
    return {
        lead_id: lead.id, empresa: empresa || { id: lead.empresa_id }, decisores: decisores || [], contratos_disponivel: disponivel,
        contratos: contratos.map(resumoContrato), propostas,
        sugestoes: sugerirPropostas({ contratados, analise, fimEm: rel?.estado === 'assinado' ? diasAte(rel.fim_previsto) : null }), contratados
    };
}

// Dados iniciais do formulário de um contrato novo: a proposta escolhida (ou a mais recente enviada), os dados do cliente do último contrato e os do Prestador
async function prepararContrato(leadId, propostaId) {
    const lead = await lerCliente(leadId);
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nome, pais, idioma').eq('id', lead.empresa_id).maybeSingle();
    const { data: decisores } = await supabaseAdmin.from('decisores').select('nome, cargo, email').eq('empresa_id', lead.empresa_id).limit(1);
    const def = defeitos();
    let p = null;
    if (propostaId) { if (!UUID.test(String(propostaId))) throw erro('NAO_ENCONTRADA', 'Proposta não encontrada.'); p = (await supabaseAdmin.from('propostas').select('id, numero, criado_em, dados, lead_id').eq('id', propostaId).maybeSingle()).data; if (!p || p.lead_id !== lead.id) throw erro('NAO_ENCONTRADA', 'Proposta não encontrada.'); }
    else p = ((await supabaseAdmin.from('propostas').select('id, numero, criado_em, dados, lead_id, estado').eq('lead_id', lead.id).eq('estado', 'enviada').order('criado_em', { ascending: false }).limit(1)).data || [])[0] || null;
    const { lista: anteriores } = await contratosDe([lead.id]);
    const ultimo = anteriores[0]?.dados;
    const pd = p?.dados;
    const idioma = IDIOMAS.includes(pd?.idioma) ? pd.idioma : (IDIOMAS.includes(ultimo?.idioma) ? ultimo.idioma : (IDIOMAS.includes(empresa?.idioma) ? empresa.idioma : 'pt'));
    const decisor = (decisores || [])[0] || {};
    return {
        proposta_id: p?.id || null,
        dados: {
            idioma, titulo: pd?.titulo || ultimo?.titulo || '', prestador: { ...def.prestador, ...(ultimo?.prestador || {}) },
            cliente: ultimo?.cliente || { nome: empresa?.nome || '', nif: '', morada: '', pais: empresa?.pais || '', representante: pd?.destinatario?.nome || decisor.nome || '', cargo: pd?.destinatario?.cargo || decisor.cargo || '', email: decisor.email || '' },
            itens: pd?.itens || [], moeda: pd?.moeda || 'EUR', iva: pd?.iva || 'mais_iva', desconto_pct: pd?.desconto_pct || 0,
            inicio: pd?.inicio || '', duracao_meses: pd?.duracao_meses || 0, renovacao: 'nenhuma', aviso_dias: 30, prazo_aprovacao_dias: 5, revisoes: 2, confidencialidade_anos: 3,
            pagamento: { plano: '', entrada_pct: 50, metodo: METODO[idioma], iban: def.iban || '', prazo_dias: 8 }, dados_pessoais: true, clausulas_extra: [],
            foro: def.foro, local: def.local, proposta_numero: p ? proposta.nomeProposta(p) : ''
        }
    };
}

function validarComLead(entrada) { return validarContrato(entrada); }

async function criarContrato(leadId, entrada, utilizador) {
    const lead = await lerCliente(leadId);
    const dados = validarComLead(entrada);
    let propostaId = null;
    if (UUID.test(String(entrada?.proposta_id || ''))) { const { data: p } = await supabaseAdmin.from('propostas').select('id, lead_id').eq('id', entrada.proposta_id).maybeSingle(); if (p && p.lead_id === lead.id) propostaId = p.id; }
    const { data: linhaNova, error } = await supabaseAdmin.from('contratos').insert({
        lead_id: lead.id, empresa_id: lead.empresa_id, proposta_id: propostaId, titulo: dados.titulo, idioma: dados.idioma, estado: 'rascunho', dados,
        inicio: dados.inicio, fim_previsto: fimPrevisto(dados), criada_por: utilizador?.id || null
    }).select(CAMPOS).single();
    if (error) { console.error('Registo do contrato:', error.message); throw erro('CONFIG', BD_NAO_PRONTA); }
    return { ...resumoContrato(linhaNova), dados: linhaNova.dados, pendentes: pendentes(dados) };
}

async function obterContrato(id) {
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Contrato não encontrado.');
    const { data: c, error } = await supabaseAdmin.from('contratos').select(CAMPOS).eq('id', id).maybeSingle();
    if (error) throw erro('CONFIG', BD_NAO_PRONTA);
    if (!c) throw erro('NAO_ENCONTRADA', 'Contrato não encontrado.');
    return c;
}
async function contratoCompleto(id) {
    const c = await obterContrato(id);
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nome, pais, website').eq('id', c.empresa_id).maybeSingle();
    return { ...resumoContrato(c), dados: c.dados, empresa: empresa || null, pendentes: pendentes(c.dados) };
}

async function atualizarContrato(id, entrada) {
    const c = await obterContrato(id);
    if (c.estado !== 'rascunho') throw erro('CONTRATO_BLOQUEADO', 'O contrato já foi emitido: reabra-o como rascunho para o editar.', { estado: c.estado });
    const dados = validarComLead(entrada);
    const { data: nova, error } = await supabaseAdmin.from('contratos').update({ titulo: dados.titulo, idioma: dados.idioma, dados, inicio: dados.inicio, fim_previsto: fimPrevisto(dados), atualizado_em: new Date().toISOString() }).eq('id', id).select(CAMPOS).single();
    if (error) throw new Error(error.message);
    return { ...resumoContrato(nova), dados: nova.dados, pendentes: pendentes(nova.dados) };
}

async function removerFicheiro(caminho) {
    if (!caminho) return;
    try { await supabaseAdmin.storage.from(BUCKET).remove([caminho]); } catch (e) { console.error('Remoção do contrato assinado:', String(e.message).slice(0, 200)); }
}

async function apagarContrato(id) {
    const c = await obterContrato(id);
    await removerFicheiro(c.ficheiro_path);
    const { error } = await supabaseAdmin.from('contratos').delete().eq('id', id);
    if (error) throw new Error(error.message);
}

// «Enviado»: o contrato está emitido e segue para o cliente (o envio faz-se por fora, em PDF)
async function marcarEnviado(id) {
    const c = await obterContrato(id);
    if (c.estado !== 'rascunho') throw erro('CONTRATO_BLOQUEADO', 'O contrato já foi emitido.', { estado: c.estado });
    const falta = pendentes(c.dados);
    if (falta.length) throw erro('INVALIDO', 'Faltam dados para emitir o contrato: preencha as partes (nome, NIF, morada e representante) e a data de início.', { faltam: falta });
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from('contratos').update({ estado: 'enviado', enviado_em: agora, atualizado_em: agora }).eq('id', id);
    if (error) throw new Error(error.message);
    return contratoCompleto(id);
}

async function reabrirContrato(id) {
    const c = await obterContrato(id);
    if (c.estado === 'rascunho') return contratoCompleto(id);
    if (c.estado === 'assinado' || c.ficheiro_path) throw erro('CONTRATO_BLOQUEADO', 'O contrato já está assinado: remova primeiro o ficheiro assinado.', { estado: c.estado });
    const { error } = await supabaseAdmin.from('contratos').update({ estado: 'rascunho', enviado_em: null, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    return contratoCompleto(id);
}

// Tipo do ficheiro pelo conteúdo (não pelo nome nem pelo tipo que o browser declara)
function tipoDoFicheiro(buf) {
    if (buf.length > 4 && buf.slice(0, 5).toString('latin1') === '%PDF-') return { tipo: 'application/pdf', ext: 'pdf' };
    if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { tipo: 'image/png', ext: 'png' };
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { tipo: 'image/jpeg', ext: 'jpg' };
    return null;
}

// corpo: { nome, dados (base64, com ou sem «data:...;base64,»), data_assinatura }
async function anexarAssinado(id, corpo = {}) {
    const c = await obterContrato(id);
    const base64 = String(corpo.dados || '').replace(/^data:[^;]*;base64,/, '').replace(/\s+/g, '');
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw erro('INVALIDO', 'Escolha o ficheiro do contrato assinado.');
    const buf = Buffer.from(base64, 'base64');
    if (buf.length > MAX_FICHEIRO) throw erro('INVALIDO', 'O ficheiro é demasiado grande (máximo 10 MB).');
    const tipo = tipoDoFicheiro(buf);
    if (!tipo) throw erro('INVALIDO', 'O ficheiro tem de ser um PDF, PNG ou JPG.');
    const quando = data(corpo.data_assinatura || new Date().toISOString().slice(0, 10), 'data de assinatura');
    if (quando > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) throw erro('INVALIDO', 'A data de assinatura não pode estar no futuro.');
    const nome = linha(corpo.nome, 120).replace(/[\\/:*?"<>|]+/g, ' ').trim() || `contrato.${tipo.ext}`;
    const caminhoAntigo = c.ficheiro_path, enviadoAntes = c.enviado_em;       // guardados antes de atualizar
    const caminho = `${c.id}/${Date.now()}.${tipo.ext}`;
    const { error: e1 } = await supabaseAdmin.storage.from(BUCKET).upload(caminho, buf, { contentType: tipo.tipo, upsert: false });
    if (e1) { console.error('Upload do contrato assinado:', String(e1.message).slice(0, 200)); throw erro('CONFIG', ARMAZENAMENTO_NAO_PRONTO); }
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from('contratos').update({ estado: 'assinado', assinado_em: quando, enviado_em: enviadoAntes || agora, ficheiro_path: caminho, ficheiro_nome: nome, ficheiro_tipo: tipo.tipo, atualizado_em: agora }).eq('id', id);
    if (error) { await removerFicheiro(caminho); throw new Error(error.message); }
    if (caminhoAntigo) await removerFicheiro(caminhoAntigo);
    return contratoCompleto(id);
}

async function removerAssinado(id) {
    const c = await obterContrato(id);
    if (!c.ficheiro_path) throw erro('NAO_ENCONTRADA', 'Este contrato não tem ficheiro assinado.');
    await removerFicheiro(c.ficheiro_path);
    const { error } = await supabaseAdmin.from('contratos').update({ estado: 'enviado', assinado_em: null, ficheiro_path: null, ficheiro_nome: null, ficheiro_tipo: null, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    return contratoCompleto(id);
}

// Ligação temporária (2 minutos) para abrir o contrato assinado
async function ligacaoAssinado(id) {
    const c = await obterContrato(id);
    if (!c.ficheiro_path) throw erro('NAO_ENCONTRADA', 'Este contrato não tem ficheiro assinado.');
    const { data: d, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(c.ficheiro_path, 120);
    if (error || !d?.signedUrl) throw erro('CONFIG', ARMAZENAMENTO_NAO_PRONTO);
    return { url: d.signedUrl, nome: c.ficheiro_nome || 'contrato' };
}

module.exports = {
    defeitos, validarContrato, totais, tipoContrato, fimPrevisto, somarMeses, pendentes, sugerirPropostas, COMPLEMENTOS, nomeContrato,
    listarClientes, obterCliente, prepararContrato, criarContrato, contratoCompleto, atualizarContrato, apagarContrato, marcarEnviado, reabrirContrato,
    anexarAssinado, removerAssinado, ligacaoAssinado, tipoDoFicheiro, IDIOMAS, ESTADOS, PLANOS
};

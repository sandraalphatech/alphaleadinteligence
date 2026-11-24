// Tarefas (página «Tarefas»): a lista de todas as tarefas de todos os leads, para as quatro vistas (Lista, Prazo, Planeador e Calendário).
// Criar, alterar (prazo, responsável, tipo, coluna do planeador, concluir) e apagar usam as funções que já existem no pipeline
// (pipeline.service.js), por isso as regras e as validações são as mesmas em todo o lado.
//  - As tarefas automáticas (origem «automatica») vêm do estado dos leads: ver task-automation.service.js.
//  - A coluna do planeador (planeamento) pode ainda não existir na base de dados (database/tasks.sql por correr): a lista funciona
//    na mesma, com tudo em «não planeado», e diz que o planeador ainda não está pronto.
const { supabaseAdmin } = require('./supabase.service');
const pipeline = require('./pipeline.service');
const { escaparPesquisa } = pipeline;

const ESTADOS = ['aberta', 'concluida', 'todas'];
const MAX_TAREFAS = 2000;
const UUID = /^[0-9a-f-]{36}$/i;
const emLotes = (lista, n = 100) => { const r = []; for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n)); return r; };
const COLUNAS = 'id, lead_id, empresa_id, titulo, tipo, prazo, responsavel_id, origem, criada_por, concluida_em, criado_em';
const COLUNAS_NOVAS = 'planeamento, hora';

// filtros: estado (aberta | concluida | todas), responsavel (um id | «eu» | «nenhum»), criada_por (um id | «eu»), q (texto)
async function listarTarefas(filtros = {}, utilizador = {}) {
    const estado = ESTADOS.includes(filtros.estado) ? filtros.estado : 'aberta';
    const quem = (v) => (v === 'eu' ? utilizador.id : UUID.test(String(v || '')) ? v : null);
    const consulta = (colunas) => {
        let q = supabaseAdmin.from('tarefas').select(colunas).order('prazo', { ascending: true }).limit(MAX_TAREFAS);
        if (estado === 'aberta') q = q.is('concluida_em', null);
        else if (estado === 'concluida') q = q.not('concluida_em', 'is', null);
        if (filtros.responsavel === 'nenhum') q = q.is('responsavel_id', null);
        else if (quem(filtros.responsavel)) q = q.eq('responsavel_id', quem(filtros.responsavel));
        if (quem(filtros.criada_por)) q = q.eq('criada_por', quem(filtros.criada_por));
        return q;
    };
    let planeamentoDisponivel = true;
    let { data, error } = await consulta(`${COLUNAS}, ${COLUNAS_NOVAS}`);
    if (error && /planeamento|hora/.test(error.message)) { planeamentoDisponivel = false; ({ data, error } = await consulta(COLUNAS)); }
    if (error) throw new Error(error.message);
    let lista = (data || []).map((t) => ({ ...t, planeamento: planeamentoDisponivel ? (t.planeamento || 'nao_planeado') : 'nao_planeado', hora: planeamentoDisponivel && t.hora ? String(t.hora).slice(0, 5) : null }));

    const empresas = new Map(), leads = new Map(), pessoas = new Map();
    for (const parte of emLotes([...new Set(lista.map((t) => t.empresa_id))])) { const { data: d } = await supabaseAdmin.from('empresas').select('id, nome, pais').in('id', parte); (d || []).forEach((e) => empresas.set(e.id, e)); }
    for (const parte of emLotes([...new Set(lista.map((t) => t.lead_id))])) { const { data: d } = await supabaseAdmin.from('leads').select('id, estado').in('id', parte); (d || []).forEach((l) => leads.set(l.id, l)); }
    const { data: us } = await supabaseAdmin.from('utilizadores').select('id, nome').order('nome');
    (us || []).forEach((u) => pessoas.set(u.id, u));

    lista = lista.map((t) => ({
        ...t, empresa: empresas.get(t.empresa_id) ? { id: t.empresa_id, nome: empresas.get(t.empresa_id).nome, pais: empresas.get(t.empresa_id).pais || null } : null,
        lead_estado: leads.get(t.lead_id)?.estado || null, responsavel: t.responsavel_id ? (pessoas.get(t.responsavel_id) || null) : null, criada_por_nome: t.criada_por ? (pessoas.get(t.criada_por)?.nome || null) : null
    }));
    const termo = escaparPesquisa(filtros.q).toLowerCase();
    if (termo) lista = lista.filter((t) => `${t.titulo} ${t.empresa?.nome || ''}`.toLowerCase().includes(termo));

    const hoje = new Date().toISOString().slice(0, 10);
    const abertas = lista.filter((t) => !t.concluida_em);
    return {
        tarefas: lista, equipa: [...pessoas.values()], planeamento_disponivel: planeamentoDisponivel, limite: MAX_TAREFAS,
        contagens: { abertas: abertas.length, atrasadas: abertas.filter((t) => t.prazo < hoje).length, hoje: abertas.filter((t) => t.prazo === hoje).length }
    };
}

// Criar uma tarefa para um lead (o título, o tipo, o prazo e o responsável são validados no pipeline).
const criarTarefa = (corpo, utilizador) => pipeline.criarTarefa(corpo?.lead_id, corpo || {}, utilizador);
const atualizarTarefa = (id, corpo) => pipeline.atualizarTarefa(id, corpo);
const apagarTarefa = (id) => pipeline.apagarTarefa(id);

module.exports = { listarTarefas, criarTarefa, atualizarTarefa, apagarTarefa, ESTADOS, MAX_TAREFAS };

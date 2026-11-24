// Gestão de leads e pipeline comercial (Etapa 7).
//
// O que este módulo faz:
//   - lista os leads com o que importa num quadro ou lista: estado, responsável, próxima tarefa e último contacto;
//   - muda o estado e o responsável de um lead (a base de dados regista cada mudança no histórico);
//   - tarefas de acompanhamento (follow-ups, reuniões, propostas) com prazo e responsável;
//   - registo de interações feitas fora da plataforma (resposta recebida, chamada, reunião, nota interna);
//   - a ficha de um lead com a linha do tempo de tudo o que aconteceu.
//
// Regras: o servidor valida TUDO o que vem do browser (estados, datas, texto, identificadores) e limita tamanhos.
// Quando o lead sai da fase de contacto (respondeu, reunião, proposta...), os follow-ups automáticos deixam de fazer sentido
// e ficam concluídos. Uma resposta recebida passa um lead "contactado" a "respondeu".

const { supabaseAdmin } = require('./supabase.service');
const { SERVICOS } = require('./radar.catalog');

const ESTADOS = ['novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada',
                 'proposta_aceite', 'proposta_recusada', 'negocio_fechado', 'nao_contactar', 'oportunidade_perdida'];
const ESTADOS_FECHADOS = ['proposta_recusada', 'nao_contactar', 'oportunidade_perdida'];     // fora do quadro por defeito
const ESTADOS_ANTES_DA_RESPOSTA = ['novo', 'analisado', 'contactado'];                       // aqui ainda faz sentido um follow-up automático
const TIPOS_TAREFA = ['follow_up', 'reuniao', 'proposta', 'outro'];
const PLANEAMENTOS = ['nao_planeado', 'em_curso', 'esta_semana', 'revisao'];            // as colunas do planeador (página Tarefas)
const google = () => require('./google-calendar.service');
const SQL_TAREFAS = 'A base de dados ainda não está pronta para as tarefas (corra database/tasks.sql).';
const CANAIS = ['email', 'linkedin', 'instagram', 'whatsapp', 'telefone', 'reuniao', 'nota'];
const DIRECOES = ['saida', 'entrada', 'interna'];
const CLASSIFICACOES = ['hot', 'warm', 'cold'];
const MAX_LEADS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });
const texto = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\r/g, '').trim().slice(0, max);
const umaLinha = (v, max) => texto(v, max).replace(/\s+/g, ' ');

// ---------- validações (funções puras) ----------
function dataValida(v, { passadoMax = 3650, futuroMax = 730 } = {}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
    const d = new Date(`${v}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;       // 2026-02-31 não existe
    // compara dias com dias (não a hora de agora com o meio-dia): senão, de manhã, a data de HOJE contava como futura
    const hoje = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const dias = Math.round((d.getTime() - hoje) / 86400000);
    return dias >= -passadoMax && dias <= futuroMax ? v : null;
}

// Pesquisa: o que o utilizador escreve nunca pode alterar a pesquisa (%, _ e , são caracteres especiais)
// A plica vira "_" (um caracter qualquer) para "L'Oréal" continuar a encontrar-se; aspas, ; = < > / e -- (que parecem SQL e são
// bloqueados pela proteção do Supabase) viram espaços.
const escaparPesquisa = (q) => String(q || '').trim().slice(0, 80)
    .replace(/[%_\\,()*"`;=<>/&|!]|--|\/\*/g, ' ')
    .replace(/['’´]/g, '_')
    .replace(/\s+/g, ' ').trim();

const FILTROS_TAREFAS = ['atrasadas', 'hoje', 'semana', 'sem', 'com'];
const FILTROS_CONTACTO = ['nunca', 'ate7', 'mais7', 'mais30'];
const ORDENS = ['pontuacao', 'recente', 'contacto_recente', 'contacto_antigo', 'proxima_tarefa', 'nome'];

function validarFiltros(q = {}) {
    return {
        q: escaparPesquisa(q.q),
        estado: ESTADOS.includes(q.estado) ? q.estado : null,
        servico: SERVICOS.includes(q.servico) ? q.servico : null,
        classificacao: CLASSIFICACOES.includes(q.classificacao) ? q.classificacao : null,
        responsavel: q.responsavel === 'nenhum' ? 'nenhum' : UUID.test(q.responsavel || '') ? q.responsavel : null,
        pais: /^[A-Za-z]{2}$/.test(q.pais || '') ? q.pais.toUpperCase() : null,                  // código ISO do país (PT, ES, BR...)
        setor: /^[a-z0-9_]{2,40}$/i.test(q.setor || '') ? q.setor.toLowerCase() : null,
        tarefas: FILTROS_TAREFAS.includes(q.tarefas) ? q.tarefas : null,
        contacto: FILTROS_CONTACTO.includes(q.contacto) ? q.contacto : null,
        ordem: ORDENS.includes(q.ordem) ? q.ordem : 'pontuacao'
    };
}

function validarMudanca(b = {}) {
    const mudanca = {};
    if ('estado' in b) {
        if (!ESTADOS.includes(b.estado)) throw erro('INVALIDO', 'Estado inválido.');
        mudanca.estado = b.estado;
    }
    if ('responsavel_id' in b) {
        if (b.responsavel_id !== null && !UUID.test(String(b.responsavel_id))) throw erro('INVALIDO', 'Responsável inválido.');
        mudanca.responsavel_id = b.responsavel_id;
    }
    if (!Object.keys(mudanca).length) throw erro('VAZIO', 'Nada para alterar.');
    return mudanca;
}

// «HH:MM» (24 h); vazio = sem hora
function horaValida(v) { const s = String(v || '').trim(); return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null; }

function validarTarefa(b = {}, { parcial = false } = {}) {
    const t = {};
    if (!parcial || 'titulo' in b) { t.titulo = umaLinha(b.titulo, 120); if (!t.titulo) throw erro('VAZIO', 'Falta o título da tarefa.'); }
    if (!parcial || 'tipo' in b) { t.tipo = b.tipo || 'follow_up'; if (!TIPOS_TAREFA.includes(t.tipo)) throw erro('INVALIDO', 'Tipo de tarefa inválido.'); }
    if (!parcial || 'prazo' in b) { t.prazo = dataValida(b.prazo); if (!t.prazo) throw erro('INVALIDO', 'Data inválida.'); }
    if ('responsavel_id' in b) {
        if (b.responsavel_id !== null && !UUID.test(String(b.responsavel_id))) throw erro('INVALIDO', 'Responsável inválido.');
        t.responsavel_id = b.responsavel_id;
    }
    if ('planeamento' in b) { if (!PLANEAMENTOS.includes(b.planeamento)) throw erro('INVALIDO', 'Planeamento inválido.'); t.planeamento = b.planeamento; }
    if ('hora' in b) { t.hora = horaValida(b.hora); if (b.hora && !t.hora) throw erro('INVALIDO', 'Hora inválida.'); }
    return t;
}

function validarInteraccao(b = {}) {
    if (!CANAIS.includes(b.canal)) throw erro('INVALIDO', 'Canal inválido.');
    const direcao = DIRECOES.includes(b.direcao) ? b.direcao : (b.canal === 'nota' ? 'interna' : 'saida');
    const conteudo = texto(b.conteudo, 4000);
    if (!conteudo) throw erro('VAZIO', 'Escreva o que aconteceu.');
    // só datas até hoje (com 1 dia de folga: quem está num fuso à frente do UTC já está no dia seguinte)
    const quando = b.data ? dataValida(b.data, { passadoMax: 3650, futuroMax: 1 }) : null;
    if (b.data && !quando) throw erro('INVALIDO', 'Data inválida.');
    return {
        canal: b.canal, direcao, conteudo, assunto: umaLinha(b.assunto, 150) || null,
        tipo: direcao === 'entrada' ? 'resposta' : direcao === 'interna' ? 'nota' : 'outro',
        // hoje (ou "amanhã" por causa do fuso): a hora real, para ficar na ordem certa da linha do tempo; dias passados: o meio-dia dessa data
        ocorrida_em: quando && quando < new Date().toISOString().slice(0, 10) ? new Date(`${quando}T12:00:00Z`).toISOString() : new Date().toISOString()
    };
}

// ---------- lista de leads ----------
// Junta, em memória, os leads com as tarefas abertas e as interações (um só pedido para cada, em vez de um por lead).
function resumirLeads(leads, tarefas, interaccoes, equipa) {
    const nomes = new Map(equipa.map((u) => [u.id, u.nome]));
    const proxima = new Map(), abertas = new Map();
    for (const t of tarefas) {
        abertas.set(t.lead_id, (abertas.get(t.lead_id) || 0) + 1);
        const atual = proxima.get(t.lead_id);
        if (!atual || t.prazo < atual.prazo) proxima.set(t.lead_id, t);
    }
    const ultima = new Map(), total = new Map();
    for (const i of interaccoes) {                                   // já vêm da mais recente para a mais antiga
        total.set(i.lead_id, (total.get(i.lead_id) || 0) + 1);
        if (!ultima.has(i.lead_id)) ultima.set(i.lead_id, i);
    }
    return leads.map((l) => ({
        id: l.id, estado: l.estado, servico_interesse: l.servico_interesse, pontuacao: l.pontuacao, classificacao: l.classificacao,
        actualizado_em: l.actualizado_em, empresa: l.empresas,
        responsavel: l.responsavel_id ? { id: l.responsavel_id, nome: nomes.get(l.responsavel_id) || null } : null,
        proxima_tarefa: proxima.has(l.id) ? { id: proxima.get(l.id).id, titulo: proxima.get(l.id).titulo, tipo: proxima.get(l.id).tipo, prazo: proxima.get(l.id).prazo } : null,
        tarefas_abertas: abertas.get(l.id) || 0,
        ultima_interaccao: ultima.has(l.id) ? { ocorrida_em: ultima.get(l.id).ocorrida_em, canal: ultima.get(l.id).canal, direcao: ultima.get(l.id).direcao } : null,
        interaccoes: total.get(l.id) || 0
    }));
}

// Filtros que dependem das tarefas e das interações (por isso só se aplicam depois de as juntar aos leads).
// "hoje" é o dia de hoje; as tarefas atrasadas são as que têm o prazo antes de hoje.
function aplicarFiltrosMemoria(leads, f, agora = Date.now()) {
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const daquiA7 = new Date(agora + 7 * 86400000).toISOString().slice(0, 10);
    const dias = (l) => (l.ultima_interaccao ? Math.floor((agora - new Date(l.ultima_interaccao.ocorrida_em).getTime()) / 86400000) : null);
    return leads.filter((l) => {
        const prazo = l.proxima_tarefa?.prazo;
        if (f.tarefas === 'atrasadas' && !(prazo && prazo < hoje)) return false;
        if (f.tarefas === 'hoje' && prazo !== hoje) return false;
        if (f.tarefas === 'semana' && !(prazo && prazo >= hoje && prazo <= daquiA7)) return false;
        if (f.tarefas === 'sem' && l.tarefas_abertas > 0) return false;
        if (f.tarefas === 'com' && !(l.tarefas_abertas > 0)) return false;
        const d = dias(l);
        if (f.contacto === 'nunca' && d !== null) return false;
        if (f.contacto === 'ate7' && !(d !== null && d <= 7)) return false;
        if (f.contacto === 'mais7' && !(d !== null && d > 7)) return false;
        if (f.contacto === 'mais30' && !(d !== null && d > 30)) return false;
        return true;
    });
}

// Ordenação (sempre estável: em caso de empate, mantém-se a ordem da pontuação)
function ordenarLeads(leads, ordem = 'pontuacao') {
    const quando = (l) => (l.ultima_interaccao ? new Date(l.ultima_interaccao.ocorrida_em).getTime() : null);
    const chaves = {
        pontuacao: (a, b) => (b.pontuacao ?? -1) - (a.pontuacao ?? -1),
        recente: (a, b) => new Date(b.actualizado_em || 0) - new Date(a.actualizado_em || 0),
        contacto_recente: (a, b) => (quando(b) ?? -Infinity) - (quando(a) ?? -Infinity),                 // quem nunca foi contactado fica no fim
        contacto_antigo: (a, b) => (quando(a) ?? Infinity) - (quando(b) ?? Infinity),                     // o contacto mais antigo primeiro (quem nunca foi contactado fica no fim)
        proxima_tarefa: (a, b) => String(a.proxima_tarefa?.prazo || '9999').localeCompare(String(b.proxima_tarefa?.prazo || '9999')),
        nome: (a, b) => String(a.empresa?.nome || '').localeCompare(String(b.empresa?.nome || ''), 'pt', { sensitivity: 'base' })
    };
    const comparar = chaves[ordem] || chaves.pontuacao;
    return leads.map((l, i) => [l, i]).sort((x, y) => (Number.isNaN(comparar(x[0], y[0])) ? 0 : comparar(x[0], y[0])) || x[1] - y[1]).map(([l]) => l);
}

async function listarEquipa() {
    const { data, error } = await supabaseAdmin.from('utilizadores').select('id, nome, papel').order('nome');
    if (error) throw new Error(error.message);
    return data || [];
}

async function listarLeads(entrada) {
    const f = validarFiltros(entrada);
    let q = supabaseAdmin.from('leads')
        .select('id, estado, servico_interesse, pontuacao, classificacao, responsavel_id, actualizado_em, empresas!inner(id, nome, pais, sector, tipo_empresa, nao_contactar)')
        .order('pontuacao', { ascending: false, nullsFirst: false }).order('actualizado_em', { ascending: false }).limit(MAX_LEADS);
    if (f.estado) q = q.eq('estado', f.estado);
    if (f.servico) q = q.eq('servico_interesse', f.servico);
    if (f.classificacao) q = q.eq('classificacao', f.classificacao);
    if (f.responsavel === 'nenhum') q = q.is('responsavel_id', null);
    else if (f.responsavel) q = q.eq('responsavel_id', f.responsavel);
    if (f.q) q = q.ilike('empresas.nome', `%${f.q}%`);
    if (f.pais) q = q.eq('empresas.pais', f.pais);
    if (f.setor) q = q.eq('empresas.sector', f.setor);

    const [leads, tarefas, interaccoes, equipa, empresas] = await Promise.all([
        q,
        supabaseAdmin.from('tarefas').select('id, lead_id, titulo, tipo, prazo').is('concluida_em', null),
        supabaseAdmin.from('interaccoes').select('lead_id, ocorrida_em, canal, direcao').order('ocorrida_em', { ascending: false }).limit(5000),
        listarEquipa(),
        supabaseAdmin.from('empresas').select('pais, sector').limit(5000)              // para as opções dos filtros de país e de setor
    ]);
    for (const r of [leads, tarefas, interaccoes]) if (r.error) throw new Error(r.error.message);
    const resumidos = resumirLeads(leads.data, tarefas.data, interaccoes.data, equipa);
    const distintos = (campo) => [...new Set((empresas.data || []).map((e) => e[campo]).filter(Boolean))].sort();
    return {
        leads: ordenarLeads(aplicarFiltrosMemoria(resumidos, f), f.ordem), equipa, limite: MAX_LEADS,
        facetas: { paises: distintos('pais'), setores: distintos('sector') }
    };
}

// ---------- ficha do lead ----------
async function obterLead(id) {
    if (!UUID.test(String(id))) return null;
    const { data: lead, error } = await supabaseAdmin.from('leads')
        .select('id, empresa_id, estado, servico_interesse, pontuacao, classificacao, responsavel_id, actualizado_em, criado_em, analise, empresas(id, nome, website, pais, sector, tipo_empresa, sobre, nao_contactar, email_geral)')
        .eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) return null;
    const [decisores, interaccoes, tarefas, historico, equipa] = await Promise.all([
        supabaseAdmin.from('decisores').select('id, nome, cargo, linkedin_url').eq('empresa_id', lead.empresa_id).limit(10),
        supabaseAdmin.from('interaccoes').select('id, canal, direcao, tipo, destinatario, assunto, conteudo, metodo, resultado, gerado_por_ia, utilizador_id, ocorrida_em').eq('lead_id', id).order('ocorrida_em', { ascending: false }).limit(200),
        supabaseAdmin.from('tarefas').select('id, titulo, tipo, prazo, responsavel_id, origem, concluida_em').eq('lead_id', id).order('prazo', { ascending: true }).limit(100),
        supabaseAdmin.from('historico').select('campo, valor_antigo, valor_novo, origem, criado_em').eq('entidade', 'lead').eq('entidade_id', id).in('campo', ['estado', 'responsavel_id']).order('criado_em', { ascending: false }).limit(60),
        listarEquipa()
    ]);
    for (const r of [decisores, interaccoes, tarefas]) if (r.error) throw new Error(r.error.message);
    const a = lead.analise || {};
    const { analise, ...resto } = lead;
    return {
        ...resto,
        analise: { resumo: a.resumo || null, servicos: a.servicos || [], abordagem: a.abordagem || null, duvidas: a.duvidas || [] },
        decisores: decisores.data, interaccoes: interaccoes.data, tarefas: tarefas.data,
        historico: historico.error ? [] : historico.data, equipa
    };
}

async function lerLead(id) {
    if (!UUID.test(String(id))) return null;
    const { data, error } = await supabaseAdmin.from('leads').select('id, empresa_id, estado, responsavel_id').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

async function verificarResponsavel(id) {
    if (id === null || id === undefined) return;
    const { data } = await supabaseAdmin.from('utilizadores').select('id').eq('id', id).maybeSingle();
    if (!data) throw erro('INVALIDO', 'Responsável inválido.');
}

// Quando o lead avança para além da fase de contacto, o follow-up automático já não faz sentido
async function fecharFollowupsAutomaticos(leadId) {
    await supabaseAdmin.from('tarefas').update({ concluida_em: new Date().toISOString() })
        .eq('lead_id', leadId).eq('tipo', 'follow_up').eq('origem', 'automatica').is('concluida_em', null);
}

async function mudarLead(id, corpo, utilizador) {
    const mudanca = validarMudanca(corpo);
    const antes = await lerLead(id);
    if (!antes) throw erro('NAO_ENCONTRADA', 'Lead não encontrado.');
    if ('responsavel_id' in mudanca) await verificarResponsavel(mudanca.responsavel_id);
    const estadoAntes = antes.estado;
    // reunião agendada: dia e hora da reunião (opcionais; sem eles a tarefa fica para hoje)
    let reuniao = null;
    if (mudanca.estado === 'reuniao_agendada' && (corpo.reuniao_data || corpo.reuniao_hora)) {
        const data = corpo.reuniao_data ? dataValida(corpo.reuniao_data, { passadoMax: 0 }) : null;
        if (corpo.reuniao_data && !data) throw erro('INVALIDO', 'Data inválida.');
        if (corpo.reuniao_hora && !horaValida(corpo.reuniao_hora)) throw erro('INVALIDO', 'Hora inválida.');
        reuniao = { data, hora: horaValida(corpo.reuniao_hora) };
    }
    const { data, error } = await supabaseAdmin.from('leads').update({ ...mudanca, ultima_origem: 'pipeline' }).eq('id', id)
        .select('id, estado, responsavel_id').single();
    if (error) { if (error.code === '23514' && mudanca.estado === 'enviar_proposta') throw erro('CONFIG', SQL_TAREFAS); throw new Error(error.message); }
    if (mudanca.estado && !ESTADOS_ANTES_DA_RESPOSTA.includes(mudanca.estado)) await fecharFollowupsAutomaticos(id);
    // as tarefas automáticas deste estado (ver task-automation.service.js)
    if (mudanca.estado && mudanca.estado !== estadoAntes) {
        try { await require('./task-automation.service').aoMudarEstado({ id, empresa_id: antes.empresa_id }, mudanca.estado, { utilizador, reuniao }); }
        catch (e) { console.error('Tarefas automáticas:', String(e.message).slice(0, 200)); }
    }
    // negócio fechado / perdido no lead: o negócio acompanha (se a tabela dos negócios ainda não existe, a mudança do lead funciona na mesma)
    if (mudanca.estado && mudanca.estado !== estadoAntes) {
        try { await require('./deal.service').sincronizarComLead({ id, empresa_id: antes.empresa_id }, mudanca.estado, utilizador); }
        catch (e) { console.error('Negócio do lead:', String(e.message).slice(0, 200)); }
    }
    return data;
}

// ---------- tarefas ----------
async function criarTarefa(leadId, corpo, utilizador) {
    const t = validarTarefa(corpo);
    const lead = await lerLead(leadId);
    if (!lead) throw erro('NAO_ENCONTRADA', 'Lead não encontrado.');
    const responsavel = 'responsavel_id' in t ? t.responsavel_id : utilizador.id;
    await verificarResponsavel(responsavel);
    const { data, error } = await supabaseAdmin.from('tarefas').insert({
        lead_id: lead.id, empresa_id: lead.empresa_id, titulo: t.titulo, tipo: t.tipo, prazo: t.prazo,
        responsavel_id: responsavel, origem: 'manual', criada_por: utilizador.id, ...(t.planeamento && t.planeamento !== 'nao_planeado' ? { planeamento: t.planeamento } : {}), ...(t.hora ? { hora: t.hora } : {})
    }).select('id, titulo, tipo, prazo, responsavel_id, origem, concluida_em').single();
    if (error) { if (/planeamento|hora/.test(error.message)) throw erro('CONFIG', SQL_TAREFAS); throw new Error(error.message); }
    google().aoMudarTarefa(data.id);                       // reuniões e tarefas com hora vão também para o Google Calendar (se estiver ligado)
    return data;
}

async function atualizarTarefa(id, corpo = {}) {
    if (!UUID.test(String(id))) throw erro('NAO_ENCONTRADA', 'Tarefa não encontrada.');
    const mudanca = validarTarefa(corpo, { parcial: true });
    if ('concluida' in corpo) mudanca.concluida_em = corpo.concluida ? new Date().toISOString() : null;
    if (!Object.keys(mudanca).length) throw erro('VAZIO', 'Nada para alterar.');
    if ('responsavel_id' in mudanca) await verificarResponsavel(mudanca.responsavel_id);
    const { data, error } = await supabaseAdmin.from('tarefas').update(mudanca).eq('id', id)
        .select('id, lead_id, titulo, tipo, prazo, responsavel_id, origem, concluida_em').maybeSingle();
    if (error) { if (/planeamento|hora/.test(error.message)) throw erro('CONFIG', SQL_TAREFAS); throw new Error(error.message); }
    if (!data) throw erro('NAO_ENCONTRADA', 'Tarefa não encontrada.');
    google().aoMudarTarefa(id);
    return data;
}

async function apagarTarefa(id) {
    if (!UUID.test(String(id))) throw erro('NAO_ENCONTRADA', 'Tarefa não encontrada.');
    const eventos = await google().eventosDasTarefas([id]);           // o evento do Google sai com a tarefa
    const { error } = await supabaseAdmin.from('tarefas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    eventos.forEach((e) => google().aoApagarTarefa(e.evento));
}

// Tarefas por fazer que vencem até daqui a N dias (as atrasadas vêm primeiro): alimenta o painel "Hoje"
async function tarefasPorFazer({ dias = 3 } = {}) {
    const ate = new Date(Date.now() + Math.min(Math.max(parseInt(dias, 10) || 3, 0), 60) * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin.from('tarefas')
        .select('id, titulo, tipo, prazo, responsavel_id, lead_id, leads(estado), empresas(nome)')
        .is('concluida_em', null).lte('prazo', ate).order('prazo', { ascending: true }).limit(30);
    if (error) throw new Error(error.message);
    return data || [];
}

// ---------- interações registadas à mão ----------
async function registarInteraccao(leadId, corpo, utilizador) {
    const dados = validarInteraccao(corpo);
    const lead = await lerLead(leadId);
    if (!lead) throw erro('NAO_ENCONTRADA', 'Lead não encontrado.');
    const { data, error } = await supabaseAdmin.from('interaccoes').insert({
        lead_id: lead.id, empresa_id: lead.empresa_id, canal: dados.canal, direcao: dados.direcao, tipo: dados.tipo,
        assunto: dados.assunto, conteudo: dados.conteudo, metodo: 'manual', gerado_por_ia: false,
        utilizador_id: utilizador.id, ocorrida_em: dados.ocorrida_em
    }).select('id, canal, direcao, tipo, assunto, conteudo, metodo, utilizador_id, ocorrida_em').single();
    if (error) throw new Error(error.message);

    // uma resposta recebida de um lead "contactado" passa-o a "respondeu" (e o follow-up deixa de ser preciso)
    let estado = lead.estado;
    if (dados.direcao === 'entrada' && lead.estado === 'contactado') {
        const r = await supabaseAdmin.from('leads').update({ estado: 'respondeu', ultima_origem: 'pipeline' }).eq('id', lead.id);
        if (!r.error) {
            estado = 'respondeu'; await fecharFollowupsAutomaticos(lead.id);
            try { await require('./task-automation.service').aoMudarEstado({ id: lead.id, empresa_id: lead.empresa_id }, 'respondeu', { utilizador }); }
            catch (e) { console.error('Tarefas automáticas:', String(e.message).slice(0, 200)); }
        }
    }
    return { interaccao: data, estado };
}

module.exports = {
    ESTADOS, ESTADOS_FECHADOS, TIPOS_TAREFA, PLANEAMENTOS, CANAIS, DIRECOES, UUID,
    dataValida, escaparPesquisa, validarFiltros, aplicarFiltrosMemoria, ordenarLeads, FILTROS_TAREFAS, FILTROS_CONTACTO, ORDENS, validarMudanca, validarTarefa, validarInteraccao, resumirLeads,
    listarLeads, listarEquipa, obterLead, mudarLead, criarTarefa, atualizarTarefa, apagarTarefa, tarefasPorFazer, registarInteraccao
};

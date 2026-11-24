// "Contactar hoje": uma lista única do que há para contactar hoje, por canal, e das respostas que aguardam resposta.
// Usa exatamente as mesmas regras de cada canal (estado do lead, 5 dias entre mensagens, descanso de 90 dias, "não contactar"),
// por isso uma empresa só aparece num canal se, ao abrir esse canal, o envio estiver permitido.
// montarLista() é uma função pura (testável); contactarHoje() vai buscar os dados à base de dados.
const { supabaseAdmin } = require('./supabase.service');
const o = require('./outreach.service');
const li = require('./linkedin.service');
const ig = require('./instagram.service');
const wa = require('./whatsapp.service');

const CANAIS = ['email', 'linkedin', 'instagram', 'whatsapp'];
const LIMITES = { email: o.LIMITE_DIARIO, linkedin: li.LIMITE_DIARIO, instagram: ig.LIMITE_DIARIO, whatsapp: wa.LIMITE_DIARIO };
const pipeline = require('./pipeline.service');
const ESTADOS_ABERTOS = pipeline.ESTADOS.filter((e) => !pipeline.ESTADOS_FECHADOS.includes(e));
const DIAS_RESPOSTA = 14;           // respostas recebidas há mais do que isto já não aparecem aqui
const JANELA_WHATSAPP_MS = 24 * 3600 * 1000;
const MAX_POR_CANAL = 50;
const LOTE = 100;

const bloqueiosReais = (bloqueios) => bloqueios.filter((b) => b.codigo !== 'limite_diario');

// Avalia UM canal de UM lead. Devolve null se não houver nada para fazer hoje, ou { tipo, numero, acao, destinatario }.
function avaliarCanal(canal, ctx, agora) {
    const c = { ...ctx, interaccoes: ctx.interaccoes.filter((i) => i.canal === canal) };
    if (canal === 'email') {
        const { lista, recomendado } = o.listarDestinatarios(c);
        const dest = lista.find((x) => x.id === recomendado);
        if (!dest) return null;
        const r = o.avaliarRegras({ ...c, agora, canal: 'email', usadosHoje: 0 });
        if (bloqueiosReais(r.bloqueios).length) return null;
        return { tipo: r.tipo, numero: r.numero, acao: r.tipo === 'follow_up' ? 'follow_up' : 'email', destinatario: dest.nome || dest.email };
    }
    if (canal === 'linkedin') {
        const { lista, recomendado } = li.listarDestinatarios(c);
        const dest = lista.find((x) => x.id === recomendado);
        if (!dest) return null;
        const r = li.avaliarRegras({ ...c, agora, usadosHoje: 0 });
        if (bloqueiosReais(r.bloqueios).length) return null;
        if (r.passos.convite.ok) return { tipo: r.tipo, numero: r.numero, acao: 'convite', destinatario: dest.nome || null };
        // convite já enviado: só volta a aparecer quando há uma mensagem anterior e o prazo entre mensagens já passou
        if (r.mensagens >= 1 && r.passos.mensagem.ok) return { tipo: 'follow_up', numero: r.numero, acao: 'mensagem', destinatario: dest.nome || null };
        return null;
    }
    if (canal === 'instagram') {
        const { lista, recomendado } = ig.listarDestinatarios(c);
        const dest = lista.find((x) => x.id === recomendado);
        if (!dest) return null;
        const r = o.avaliarRegras({ ...c, agora, canal: 'instagram', usadosHoje: 0, limite: LIMITES.instagram });
        if (bloqueiosReais(r.bloqueios).length) return null;
        return { tipo: r.tipo, numero: r.numero, acao: r.tipo === 'follow_up' ? 'follow_up' : 'dm', destinatario: dest.conta ? '@' + dest.conta : null };
    }
    // whatsapp: a 1.ª mensagem (modelo) e, para quem não respondeu, UM follow-up passados 3 dias úteis
    const { lista, recomendado } = wa.listarDestinatarios(c);
    const dest = lista.find((x) => x.id === recomendado);
    if (!dest) return null;
    const r = wa.avaliarRegras(c, 0, agora);
    if (bloqueiosReais(r.bloqueios).length) return null;
    return { tipo: r.tipo, numero: r.numero, acao: r.tipo === 'follow_up' ? 'follow_up' : 'modelo', destinatario: dest.formatado || null };
}

// leads: [{ id, estado, pontuacao, analise, servico_interesse, empresa_id, empresas: {...} }]
// decisores / interaccoes / tarefas: listas planas (ligadas por empresa_id / lead_id)
function montarLista({ leads, decisores = [], interaccoes = [], tarefas = [], usadosHoje = {}, agora = Date.now() }) {
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const porEmpresa = new Map(), porLead = new Map(), tarefaPorLead = new Map();
    for (const d of decisores) (porEmpresa.get(d.empresa_id) || porEmpresa.set(d.empresa_id, []).get(d.empresa_id)).push(d);
    for (const i of interaccoes) (porLead.get(i.lead_id) || porLead.set(i.lead_id, []).get(i.lead_id)).push(i);
    for (const t of tarefas) if (!t.concluida_em && t.prazo <= hoje && (!tarefaPorLead.has(t.lead_id) || t.prazo < tarefaPorLead.get(t.lead_id).prazo)) tarefaPorLead.set(t.lead_id, t);

    const canais = Object.fromEntries(CANAIS.map((c) => [c, []]));
    const responder = [];
    for (const lead of leads) {
        const empresa = lead.empresas;
        if (!empresa || empresa.nao_contactar) continue;
        const ints = (porLead.get(lead.id) || []).sort((a, b) => new Date(b.ocorrida_em) - new Date(a.ocorrida_em));
        const tarefa = tarefaPorLead.get(lead.id);
        const base = {
            lead_id: lead.id, estado: lead.estado, pontuacao: lead.pontuacao ?? null,
            empresa: { id: empresa.id, nome: empresa.nome, pais: empresa.pais || null },
            tarefa: tarefa ? { titulo: tarefa.titulo, prazo: tarefa.prazo, atrasada: tarefa.prazo < hoje } : null
        };

        // respostas à espera: a última coisa que aconteceu foi uma mensagem DELES, há menos de 14 dias
        const ultima = ints[0];
        if (ultima && ultima.direcao === 'entrada' && ultima.tipo !== 'nota' && agora - new Date(ultima.ocorrida_em).getTime() < DIAS_RESPOSTA * 86400000) {
            const idade = agora - new Date(ultima.ocorrida_em).getTime();
            responder.push({
                ...base, canal: ultima.canal, ocorrida_em: ultima.ocorrida_em,
                excerto: String(ultima.conteudo || '').replace(/\s+/g, ' ').trim().slice(0, 160),
                janela_whatsapp: ultima.canal === 'whatsapp' && idade < JANELA_WHATSAPP_MS
            });
        }

        if (!o.ESTADOS_PERMITIDOS.includes(lead.estado)) continue;                      // os canais só tratam de leads novos, analisados ou contactados
        const ctx = { empresa, decisores: porEmpresa.get(empresa.id) || [], lead, interaccoes: ints };
        for (const canal of CANAIS) {
            const r = avaliarCanal(canal, ctx, agora);
            if (r) canais[canal].push({ ...base, ...r });
        }
    }

    // tarefas atrasadas primeiro, depois as de hoje, depois a pontuação
    const ordem = (a, b) => (!!b.tarefa - !!a.tarefa) || ((b.tarefa?.atrasada ? 1 : 0) - (a.tarefa?.atrasada ? 1 : 0)) ||
        ((a.tipo === 'follow_up' ? 0 : 1) - (b.tipo === 'follow_up' ? 0 : 1)) || ((b.pontuacao ?? -1) - (a.pontuacao ?? -1));
    const resumo = {};
    for (const c of CANAIS) {
        const todos = canais[c].sort(ordem);
        const usados = usadosHoje[c] || 0, restante = Math.max(0, LIMITES[c] - usados);
        resumo[c] = { total: todos.length, usados, limite: LIMITES[c], restante, itens: todos.slice(0, MAX_POR_CANAL) };
    }
    responder.sort((a, b) => new Date(b.ocorrida_em) - new Date(a.ocorrida_em));
    return { canais: resumo, responder, gerado_em: new Date(agora).toISOString() };
}

const emLotes = (lista) => { const r = []; for (let i = 0; i < lista.length; i += LOTE) r.push(lista.slice(i, i + LOTE)); return r; };

async function contactarHoje(utilizador, { agora = Date.now() } = {}) {
    const { data: leads, error } = await supabaseAdmin.from('leads')
        .select('id, estado, pontuacao, analise, servico_interesse, empresa_id, empresas!inner(id, nome, idioma, pais, sector, nao_contactar, email_geral, email_geral_estado, redes)')
        .in('estado', ESTADOS_ABERTOS).eq('empresas.nao_contactar', false)
        .order('pontuacao', { ascending: false, nullsFirst: false }).limit(1000);
    if (error) throw new Error(error.message);
    const lista = leads || [];
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const desde = new Date(agora - 90 * 86400000).toISOString();
    const inicioDia = new Date(agora); inicioDia.setHours(0, 0, 0, 0);

    const lotes = async (ids, campo, consulta) => (await Promise.all(emLotes(ids).map(async (parte) => {
        const { data, error: e } = await consulta(parte);
        if (e) throw new Error(e.message);
        return data || [];
    }))).flat();
    const idsLeads = lista.map((l) => l.id), idsEmpresas = [...new Set(lista.map((l) => l.empresa_id))];
    const [decisores, interaccoes, tarefas, usados] = await Promise.all([
        lotes(idsEmpresas, 'empresa_id', (p) => supabaseAdmin.from('decisores').select('id, empresa_id, nome, cargo, categoria, email, email_estado, linkedin_url, nao_contactar').in('empresa_id', p)),
        lotes(idsLeads, 'lead_id', (p) => supabaseAdmin.from('interaccoes').select('id, lead_id, canal, direcao, tipo, resultado, ocorrida_em, conteudo').in('lead_id', p).gte('ocorrida_em', desde)),
        lotes(idsLeads, 'lead_id', (p) => supabaseAdmin.from('tarefas').select('lead_id, titulo, prazo, concluida_em').in('lead_id', p).is('concluida_em', null).lte('prazo', hoje)),
        supabaseAdmin.from('interaccoes').select('canal').eq('utilizador_id', utilizador.id).eq('direcao', 'saida').neq('tipo', 'resposta').gte('ocorrida_em', inicioDia.toISOString()).then((r) => r.data || [])
    ]);
    const usadosHoje = {};
    for (const u of usados) usadosHoje[u.canal] = (usadosHoje[u.canal] || 0) + 1;
    return montarLista({ leads: lista, decisores, interaccoes, tarefas, usadosHoje, agora });
}

// Quantas respostas estão à espera (as mesmas regras de «Respostas à espera»): a última coisa que aconteceu no lead foi uma mensagem DELES,
// há menos de 14 dias, e o lead continua em aberto e a empresa não está em «não contactar». Leve de propósito: o menu pergunta de minuto a minuto.
let cacheContagem = { ate: 0, valor: null };
async function contarRespostas({ agora = Date.now(), cache = true } = {}) {
    if (cache && agora < cacheContagem.ate && cacheContagem.valor) return cacheContagem.valor;
    const desde = new Date(agora - DIAS_RESPOSTA * 86400000).toISOString();
    const { data: recentes, error } = await supabaseAdmin.from('interaccoes').select('lead_id, canal, direcao, tipo, ocorrida_em').gte('ocorrida_em', desde).order('ocorrida_em', { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    const ultima = new Map();
    for (const i of recentes || []) if (!ultima.has(i.lead_id)) ultima.set(i.lead_id, i);                       // já vêm da mais recente para a mais antiga
    const candidatas = [...ultima.values()].filter((i) => i.direcao === 'entrada' && i.tipo !== 'nota');
    const ids = candidatas.map((i) => i.lead_id);
    const abertos = new Map();
    for (const parte of emLotes(ids)) {
        const { data: leads } = await supabaseAdmin.from('leads').select('id, empresa_id').in('id', parte).in('estado', ESTADOS_ABERTOS);
        (leads || []).forEach((l) => abertos.set(l.id, l.empresa_id));
    }
    const bloqueadas = new Set();
    for (const parte of emLotes([...new Set(abertos.values())])) {
        const { data: empresas } = await supabaseAdmin.from('empresas').select('id').in('id', parte).eq('nao_contactar', true);
        (empresas || []).forEach((e) => bloqueadas.add(e.id));
    }
    const validas = candidatas.filter((i) => abertos.has(i.lead_id) && !bloqueadas.has(abertos.get(i.lead_id)));
    const porCanal = {};
    for (const i of validas) porCanal[i.canal] = (porCanal[i.canal] || 0) + 1;
    const valor = { total: validas.length, por_canal: porCanal, mais_recente: validas[0]?.ocorrida_em || null };
    cacheContagem = { ate: agora + 15000, valor };
    return valor;
}
const limparCacheContagem = () => { cacheContagem = { ate: 0, valor: null }; };

module.exports = { contarRespostas, limparCacheContagem, contactarHoje, montarLista, avaliarCanal, CANAIS, LIMITES, ESTADOS_ABERTOS, DIAS_RESPOSTA, JANELA_WHATSAPP_MS };

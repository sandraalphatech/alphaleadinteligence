// Relatórios comerciais (Etapa 9): atividade, funil e conversões, propostas, serviços, fontes e equipa, por mês e com o mês anterior ao lado.
//
// DE ONDE VÊM OS NÚMEROS
//  - Atividade: tabela de interações (mensagens enviadas e recebidas, por canal e por utilizador).
//  - Funil e conversões: o histórico automático das mudanças de estado dos leads («quantos leads passaram a X neste mês»). É por isso que o
//    funil conta transições do mês e não o estado atual; só existe desde que o histórico foi criado.
//  - Propostas: tabela de propostas (criadas no mês; «enviadas» quando foram marcadas como enviadas no mês).
//  - Os meses são em UTC. Nada aqui é pessoal: só contagens e valores agregados (a análise mensal por IA usa exatamente estes números).
// calcular() é uma função pura (testável); relatorioMensal() vai buscar os dados à base de dados.
const { supabaseAdmin } = require('./supabase.service');

const CANAIS = ['email', 'linkedin', 'instagram', 'whatsapp'];
const ESTADOS_FUNIL = ['contactado', 'respondeu', 'reuniao_agendada', 'proposta_enviada', 'proposta_aceite', 'negocio_fechado'];
const CONVERSOES = [['contactado', 'respondeu'], ['respondeu', 'reuniao_agendada'], ['reuniao_agendada', 'proposta_enviada'], ['proposta_enviada', 'proposta_aceite'], ['proposta_aceite', 'negocio_fechado']];
const PERDIDOS = ['proposta_recusada', 'oportunidade_perdida'];
const PAGINA = 1000;
const MAX_LINHAS = 50000;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });

// ---------- períodos ----------
function validarMes(mes, agora = Date.now()) {
    const atual = new Date(agora).toISOString().slice(0, 7);
    if (mes == null || mes === '') return atual;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes))) throw erro('INVALIDO', 'O mês tem de ter o formato AAAA-MM.');
    if (String(mes) > atual) throw erro('INVALIDO', 'Não há relatórios de meses que ainda não começaram.');
    if (String(mes) < '2020-01') throw erro('INVALIDO', 'Esse mês é demasiado antigo.');
    return String(mes);
}
const limitesDoMes = (mes) => {
    const [a, m] = mes.split('-').map(Number);
    return { inicio: new Date(Date.UTC(a, m - 1, 1)), fim: new Date(Date.UTC(a, m, 1)) };
};
function mesAnterior(mes) {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 2, 1));
    return d.toISOString().slice(0, 7);
}

// ---------- cálculo (função pura) ----------
const dentro = (iso, p) => { const t = new Date(iso).getTime(); return t >= p.inicio.getTime() && t < p.fim.getTime(); };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const contar = (lista, f) => lista.reduce((n, x) => n + (f(x) ? 1 : 0), 0);
const distintos = (lista, f) => new Set(lista.map(f)).size;

// Uma passagem pelos dados de UM período. Devolve contagens simples; calcular() junta o período e o anterior.
function medir(d, p) {
    const inter = d.interaccoes.filter((i) => dentro(i.ocorrida_em, p));
    const enviadas = inter.filter((i) => i.direcao === 'saida' && i.tipo !== 'nota');
    const recebidas = inter.filter((i) => i.direcao === 'entrada' && i.tipo !== 'nota');
    const porCanal = (lista) => Object.fromEntries(CANAIS.map((c) => [c, contar(lista, (i) => i.canal === c)]));
    const eventos = d.historico.filter((h) => dentro(h.criado_em, p));
    const funil = Object.fromEntries([...ESTADOS_FUNIL, ...PERDIDOS].map((e) => [e, distintos(eventos.filter((h) => h.valor_novo === e), (h) => h.entidade_id)]));
    const props = d.propostas.filter((x) => dentro(x.criado_em, p));
    const enviadasProp = d.propostas.filter((x) => x.estado === 'enviada' && dentro(x.atualizado_em || x.criado_em, p));
    const soma = (lista, k) => Math.round(lista.reduce((s, x) => s + (x.totais?.[k] || 0), 0) * 100) / 100;
    return {
        leads_novos: contar(d.leads, (l) => dentro(l.criado_em, p)),
        empresas_novas: contar(d.empresas, (e) => dentro(e.criado_em, p)),
        contactos: enviadas.length, contactos_canal: porCanal(enviadas),
        primeiros: contar(enviadas, (i) => i.tipo === 'primeiro_contacto'), followups: contar(enviadas, (i) => i.tipo === 'follow_up'),
        respostas: recebidas.length, respostas_canal: porCanal(recebidas),
        leads_contactados: distintos(enviadas, (i) => i.lead_id), leads_com_resposta: distintos(recebidas, (i) => i.lead_id),
        tarefas_concluidas: contar(d.tarefas, (t) => t.concluida_em && dentro(t.concluida_em, p)),
        funil,
        propostas_criadas: props.length, propostas_enviadas: enviadasProp.length,
        valor_mensal: soma(props, 'mensal_liquido'), valor_pontual: soma(props, 'pontual_liquido'), com_sucesso: contar(props, (x) => (x.totais?.sucesso || []).length > 0),
        moedas: [...new Set(props.map((x) => x.moeda).filter(Boolean))]
    };
}

function calcular(d, { mes, hoje = Date.now() }) {
    const P = { ...limitesDoMes(mes) };
    const A = { ...limitesDoMes(mesAnterior(mes)) };
    const m = medir(d, P), a = medir(d, A);
    const par = (k) => ({ v: m[k], ant: a[k] });
    const taxa = (x) => pct(x.leads_com_resposta, x.leads_contactados);

    // por serviço e por fonte: os leads e empresas dos eventos do mês
    const leadPorId = new Map(d.leadsRef.map((l) => [l.id, l]));
    const empresaPorId = new Map(d.empresasRef.map((e) => [e.id, e]));
    const fonteNome = new Map(d.fontes.map((f) => [f.id, f.nome]));
    const eventosMes = d.historico.filter((h) => dentro(h.criado_em, P));
    const servicos = new Map();
    const noServico = (s) => servicos.get(s || 'sem') || servicos.set(s || 'sem', { servico: s || null, leads_novos: 0, respostas: 0, fechados: 0 }).get(s || 'sem');
    d.leads.filter((l) => dentro(l.criado_em, P)).forEach((l) => { noServico(l.servico_interesse).leads_novos++; });
    const vistos = { respondeu: new Set(), negocio_fechado: new Set() };
    eventosMes.forEach((h) => {
        if (!(h.valor_novo in vistos) || vistos[h.valor_novo].has(h.entidade_id)) return;
        vistos[h.valor_novo].add(h.entidade_id);
        const l = leadPorId.get(h.entidade_id);
        noServico(l?.servico_interesse)[h.valor_novo === 'respondeu' ? 'respostas' : 'fechados']++;
    });
    const fontes = new Map();
    const naFonte = (id) => fontes.get(id || 'sem') || fontes.set(id || 'sem', { fonte: id ? (fonteNome.get(id) || '–') : null, empresas_novas: 0, respostas: 0 }).get(id || 'sem');
    d.empresas.filter((e) => dentro(e.criado_em, P)).forEach((e) => { naFonte(e.fonte_id).empresas_novas++; });
    vistos.respondeu.forEach((leadId) => { const l = leadPorId.get(leadId); naFonte(empresaPorId.get(l?.empresa_id)?.fonte_id).respostas++; });

    const nomes = new Map(d.utilizadores.map((u) => [u.id, u.nome]));
    const equipa = new Map();
    d.interaccoes.filter((i) => dentro(i.ocorrida_em, P) && i.direcao === 'saida' && i.tipo !== 'nota').forEach((i) => {
        const k = i.utilizador_id || 'sem';
        const e = equipa.get(k) || equipa.set(k, { nome: nomes.get(i.utilizador_id) || null, contactos: 0 }).get(k);
        e.contactos++;
    });

    // série diária do mês (para o gráfico)
    const dias = Math.round((P.fim - P.inicio) / 86400000);
    const serie = Array.from({ length: dias }, (_, n) => ({ dia: new Date(P.inicio.getTime() + n * 86400000).toISOString().slice(0, 10), saida: 0, entrada: 0 }));
    d.interaccoes.filter((i) => dentro(i.ocorrida_em, P) && i.tipo !== 'nota').forEach((i) => {
        const n = Math.floor((new Date(i.ocorrida_em).getTime() - P.inicio.getTime()) / 86400000);
        if (serie[n]) serie[n][i.direcao === 'saida' ? 'saida' : 'entrada']++;
    });

    const porCanal = (k) => CANAIS.map((c) => ({ canal: c, v: m[k][c], ant: a[k][c] }));
    return {
        mes, anterior: mesAnterior(mes), periodo: { inicio: P.inicio.toISOString(), fim: P.fim.toISOString() },
        atividade: {
            leads_novos: par('leads_novos'), empresas_novas: par('empresas_novas'), contactos: par('contactos'), primeiros: par('primeiros'), followups: par('followups'),
            respostas: par('respostas'), taxa_resposta: { v: taxa(m), ant: taxa(a) }, tarefas_concluidas: par('tarefas_concluidas'),
            tarefas_atrasadas: d.tarefasAtrasadas ?? null,
            contactos_por_canal: porCanal('contactos_canal'), respostas_por_canal: porCanal('respostas_canal')
        },
        funil: [...ESTADOS_FUNIL, ...PERDIDOS].map((e) => ({ estado: e, v: m.funil[e], ant: a.funil[e] })),
        conversoes: CONVERSOES.map(([de, para]) => ({ de, para, pct: pct(m.funil[para], m.funil[de]), ant: pct(a.funil[para], a.funil[de]), de_n: m.funil[de], para_n: m.funil[para] })),
        propostas: { criadas: par('propostas_criadas'), enviadas: par('propostas_enviadas'), valor_mensal: par('valor_mensal'), valor_pontual: par('valor_pontual'), com_sucesso: par('com_sucesso'), moedas: m.moedas },
        por_servico: [...servicos.values()].sort((x, y) => (y.fechados - x.fechados) || (y.respostas - x.respostas) || (y.leads_novos - x.leads_novos)),
        por_fonte: [...fontes.values()].sort((x, y) => (y.respostas - x.respostas) || (y.empresas_novas - x.empresas_novas)),
        por_utilizador: [...equipa.values()].sort((x, y) => y.contactos - x.contactos),
        serie, vazio: !m.contactos && !m.respostas && !m.leads_novos && !m.empresas_novas && !Object.values(m.funil).some(Boolean) && !m.propostas_criadas
    };
}

// ---------- dados ----------
async function lerTudo(consulta) {
    const todas = [];
    for (let de = 0; de < MAX_LINHAS; de += PAGINA) {
        const { data, error } = await consulta().range(de, de + PAGINA - 1);
        if (error) throw new Error(error.message);
        todas.push(...(data || []));
        if ((data || []).length < PAGINA) break;
    }
    return todas;
}
const emLotes = (lista, n = 100) => { const r = []; for (let i = 0; i < lista.length; i += n) r.push(lista.slice(i, i + n)); return r; };

async function relatorioMensal(mesPedido, { agora = Date.now() } = {}) {
    const mes = validarMes(mesPedido, agora);
    const desde = limitesDoMes(mesAnterior(mes)).inicio.toISOString(), ate = limitesDoMes(mes).fim.toISOString();
    const noIntervalo = (q, campo) => q.gte(campo, desde).lt(campo, ate);

    const [leads, empresas, interaccoes, historico, propostasBrutas, tarefas, equipa, fontes, atrasadas] = await Promise.all([
        lerTudo(() => noIntervalo(supabaseAdmin.from('leads').select('id, servico_interesse, empresa_id, criado_em').order('criado_em'), 'criado_em')),
        lerTudo(() => noIntervalo(supabaseAdmin.from('empresas').select('id, fonte_id, criado_em').order('criado_em'), 'criado_em')),
        lerTudo(() => noIntervalo(supabaseAdmin.from('interaccoes').select('id, lead_id, canal, direcao, tipo, utilizador_id, ocorrida_em').order('ocorrida_em'), 'ocorrida_em')),
        lerTudo(() => noIntervalo(supabaseAdmin.from('historico').select('id, entidade_id, valor_novo, criado_em').eq('entidade', 'lead').eq('campo', 'estado').order('criado_em'), 'criado_em')),
        supabaseAdmin.from('propostas').select('id, estado, dados, criado_em, atualizado_em').or(`and(criado_em.gte.${desde},criado_em.lt.${ate}),and(atualizado_em.gte.${desde},atualizado_em.lt.${ate})`).limit(2000)
            .then((r) => (r.error ? { data: [] } : r)),
        lerTudo(() => noIntervalo(supabaseAdmin.from('tarefas').select('id, concluida_em').not('concluida_em', 'is', null).order('concluida_em'), 'concluida_em')),
        supabaseAdmin.from('utilizadores').select('id, nome').then((r) => r.data || []),
        supabaseAdmin.from('fontes').select('id, nome').then((r) => r.data || []),
        supabaseAdmin.from('tarefas').select('id', { count: 'exact', head: true }).is('concluida_em', null).lt('prazo', new Date(agora).toISOString().slice(0, 10)).then((r) => r.count ?? null)
    ]);

    // os leads e empresas ligados aos eventos do mês (para os repartir por serviço e por fonte), que podem ser anteriores ao período
    const idsLeads = [...new Set(historico.map((h) => h.entidade_id))];
    const leadsRef = [];
    for (const parte of emLotes(idsLeads)) { const { data } = await supabaseAdmin.from('leads').select('id, servico_interesse, empresa_id').in('id', parte); leadsRef.push(...(data || [])); }
    const idsEmpresas = [...new Set(leadsRef.map((l) => l.empresa_id))];
    const empresasRef = [];
    for (const parte of emLotes(idsEmpresas)) { const { data } = await supabaseAdmin.from('empresas').select('id, fonte_id').in('id', parte); empresasRef.push(...(data || [])); }

    const { calcularTotais } = require('./proposal.service');
    const propostas = (propostasBrutas.data || []).map((p) => { let totais = null; try { totais = calcularTotais(p.dados); } catch { /* proposta antiga ou incompleta */ } return { estado: p.estado, criado_em: p.criado_em, atualizado_em: p.atualizado_em, moeda: p.dados?.moeda, totais }; });
    return calcular({ leads, empresas, interaccoes, historico, propostas, tarefas, utilizadores: equipa, fontes, leadsRef, empresasRef, tarefasAtrasadas: atrasadas }, { mes, hoje: agora });
}

module.exports = { relatorioMensal, calcular, medir, validarMes, mesAnterior, limitesDoMes, CANAIS, ESTADOS_FUNIL, CONVERSOES };

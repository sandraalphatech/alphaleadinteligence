// Tarefas automáticas (página «Tarefas»): quando um lead muda de estado, a plataforma cria a tarefa que vem a seguir
// e fecha as que deixaram de fazer sentido. Todas as tarefas automáticas têm origem «automatica» (as manuais nunca se mexem sozinhas).
//
//   ESTADO DO LEAD        TAREFA CRIADA                              PRAZO
//   Contactado            Follow-up (se não houver um aberto)        o das regras do sistema (5 dias entre mensagens)
//   Respondeu             Dar retorno                                24 horas (amanhã)
//   Reunião agendada      Reunião                                    hoje (depois ajusta-se o prazo à data da reunião)
//   Enviar proposta       Enviar proposta                            24 horas (amanhã)
//   Proposta enviada      Acompanhar proposta (follow-up)            o das regras do sistema (5 dias); se o cliente responder, fecha sozinha
//
// FECHAR: a tarefa «Reunião» fecha quando o lead sai de «reunião agendada»; «Enviar proposta» fecha quando sai de «enviar proposta»
// (ou seja, quando a proposta é enviada); «Dar retorno» fecha quando sai de «respondeu». Nos estados finais (fechado, perdido,
// não contactar, proposta aceite ou recusada) fecham todas as automáticas. Empresas em «Não contactar» nunca ganham tarefas novas.
const { supabaseAdmin } = require('./supabase.service');
const o = require('./outreach.service');
const google = () => require('./google-calendar.service');

const DIA = 86400000;
const TERMINAIS = ['negocio_fechado', 'oportunidade_perdida', 'nao_contactar', 'proposta_aceite', 'proposta_recusada'];
const dataEm = (dias, agora) => new Date(agora.getTime() + dias * DIA).toISOString().slice(0, 10);

// o que se cria em cada estado: tipo da tarefa, em quantos dias, e o título
const CRIAR = {
    contactado: { tipo: 'follow_up', dias: () => o.DIAS_ENTRE_MENSAGENS, titulo: (e) => `Follow-up: ${e}` },
    respondeu: { tipo: 'outro', dias: () => 1, titulo: (e) => `Dar retorno: ${e}` },
    reuniao_agendada: { tipo: 'reuniao', dias: () => 0, titulo: (e) => `Reunião: ${e}` },
    enviar_proposta: { tipo: 'proposta', dias: () => 1, titulo: (e) => `Enviar proposta: ${e}` },
    proposta_enviada: { tipo: 'follow_up', dias: () => o.DIAS_ENTRE_MENSAGENS, titulo: (e) => `Acompanhar proposta: ${e}` }
};
// uma tarefa automática deste tipo deixa de fazer sentido quando o lead entra num estado que NÃO é este
const SO_NESTE_ESTADO = { reuniao: 'reuniao_agendada', proposta: 'enviar_proposta', outro: 'respondeu' };

// Chamar DEPOIS de o estado do lead já estar gravado (e depois de fechar os follow-ups antigos, se for o caso).
// lead: { id, empresa_id }. Devolve { criada: 'tipo' | null, fechadas: n }.
async function aoMudarEstado(lead, estado, { utilizador, agora = new Date(), reuniao = null } = {}) {
    const resultado = { criada: null, fechadas: 0 };
    const { data: abertas } = await supabaseAdmin.from('tarefas').select('id, tipo').eq('lead_id', lead.id).eq('origem', 'automatica').is('concluida_em', null);

    // 1) fechar as que deixaram de fazer sentido
    const obsoletas = (abertas || []).filter((t) => TERMINAIS.includes(estado) || (SO_NESTE_ESTADO[t.tipo] && SO_NESTE_ESTADO[t.tipo] !== estado));
    if (obsoletas.length) {
        await supabaseAdmin.from('tarefas').update({ concluida_em: agora.toISOString() }).in('id', obsoletas.map((t) => t.id));
        resultado.fechadas = obsoletas.length;
        // lead perdido ou fora de contacto: as reuniões marcadas já não vão acontecer, e saem do Google Calendar
        if (['oportunidade_perdida', 'nao_contactar'].includes(estado)) google().aoFecharReunioes(obsoletas.filter((t) => t.tipo === 'reuniao').map((t) => t.id));
    }

    // 2) criar a que vem a seguir (se ainda não houver uma igual aberta)
    const regra = CRIAR[estado];
    if (!regra) return resultado;
    const igual = (abertas || []).find((t) => t.tipo === regra.tipo && !obsoletas.includes(t));
    if (igual) {                                                                  // já há uma aberta: só se acerta o dia/hora da reunião, se vieram
        if (estado === 'reuniao_agendada' && reuniao && (reuniao.data || reuniao.hora)) { await gravarQuando(igual.id, reuniao); google().aoMudarTarefa(igual.id); }
        return resultado;
    }
    const { data: dados } = await supabaseAdmin.from('leads').select('id, empresa_id, responsavel_id').eq('id', lead.id).maybeSingle();
    if (!dados) return resultado;
    const { data: empresa } = await supabaseAdmin.from('empresas').select('id, nome, nao_contactar').eq('id', dados.empresa_id).maybeSingle();
    if (!empresa || empresa.nao_contactar) return resultado;
    const quando = estado === 'reuniao_agendada' && reuniao ? reuniao : null;
    const linha = {
        lead_id: lead.id, empresa_id: dados.empresa_id, titulo: regra.titulo(empresa.nome || '').slice(0, 120), tipo: regra.tipo, prazo: quando?.data || dataEm(regra.dias(), agora),
        responsavel_id: dados.responsavel_id || utilizador?.id || null, origem: 'automatica', criada_por: utilizador?.id || null
    };
    let { data: criada, error } = await supabaseAdmin.from('tarefas').insert(quando?.hora ? { ...linha, hora: quando.hora } : linha).select('id').maybeSingle();
    if (error && quando?.hora && /hora/.test(error.message)) {                    // coluna «hora» ainda não existe (tasks.sql por correr): a hora vai no título
        ({ data: criada, error } = await supabaseAdmin.from('tarefas').insert({ ...linha, titulo: `${linha.titulo} (${quando.hora})`.slice(0, 120) }).select('id').maybeSingle());
    }
    if (error) throw new Error(error.message);
    if (criada?.id) google().aoMudarTarefa(criada.id);         // a reunião aparece logo no Google Calendar (se estiver ligado)
    resultado.criada = regra.tipo;
    return resultado;
}

async function gravarQuando(id, { data, hora }) {
    const mudanca = { ...(data ? { prazo: data } : {}), ...(hora ? { hora } : {}) };
    const { error } = await supabaseAdmin.from('tarefas').update(mudanca).eq('id', id);
    if (error && /hora/.test(error.message) && data) await supabaseAdmin.from('tarefas').update({ prazo: data }).eq('id', id);
}

module.exports = { aoMudarEstado, CRIAR, TERMINAIS, SO_NESTE_ESTADO };

// «Não contactar» (Etapa 8): a lista de empresas e pessoas a quem a plataforma nunca escreve.
//  - Uma empresa marcada fica bloqueada em TODOS os canais (as regras de envio recusam-na) e os seus leads passam a «não contactar».
//  - Uma pessoa marcada deixa de aparecer como destinatária.
//  - «Desde quando» e «como» (PARAR no WhatsApp, marcada à mão, etc.) vêm do histórico automático.
//  - Marcar é fácil; REMOVER só o admin pode (levantar um bloqueio pode ir contra o pedido de uma pessoa).
const { supabaseAdmin } = require('./supabase.service');
const { escaparPesquisa } = require('./pipeline.service');

const UUID = /^[0-9a-f-]{36}$/i;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });

async function desdeQuando(ids) {
    const mapa = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabaseAdmin.from('historico').select('entidade_id, origem, criado_em')
            .eq('campo', 'nao_contactar').eq('valor_novo', 'true').in('entidade_id', ids.slice(i, i + 100)).order('criado_em', { ascending: false });
        (data || []).forEach((h) => { if (!mapa.has(h.entidade_id)) mapa.set(h.entidade_id, h); });
    }
    return mapa;
}

async function listar() {
    const [{ data: empresas, error: e1 }, { data: pessoas, error: e2 }] = await Promise.all([
        supabaseAdmin.from('empresas').select('id, nome, pais').eq('nao_contactar', true).order('nome').limit(2000),
        supabaseAdmin.from('decisores').select('id, nome, cargo, empresa_id').eq('nao_contactar', true).order('nome').limit(2000)
    ]);
    if (e1 || e2) throw new Error((e1 || e2).message);
    const ids = [...new Set((pessoas || []).map((p) => p.empresa_id))];
    const nomes = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabaseAdmin.from('empresas').select('id, nome, pais').in('id', ids.slice(i, i + 100));
        (data || []).forEach((e) => nomes.set(e.id, e));
    }
    const historico = await desdeQuando([...(empresas || []).map((e) => e.id), ...(pessoas || []).map((p) => p.id)]);
    const itens = [
        ...(empresas || []).map((e) => ({ tipo: 'empresa', id: e.id, nome: e.nome, empresa: e.nome, pais: e.pais || null, desde: historico.get(e.id)?.criado_em || null, origem: historico.get(e.id)?.origem || null })),
        ...(pessoas || []).map((p) => ({ tipo: 'pessoa', id: p.id, nome: p.nome, cargo: p.cargo || null, empresa: nomes.get(p.empresa_id)?.nome || null, empresa_id: p.empresa_id, pais: nomes.get(p.empresa_id)?.pais || null,
            desde: historico.get(p.id)?.criado_em || null, origem: historico.get(p.id)?.origem || null }))
    ];
    return { itens, total_empresas: (empresas || []).length, total_pessoas: (pessoas || []).length };
}

// Procura empresas (ainda não bloqueadas) pelo nome, para as acrescentar.
async function procurar(q) {
    const termo = escaparPesquisa(q);
    if (termo.length < 2) return [];
    const { data, error } = await supabaseAdmin.from('empresas').select('id, nome, pais, nao_contactar').ilike('nome', `%${termo}%`).eq('nao_contactar', false).order('nome').limit(15);
    if (error) throw new Error(error.message);
    return data || [];
}

async function lerEmpresa(id) {
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Empresa não encontrada.');
    const { data } = await supabaseAdmin.from('empresas').select('id, nome, nao_contactar').eq('id', id).maybeSingle();
    if (!data) throw erro('NAO_ENCONTRADA', 'Empresa não encontrada.');
    return data;
}

async function adicionarEmpresa(id) {
    const e = await lerEmpresa(id);
    const { error } = await supabaseAdmin.from('empresas').update({ nao_contactar: true, ultima_origem: 'nao_contactar' }).eq('id', e.id);
    if (error) throw new Error(error.message);
    const { data: leads } = await supabaseAdmin.from('leads').update({ estado: 'nao_contactar', ultima_origem: 'nao_contactar' }).eq('empresa_id', e.id).neq('estado', 'nao_contactar').select('id');
    await supabaseAdmin.from('tarefas').update({ concluida_em: new Date().toISOString() }).eq('empresa_id', e.id).is('concluida_em', null);
    return { id: e.id, nome: e.nome, leads: (leads || []).length };
}

// Levanta o bloqueio (só o admin, na rota). Os leads que estavam em «não contactar» voltam a «analisado».
async function removerEmpresa(id) {
    const e = await lerEmpresa(id);
    const { error } = await supabaseAdmin.from('empresas').update({ nao_contactar: false, ultima_origem: 'nao_contactar' }).eq('id', e.id);
    if (error) throw new Error(error.message);
    const { data: leads } = await supabaseAdmin.from('leads').update({ estado: 'analisado', ultima_origem: 'nao_contactar' }).eq('empresa_id', e.id).eq('estado', 'nao_contactar').select('id');
    return { id: e.id, nome: e.nome, leads: (leads || []).length };
}

async function alterarPessoa(id, valor) {
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Pessoa não encontrada.');
    const { data, error } = await supabaseAdmin.from('decisores').update({ nao_contactar: !!valor, ultima_origem: 'nao_contactar' }).eq('id', id).select('id, nome').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw erro('NAO_ENCONTRADA', 'Pessoa não encontrada.');
    return { id: data.id, nome: data.nome, nao_contactar: !!valor };
}

module.exports = { listar, procurar, adicionarEmpresa, removerEmpresa, alterarPessoa };

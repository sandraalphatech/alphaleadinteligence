// Fontes (Etapa 8): de onde vem cada empresa. Mostra as fontes do Radar e as importações, quantas empresas trouxe cada uma
// e quando foi a última recolha, e deixa ligar ou desligar as do Radar (uma fonte desligada deixa de ser lida nas recolhas).
const { supabaseAdmin } = require('./supabase.service');
const { CONECTORES } = require('./connectors');

const UUID = /^[0-9a-f-]{36}$/i;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });
const noCodigo = (conector) => CONECTORES.some((c) => c.id === conector);

async function listar() {
    const { data: fontes, error } = await supabaseAdmin.from('fontes').select('id, nome, tipo, url, conector, activa, criado_em').order('nome');
    if (error) throw new Error(error.message);
    return Promise.all((fontes || []).map(async (f) => {
        const { count } = await supabaseAdmin.from('empresas').select('id', { count: 'exact', head: true }).eq('fonte_id', f.id);
        let ultima = null;
        if (f.conector) {
            const { data } = await supabaseAdmin.from('radar_itens').select('criado_em').eq('conector', f.conector).order('criado_em', { ascending: false }).limit(1);
            ultima = data?.[0]?.criado_em || null;
        } else {
            const { data } = await supabaseAdmin.from('empresas').select('criado_em').eq('fonte_id', f.id).order('criado_em', { ascending: false }).limit(1);
            ultima = data?.[0]?.criado_em || null;
        }
        return { id: f.id, nome: f.nome, tipo: f.tipo, url: f.url, conector: f.conector, activa: !!f.activa, empresas: count || 0, ultima_atividade: ultima,
            disponivel: f.conector ? noCodigo(f.conector) : true, pode_desligar: !!f.conector };
    }));
}

async function alterar(id, activa) {
    if (!UUID.test(String(id || ''))) throw erro('NAO_ENCONTRADA', 'Fonte não encontrada.');
    const { data: f } = await supabaseAdmin.from('fontes').select('id, nome, conector, activa').eq('id', id).maybeSingle();
    if (!f) throw erro('NAO_ENCONTRADA', 'Fonte não encontrada.');
    if (!f.conector) throw erro('INVALIDO', 'Só as fontes do Radar se ligam e desligam; as importações são registos do que entrou.');
    if (activa && !noCodigo(f.conector)) throw erro('INVALIDO', 'Esta fonte ainda não tem conector na plataforma (o Reddit, por exemplo, exige a API oficial).');
    const { error } = await supabaseAdmin.from('fontes').update({ activa: !!activa }).eq('id', id);
    if (error) throw new Error(error.message);
    return { id: f.id, nome: f.nome, activa: !!activa };
}

// Dos conectores pedidos (ou de todos, se não pedir nenhum), os que estão ligados. Lista vazia = nenhum ligado.
async function conectoresAtivos(pedidos = []) {
    const { data } = await supabaseAdmin.from('fontes').select('conector, activa').not('conector', 'is', null);
    const desligados = new Set((data || []).filter((f) => f.activa === false).map((f) => f.conector));
    const base = pedidos && pedidos.length ? pedidos : CONECTORES.map((c) => c.id);
    return base.filter((id) => !desligados.has(id));
}

module.exports = { listar, alterar, conectoresAtivos };

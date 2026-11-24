// Deduplicação: impede e resolve empresas repetidas.
//
// Duas empresas são a mesma quando:
//   - têm o mesmo site oficial (domínio): confiança alta, a base de dados recusa o segundo;
//   - têm o mesmo nome normalizado no mesmo país ("Acme, Inc." = "ACME Ltd").
// Quando o código vai gravar e a base de dados recusa por duplicado, as duas fundem-se numa só:
// a que tem mais trabalho feito fica, e a outra entrega-lhe os leads, os decisores e os dados que faltavam.

const { supabaseAdmin } = require('./supabase.service');
const { normalizarNomePessoa } = require('./normalization.service');

const ESTADOS_INICIAIS = ['novo', 'analisado'];            // leads sem trabalho comercial feito
const CAMPOS_A_COMPLETAR = ['website', 'dominio', 'website_estado', 'pais', 'regiao', 'cidade', 'morada', 'telefone', 'email_geral',
    'email_geral_estado', 'sobre', 'descricao', 'idioma', 'tipo_empresa', 'tipo_motivo', 'origem_titulo', 'origem_url'];

const historico = (linha) => supabaseAdmin.from('historico').insert({ origem: 'fusao', ...linha });

// Qual das duas fica? A que tem leads já trabalhados, depois a mais enriquecida, depois a mais antiga.
async function escolherMantida(a, b) {
    const avancado = async (e) => {
        const { data } = await supabaseAdmin.from('leads').select('estado').eq('empresa_id', e.id);
        return (data || []).some((l) => !ESTADOS_INICIAIS.includes(l.estado));
    };
    const [aa, bb] = await Promise.all([avancado(a), avancado(b)]);
    if (aa !== bb) return aa ? [a, b] : [b, a];
    if (!!a.enriquecida_em !== !!b.enriquecida_em) return a.enriquecida_em ? [a, b] : [b, a];
    return new Date(a.criado_em) <= new Date(b.criado_em) ? [a, b] : [b, a];
}

// Funde "removida" dentro de "mantida". Devolve o que foi movido.
async function fundirEmpresas(mantida, removida) {
    const resultado = { leads_movidos: 0, leads_apagados: 0, decisores_movidos: 0, decisores_repetidos: 0 };

    // 1. completar o que falta na empresa que fica (o domínio é único: primeiro sai da empresa que vai desaparecer)
    const completar = {};
    for (const campo of CAMPOS_A_COMPLETAR) if (!mantida[campo] && removida[campo]) completar[campo] = removida[campo];
    if (removida.redes) completar.redes = { ...removida.redes, ...(mantida.redes || {}) };
    if ((removida.pilares_cumpridos ?? -1) > (mantida.pilares_cumpridos ?? -1)) {
        Object.assign(completar, { pilares: removida.pilares, pilares_cumpridos: removida.pilares_cumpridos, e_startup: removida.e_startup });
    }
    if (completar.dominio) await supabaseAdmin.from('empresas').update({ dominio: null, ultima_origem: 'fusao' }).eq('id', removida.id);
    if (Object.keys(completar).length) {
        const { error } = await supabaseAdmin.from('empresas').update({ ...completar, ultima_origem: 'fusao' }).eq('id', mantida.id);
        if (error) throw new Error('Fusão: ' + error.message);
    }

    // 2. leads: ficam os que têm trabalho feito; um lead "novo/analisado" duplicado é descartado
    const { data: leadsM } = await supabaseAdmin.from('leads').select('id, estado').eq('empresa_id', mantida.id);
    const { data: leadsR } = await supabaseAdmin.from('leads').select('id, estado').eq('empresa_id', removida.id);
    let temLead = (leadsM || []).length > 0;
    for (const l of leadsR || []) {
        const avancado = !ESTADOS_INICIAIS.includes(l.estado);
        if (avancado) {
            for (const m of (leadsM || []).filter((x) => ESTADOS_INICIAIS.includes(x.estado))) {   // o lead sem trabalho da outra cede o lugar
                await supabaseAdmin.from('leads').delete().eq('id', m.id); resultado.leads_apagados++;
            }
        }
        if (avancado || !temLead) {
            await supabaseAdmin.from('leads').update({ empresa_id: mantida.id, ultima_origem: 'fusao' }).eq('id', l.id);
            resultado.leads_movidos++; temLead = true;
        } else {
            await supabaseAdmin.from('leads').delete().eq('id', l.id); resultado.leads_apagados++;
        }
    }

    // 3. decisores: a mesma pessoa (nome, email ou LinkedIn) não se repete
    const { data: decM } = await supabaseAdmin.from('decisores').select('id, nome, email, linkedin_url').eq('empresa_id', mantida.id);
    const { data: decR } = await supabaseAdmin.from('decisores').select('id, nome, email, linkedin_url').eq('empresa_id', removida.id);
    const nomes = new Set((decM || []).map((d) => normalizarNomePessoa(d.nome)));
    const emails = new Set((decM || []).filter((d) => d.email).map((d) => d.email.toLowerCase()));
    const linkedins = new Set((decM || []).filter((d) => d.linkedin_url).map((d) => d.linkedin_url));
    for (const d of decR || []) {
        const nn = normalizarNomePessoa(d.nome);
        const repetido = nomes.has(nn) || (d.email && emails.has(d.email.toLowerCase())) || (d.linkedin_url && linkedins.has(d.linkedin_url));
        if (repetido) { await supabaseAdmin.from('decisores').delete().eq('id', d.id); resultado.decisores_repetidos++; continue; }
        const { error } = await supabaseAdmin.from('decisores').update({ empresa_id: mantida.id, nome_normalizado: nn, ultima_origem: 'fusao' }).eq('id', d.id);
        if (!error) { resultado.decisores_movidos++; nomes.add(nn); }
    }

    // 4. memória das notícias já lidas, histórico e remoção
    await supabaseAdmin.from('radar_itens').update({ empresa_id: mantida.id }).eq('empresa_id', removida.id);
    await historico({ entidade: 'empresa', entidade_id: removida.id, empresa_id: mantida.id, rotulo: removida.nome,
                      campo: '(fundida em)', valor_antigo: removida.nome, valor_novo: mantida.nome });
    const { error: erroApagar } = await supabaseAdmin.from('empresas').delete().eq('id', removida.id);
    if (erroApagar) throw new Error('Fusão (apagar): ' + erroApagar.message);
    return resultado;
}

// Atualiza uma empresa. Se a base de dados recusar por duplicado (mesmo domínio, ou mesmo nome no mesmo país),
// funde as duas empresas em vez de falhar. Devolve { id (da empresa que ficou), fundida }.
async function actualizarEmpresa(id, alterar, origem) {
    const dados = { ...alterar, ultima_origem: origem };
    const { error } = await supabaseAdmin.from('empresas').update(dados).eq('id', id);
    if (!error) return { id, fundida: false };
    if (error.code !== '23505') throw new Error(error.message);

    const { data: atual } = await supabaseAdmin.from('empresas').select('*').eq('id', id).single();
    let outra = null;
    if (/idx_empresas_dominio_unico/.test(error.message) && alterar.dominio) {
        outra = (await supabaseAdmin.from('empresas').select('*').eq('dominio', alterar.dominio).neq('id', id).maybeSingle()).data;
    } else if (/idx_empresas_nome_pais_unico/.test(error.message) && alterar.nome_normalizado) {
        const q = supabaseAdmin.from('empresas').select('*').eq('nome_normalizado', alterar.nome_normalizado).neq('id', id);
        outra = ((await q).data || []).find((e) => (e.pais || '') === ((alterar.pais ?? atual.pais) || ''));
    }
    if (!outra) throw new Error(error.message);

    // aplica tudo o que não colide (sem o campo que gerou o conflito) e funde
    const { dominio, nome_normalizado, ...resto } = dados;
    await supabaseAdmin.from('empresas').update(resto).eq('id', id);
    const [mantida, removida] = await escolherMantida({ ...atual, ...resto }, outra);
    await fundirEmpresas(mantida, removida);
    return { id: mantida.id, fundida: true };
}

// Relatório de duplicados (sem alterar nada): mesmo domínio, ou mesmo nome normalizado no mesmo país
async function encontrarDuplicados() {
    const { data: empresas } = await supabaseAdmin.from('empresas').select('id, nome, dominio, pais, nome_normalizado, criado_em');
    const grupos = [];
    const agrupar = (chave, motivo) => {
        const m = new Map();
        for (const e of empresas || []) { const k = chave(e); if (k) m.set(k, [...(m.get(k) || []), e]); }
        for (const g of m.values()) if (g.length > 1) grupos.push({ motivo, empresas: g });
    };
    agrupar((e) => e.dominio, 'mesmo site oficial');
    agrupar((e) => e.nome_normalizado && e.nome_normalizado + '|' + (e.pais || ''), 'mesmo nome e país');
    return grupos;
}

module.exports = { fundirEmpresas, actualizarEmpresa, encontrarDuplicados, escolherMantida };

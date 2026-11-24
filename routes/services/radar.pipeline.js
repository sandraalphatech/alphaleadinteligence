// Pipeline do Radar: recolher -> filtrar o que já foi visto -> analisar com a Claude -> gravar.
//
//   1. Os conectores devolvem notícias/posts das fontes.
//   2. Descartamos os que já foram analisados antes (tabela radar_itens): não se paga duas vezes.
//   3. Escolhemos até "limite" itens, repartidos pelas fontes (para nenhuma dominar).
//   4. A Claude analisa em lotes e devolve empresa, pilares e pontuações.
//   5. Gravamos empresas e leads sem duplicados. Empresas que não são startups
//      (menos de 3 pilares) também ficam guardadas, mas com pontuação reduzida.

const crypto = require('crypto');
const { supabaseAdmin } = require('./supabase.service');
const { recolher } = require('./connectors');
const { conectoresAtivos } = require('./sources.service');
const { analisarLote, TAMANHO_LOTE, MODELO } = require('./analysis.service');
const { regiaoDoPais } = require('./radar.catalog');
const { normalizarNome } = require('./normalization.service');
const { identificarPendentes } = require('./identification.service');
const { enriquecerPendentes } = require('./enrichment.service');
const { qualificarPendentes } = require('./quality.service');
const { traduzirPendentes } = require('./translation.service');
const { analisarPendentes } = require('./lead-analysis.service');

const LIMITE_FASES = 40;                       // empresas tratadas por fase, numa recolha

const MINIMO_PILARES_STARTUP = 3;
const SIMULTANEOS = 3;                         // lotes enviados à Claude ao mesmo tempo
const LIMITE_POR_DEFEITO = 40;
const LIMITE_MAXIMO = 150;
const MINUTOS_ATE_ABANDONADA = 15;             // uma recolha "a correr" há mais tempo é dada como perdida

// Quanto mais longe de ser uma startup, mais baixa a pontuação (não se apaga, desce de prioridade)
const FATOR_STARTUP = { 4: 1, 3: 0.9, 2: 0.6, 1: 0.4, 0: 0.25 };

const hash = (url) => crypto.createHash('sha1').update(url).digest('hex');

// ---------- passo 2: o que já foi visto ----------
async function filtrarNovos(itens) {
    const jaVistos = new Set();
    const hashes = itens.map((i) => hash(i.url));

    // em blocos, para o pedido à base de dados não ficar demasiado grande
    for (let n = 0; n < hashes.length; n += 100) {
        const { data, error } = await supabaseAdmin.from('radar_itens').select('url_hash').in('url_hash', hashes.slice(n, n + 100));
        if (error) throw new Error('Não foi possível consultar radar_itens (já correste o radar-collection.sql?): ' + error.message);
        data.forEach((r) => jaVistos.add(r.url_hash));
    }
    return itens.filter((i) => !jaVistos.has(hash(i.url)));
}

// ---------- passo 3: escolher até "limite" itens, repartidos pelas fontes ----------
function escolher(itens, limite) {
    // Um grupo por fonte + site + região + idioma: assim cada recolha mistura países e idiomas
    // (senão o inglês e o Hacker News dominavam e a América Latina quase não aparecia).
    const porFonte = new Map();
    for (const i of itens) {
        const grupo = [i.conector, i.origem, i.regiao, i.idioma].join('|');
        if (!porFonte.has(grupo)) porFonte.set(grupo, []);
        porFonte.get(grupo).push(i);
    }
    // dentro de cada fonte, os mais recentes primeiro
    for (const lista of porFonte.values()) {
        lista.sort((a, b) => new Date(b.publicado_em || 0) - new Date(a.publicado_em || 0));
    }
    // uma de cada fonte à vez, até chegar ao limite
    const escolhidos = [];
    const filas = [...porFonte.values()];
    while (escolhidos.length < limite && filas.some((f) => f.length)) {
        for (const f of filas) {
            if (f.length && escolhidos.length < limite) escolhidos.push(f.shift());
        }
    }
    return escolhidos;
}

// ---------- passo 5: gravar ----------
function textoAnalise(item, r) {
    const nomes = { inovacao: 'Inovação', escalabilidade: 'Escalabilidade', incerteza: 'Incerteza', tecnologia: 'Tecnologia' };
    const pilares = Object.entries(r.pilares)
        .map(([p, v]) => `- ${nomes[p]} (${v.cumpre ? 'sim' : 'não'}): ${v.motivo}`).join('\n');
    return [
        r.justificacao || '',
        `\nPilares de startup (${r.pilares_cumpridos}/4):\n${pilares}`,
        `\nOrigem: ${item.titulo}\n${item.url}`
    ].join('\n').trim();
}

const ajustar = (valor, fator) => Math.round(valor * fator);

async function gravar(item, r, fontes) {
    // A empresa já existe? "Acme, Inc." e "ACME Ltd" são a mesma (nome normalizado), desde que o país não contradiga.
    const nn = normalizarNome(r.nome);
    const nomeSeguro = r.nome.replace(/[%_\\]/g, '\\$&');          // o ilike trata % e _ como curingas
    const procurar = async () => {
        const { data } = await supabaseAdmin.from('empresas').select('id, pais').eq('nome_normalizado', nn);
        const igual = (data || []).find((e) => !e.pais || !r.pais || e.pais === r.pais);
        if (igual) return igual;
        return (await supabaseAdmin.from('empresas').select('id').ilike('nome', nomeSeguro).limit(1)).data?.[0];   // registos antigos, ainda sem nome normalizado
    };

    let empresa = await procurar();
    let nova = false;

    if (!empresa) {
        const { data, error } = await supabaseAdmin.from('empresas').insert({
            nome: r.nome,
            nome_normalizado: nn,
            ultima_origem: 'recolha',
            website: r.website,
            pais: r.pais,
            regiao: r.pais ? regiaoDoPais(r.pais) : (item.regiao || null),
            idioma: r.idioma || item.idioma || null,
            sector: r.sector,
            descricao: r.descricao,
            fonte_id: fontes[item.conector] || null,
            e_startup: r.pilares_cumpridos >= MINIMO_PILARES_STARTUP,
            pilares: r.pilares,
            pilares_cumpridos: r.pilares_cumpridos,
            origem_titulo: item.titulo.slice(0, 250),
            origem_url: item.url,
            origem_data: item.publicado_em || null           // quando a notícia foi publicada (a IA usa-a para julgar se o sinal é recente)
        }).select('id').single();

        if (error && error.code === '23505') {
            empresa = await procurar();              // outra análise criou-a mesmo antes: reaproveitamos
        } else if (error) {
            throw new Error(error.message);
        } else {
            empresa = data;
            nova = true;
        }
    }

    // Só criamos lead se a empresa ainda não tiver nenhum
    let leadCriado = false;
    const { count } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id);
    if (!count) {
        const f = FATOR_STARTUP[r.pilares_cumpridos];
        const { error } = await supabaseAdmin.from('leads').insert({
            empresa_id: empresa.id,
            ultima_origem: 'recolha',
            servico_interesse: r.servico_interesse,
            estado: 'analisado',
            intencao_compra: ajustar(r.pontuacoes.intencao_compra, f),
            adequacao_servicos: ajustar(r.pontuacoes.adequacao_servicos, f),
            qualidade_evidencias: r.pontuacoes.qualidade_evidencias,
            potencial_comercial: ajustar(r.pontuacoes.potencial_comercial, f),
            analise_ia: textoAnalise(item, r)
        });
        if (error) throw new Error(error.message);
        leadCriado = true;
    }

    return { empresaId: empresa.id, nova, leadCriado };
}

async function registarItem(item, resultado, empresaId = null) {
    await supabaseAdmin.from('radar_itens').upsert({
        url_hash: hash(item.url), url: item.url, titulo: item.titulo.slice(0, 250),
        conector: item.conector, resultado, empresa_id: empresaId
    }, { onConflict: 'url_hash' });
}

// ---------- a recolha completa ----------
// opcoes: { ids, limite, gravar (false = só analisa e mostra, sem gravar), aoProgresso(contadores) }
async function executar({ ids, limite = LIMITE_POR_DEFEITO, gravar: guardar = true, aoProgresso } = {}) {
    limite = Math.max(1, Math.min(LIMITE_MAXIMO, parseInt(limite, 10) || LIMITE_POR_DEFEITO));
    const c = { itens_lidos: 0, itens_novos: 0, itens_analisados: 0, empresas_criadas: 0,
                leads_criados: 0, sem_empresa: 0, fora_ambito: 0, erros: 0 };
    const amostra = [];
    const tokens = { entrada: 0, saida: 0 };
    const ultimoErro = { texto: null };

    const ativos = await conectoresAtivos(ids);                       // só as fontes que estão ligadas (página Dados → Fontes)
    if (!ativos.length) throw Object.assign(new Error('Todas as fontes estão desligadas.'), { codigo: 'SEM_FONTES' });
    const relatorio = await recolher({ ids: ativos });
    const todos = relatorio.flatMap((r) => r.itens);
    c.itens_lidos = todos.length;

    const novos = await filtrarNovos(todos);
    c.itens_novos = novos.length;
    const escolhidos = escolher(novos, limite);

    const { data: listaFontes } = await supabaseAdmin.from('fontes').select('id, conector').not('conector', 'is', null);
    const fontes = Object.fromEntries((listaFontes || []).map((f) => [f.conector, f.id]));

    const lotes = [];
    for (let n = 0; n < escolhidos.length; n += TAMANHO_LOTE) lotes.push(escolhidos.slice(n, n + TAMANHO_LOTE));

    if (aoProgresso) await aoProgresso(c);

    // Cada "trabalhador" vai buscando o próximo lote até acabarem
    let proximo = 0;
    async function trabalhador() {
        while (proximo < lotes.length) {
            const lote = lotes[proximo++];
            try {
                const { resultados, tokens: uso } = await analisarLote(lote);
                tokens.entrada += uso.entrada;
                tokens.saida += uso.saida;

                for (let n = 0; n < lote.length; n++) {
                    const item = lote[n];
                    const r = resultados[n];
                    c.itens_analisados++;
                    try {
                        if (!r) { c.erros++; continue; }                          // a Claude não respondeu a este: fica para a próxima
                        if (!r.tem_empresa) { c.sem_empresa++; if (guardar) await registarItem(item, 'sem_empresa'); continue; }
                        if (r.fora_ambito) { c.fora_ambito++; if (guardar) await registarItem(item, 'fora_ambito'); continue; }

                        if (amostra.length < 12) amostra.push({ item: item.titulo, analise: r });
                        if (!guardar) continue;

                        const g = await gravar(item, r, fontes);
                        if (g.nova) c.empresas_criadas++;
                        if (g.leadCriado) c.leads_criados++;
                        await registarItem(item, g.nova ? 'empresa_nova' : 'empresa_existente', g.empresaId);
                    } catch (erro) {
                        c.erros++;
                        ultimoErro.texto = erro.message;
                    }
                }
            } catch (erro) {
                c.erros += lote.length;                                           // lote inteiro falhou: tenta-se na próxima recolha
                c.itens_analisados += lote.length;
                ultimoErro.texto = erro.message;
            }
            if (aoProgresso) await aoProgresso(c);
        }
    }
    await Promise.all(Array.from({ length: Math.min(SIMULTANEOS, lotes.length) }, trabalhador));

    return { contadores: c, tokens, modelo: MODELO, amostra, erro: ultimoErro.texto,
             fontes: relatorio.map((r) => ({ nome: r.nome, ok: r.ok, itens: r.itens.length, erro: r.erro })) };
}

// ---------- recolha em segundo plano, com registo na tabela radar_execucoes ----------
async function iniciarRecolha({ utilizadorId, ids, limite }) {
    // Só uma recolha de cada vez (uma "a correr" há muito tempo é considerada perdida)
    const desde = new Date(Date.now() - MINUTOS_ATE_ABANDONADA * 60000).toISOString();
    const { data: emCurso } = await supabaseAdmin.from('radar_execucoes').select('id')
        .eq('estado', 'a_correr').gt('iniciada_em', desde).limit(1);
    if (emCurso?.length) { const e = new Error('Já existe uma recolha em curso.'); e.codigo = 'EM_CURSO'; throw e; }

    const { data: execucao, error } = await supabaseAdmin.from('radar_execucoes')
        .insert({ iniciada_por: utilizadorId, conectores: ids && ids.length ? ids : null }).select('id').single();
    if (error) throw new Error(error.message);

    const actualizar = (campos) => supabaseAdmin.from('radar_execucoes').update(campos).eq('id', execucao.id);

    // corre sem bloquear a resposta ao browser: recolher -> identificar -> enriquecer -> validar
    executar({ ids, limite, aoProgresso: (c) => actualizar(c) })
        .then(async ({ contadores, erro }) => {
            await actualizar(contadores);
            const errosFases = await fasesSeguintes(contadores.empresas_criadas, actualizar);
            const detalhe = [erro, ...errosFases].filter(Boolean).join(' | ').slice(0, 500) || null;
            await actualizar({ fase: 'concluida', estado: 'concluida', detalhe_erro: detalhe, concluida_em: new Date().toISOString() });
        })
        .catch((erro) => actualizar({ estado: 'falhou', detalhe_erro: String(erro.message).slice(0, 500), concluida_em: new Date().toISOString() }));

    return execucao.id;
}

// As empresas novas passam por mais três fases. Se uma fase falhar, as outras continuam e o erro fica registado.
async function fasesSeguintes(novas, actualizar) {
    const erros = [];
    const n = Math.min(LIMITE_FASES, novas);
    if (!n) return erros;

    const fase = async (nome, campo, correr) => {
        await actualizar({ fase: nome });
        try { await actualizar({ [campo]: await correr() }); }
        catch (e) { erros.push(`${nome}: ${e.message}`); }
    };
    await fase('identificacao', 'identificadas', async () => { const r = await identificarPendentes({ limite: n }); return r.pendentes - r.erros; });
    await fase('enriquecimento', 'enriquecidas', async () => { const r = await enriquecerPendentes({ limite: n }); return r.enriquecidas + r.sem_dados; });
    await fase('qualidade', 'qualificadas', async () => (await qualificarPendentes({ limite: n })).qualificadas);
    await fase('analise', 'analisadas', async () => { const r = await analisarPendentes({ limite: n }); return r.analisadas + r.so_traducao; });
    await fase('traducao', 'traduzidas', async () => (await traduzirPendentes({ limite: n })).traduzidas);
    return erros;
}

module.exports = { executar, iniciarRecolha, escolher, hash, FATOR_STARTUP, LIMITE_POR_DEFEITO, LIMITE_MAXIMO };

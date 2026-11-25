const express = require('express');
const { supabaseAdmin } = require('./services/supabase.service');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const { REGIOES, IDIOMAS, SECTORES, SERVICOS } = require('./services/radar.catalog');
const { CONECTORES } = require('./services/connectors');
const { calcularPrioridade } = require('./services/priority.service');
const { iniciarRecolha, LIMITE_POR_DEFEITO, LIMITE_MAXIMO } = require('./services/radar.pipeline');
const { conectoresAtivos } = require('./services/sources.service');
const contactos = require('./services/contacts.service');

const router = express.Router();

// Todas as rotas do Radar exigem sessão iniciada
router.use(exigirLogin);

const POR_PAGINA = 20;

// GET /api/radar/filtros
// Devolve as opções dos filtros (regiões com os seus países, idiomas, sectores, serviços)
router.get('/filtros', (req, res) => {
    res.json({
        regioes: Object.entries(REGIOES).map(([id, paises]) => ({ id, paises })),
        idiomas: IDIOMAS,
        sectores: SECTORES,
        servicos: SERVICOS
    });
});

// GET /api/radar/empresas?q=&regiao=&pais=&idioma=&sector=&servico=&startup=1&pagina=1
// Pesquisa nas empresas já recolhidas. Todos os parâmetros são opcionais.
router.get('/empresas', async (req, res) => {
    const { q, regiao, pais, idioma, sector, servico, startup, alvo } = req.query;
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);

    // Só aceitamos valores que existem no catálogo (evita pedidos estranhos à base de dados)
    const valido = (valor, lista) => (lista.includes(valor) ? valor : null);
    const regiaoOk = valido(regiao, Object.keys(REGIOES));
    const idiomaOk = valido(idioma, IDIOMAS);
    const sectorOk = valido(sector, SECTORES);
    const servicoOk = valido(servico, SERVICOS);
    const paisOk = /^[A-Z]{2}$/.test(pais || '') ? pais : null;

    // Com o filtro de serviço, só entram empresas que tenham um lead desse serviço (!inner)
    const ligacao = servicoOk ? 'leads!inner' : 'leads';
    let consulta = supabaseAdmin
        .from('empresas')
        .select(`id, nome, tipo_empresa, traducoes, website, dominio, website_estado, cidade, pais, regiao, idioma, sector, descricao, e_startup, pilares_cumpridos,
                 origem_titulo, origem_url, criado_em, ${ligacao}(id, estado, servico_interesse, pontuacao)`,
                { count: 'exact' });

    if (regiaoOk) consulta = consulta.eq('regiao', regiaoOk);
    if (paisOk) consulta = consulta.eq('pais', paisOk);
    if (idiomaOk) consulta = consulta.eq('idioma', idiomaOk);
    if (sectorOk) consulta = consulta.eq('sector', sectorOk);
    if (servicoOk) consulta = consulta.eq('leads.servico_interesse', servicoOk);
    if (startup === '1') consulta = consulta.eq('e_startup', true);
    // "só alvos": esconde grandes empresas e projetos individuais (as ainda não classificadas continuam a aparecer)
    if (alvo === '1') consulta = consulta.or('tipo_empresa.is.null,tipo_empresa.in.(startup,pme)');

    // Texto livre: nome ou descrição. Removemos caracteres com significado especial no filtro.
    const texto = String(q || '').replace(/[,()%*_\\]/g, ' ').trim().slice(0, 80);
    if (texto) consulta = consulta.or(`nome.ilike.%${texto}%,descricao.ilike.%${texto}%`);

    // Startups primeiro, depois as que cumprem mais pilares, depois as mais recentes
    const de = (pagina - 1) * POR_PAGINA;
    const { data, error, count } = await consulta
        .order('e_startup', { ascending: false })
        .order('pilares_cumpridos', { ascending: false, nullsFirst: false })
        .order('criado_em', { ascending: false })
        .range(de, de + POR_PAGINA - 1);

    if (error) return res.status(500).json({ erro: 'Não foi possível pesquisar as empresas.' });

    // Cada empresa mostra a melhor pontuação entre os seus leads
    const empresas = data.map(({ leads, ...empresa }) => {
        const pontos = leads.map((l) => l.pontuacao).filter((p) => p != null);
        return {
            ...empresa,
            melhor_pontuacao: pontos.length ? Math.max(...pontos) : null,
            leads: leads.length
        };
    });

    res.json({ total: count || 0, pagina, por_pagina: POR_PAGINA, empresas });
});

// GET /api/radar/empresas/:id   ficha completa de uma empresa, com os decisores que o site dela publica
const ORDEM_CATEGORIA = { fundador: 0, ceo: 1, marketing: 2, comercial: 3, tecnologia: 4, outro: 5 };

router.get('/empresas/:id', async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ erro: 'Identificador inválido.' });

    const { data: empresa, error } = await supabaseAdmin
        .from('empresas')
        .select('id, nome, origem_data, nao_contactar, tipo_empresa, tipo_motivo, traducoes, website, dominio, website_estado, pais, cidade, morada, telefone, email_geral, email_geral_estado, redes, sobre, descricao, enriquecida_em')
        .eq('id', req.params.id).maybeSingle();
    if (error) return res.status(500).json({ erro: 'Não foi possível obter a empresa.' });
    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const { data: decisores, error: erroDecisores } = await supabaseAdmin
        .from('decisores')
        .select('id, nome, cargo, categoria, linkedin_url, email, fonte_url, recolhido_em, nao_contactar')
        .eq('empresa_id', empresa.id);
    if (erroDecisores) return res.status(500).json({ erro: 'Não foi possível obter os decisores.' });

    decisores.sort((a, b) => (ORDEM_CATEGORIA[a.categoria] ?? 9) - (ORDEM_CATEGORIA[b.categoria] ?? 9));

    // análise do lead (sinais de compra, necessidades, serviços recomendados...) e a sua prioridade, com as parcelas à vista
    const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, estado, servico_interesse, intencao_compra, adequacao_servicos, qualidade_evidencias, potencial_comercial, pontuacao, classificacao, analise, analisada_em, analise_modelo, criado_em')
        .eq('empresa_id', empresa.id).order('pontuacao', { ascending: false, nullsFirst: false }).limit(1);
    const lead = leads?.[0] || null;
    if (lead) {
        const p = calcularPrioridade(lead, { ...empresa, decisores });
        lead.prioridade = { valor: p.prioridade, componentes: p.componentes, pesos: p.pesos };
    }

    // histórico de alterações (empresa, decisores e lead). Se a tabela ainda não existir, a ficha abre na mesma.
    const { data: historico } = await supabaseAdmin
        .from('historico')
        .select('entidade, rotulo, campo, valor_antigo, valor_novo, origem, criado_em')
        .eq('empresa_id', empresa.id)
        // campos técnicos (identificadores internos e o nome normalizado, que serve para detetar duplicados): não interessam a quem lê a ficha
        .not('campo', 'in', '(nome_normalizado,empresa_id,fonte_id,responsavel_id,recolhido_em,traducoes,tipo_motivo)')
        .order('criado_em', { ascending: false }).limit(40);

    res.json({ ...empresa, decisores, lead, historico: historico || [] });
});

// Contatos acrescentados à mão na ficha (só admin e comercial)
const ESTADO_ERRO = { INVALIDO: 400, NAO_ENCONTRADA: 404, DUPLICADO: 409 };
const gravarContacto = (acao) => async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ erro: 'Identificador inválido.' });
    try {
        res.json(await acao(req.params.id, req.body || {}));
    } catch (erro) {
        if (ESTADO_ERRO[erro.codigo]) return res.status(ESTADO_ERRO[erro.codigo]).json({ erro: erro.message, codigo: erro.codigo });
        console.error('Erro ao salvar o contato:', erro.message);
        res.status(500).json({ erro: 'Não foi possível salvar o contato.' });
    }
};
// PUT /api/radar/empresas/:id/contactos   corpo: { email, telefone, whatsapp, instagram, linkedin }
router.put('/empresas/:id/contactos', exigirPapel('admin', 'comercial'), gravarContacto(contactos.guardarContactos));
// POST /api/radar/empresas/:id/pessoas    corpo: { nome, cargo, email, linkedin }
router.post('/empresas/:id/pessoas', exigirPapel('admin', 'comercial'), gravarContacto(contactos.adicionarPessoa));

// POST /api/radar/recolher  corpo (opcional): { "limite": 40, "conectores": ["hacker_news"] }
// Inicia uma recolha em segundo plano e responde logo com o id (o browser vai vendo o progresso).
// Só admin e comercial podem lançar recolhas (cada uma gasta chamadas à Claude).
router.post('/recolher', exigirPapel('admin', 'comercial'), async (req, res) => {
    const limite = Math.max(1, Math.min(LIMITE_MAXIMO, parseInt(req.body?.limite, 10) || LIMITE_POR_DEFEITO));
    const ids = (Array.isArray(req.body?.conectores) ? req.body.conectores : [])
        .filter((id) => CONECTORES.some((c) => c.id === id));

    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ erro: 'A análise com IA ainda não está configurada (falta a ANTHROPIC_API_KEY).' });
    }

    try {
        if (!(await conectoresAtivos(ids)).length) return res.status(409).json({ erro: 'Todas as fontes estão desligadas. Liga uma em Dados → Fontes.', codigo: 'SEM_FONTES' });
        const id = await iniciarRecolha({ utilizadorId: req.utilizador.id, ids, limite });
        res.status(202).json({ id });
    } catch (erro) {
        if (erro.codigo === 'EM_CURSO') return res.status(409).json({ erro: erro.message });
        console.error('Erro ao iniciar a recolha:', erro.message);
        res.status(500).json({ erro: 'Não foi possível iniciar a recolha.' });
    }
});

// GET /api/radar/execucoes   as últimas recolhas (a primeira é a mais recente)
router.get('/execucoes', async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from('radar_execucoes')
        .select('id, estado, fase, identificadas, enriquecidas, qualificadas, itens_lidos, itens_novos, itens_analisados, empresas_criadas, leads_criados, sem_empresa, fora_ambito, erros, iniciada_em, concluida_em')
        .order('iniciada_em', { ascending: false })
        .limit(5);
    if (error) return res.status(500).json({ erro: 'Não foi possível obter as recolhas.' });
    res.json(data);
});

module.exports = router;

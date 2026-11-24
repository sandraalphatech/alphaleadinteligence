const express = require('express');
const { supabaseAdmin } = require('./services/supabase.service');
const { exigirLogin } = require('../middleware/auth.middleware');
const { calcularPrioridade } = require('./services/priority.service');

const router = express.Router();

// Todas as rotas deste ficheiro exigem sessão iniciada
router.use(exigirLogin);

const DIAS_FOLLOWUP = 5;

// GET /api/leads/resumo
// Conta quantos leads existem em cada estado (para os cartões do painel "Hoje")
router.get('/resumo', async (req, res) => {
    const { data, error } = await supabaseAdmin.from('leads').select('estado');
    if (error) return res.status(500).json({ erro: 'Não foi possível obter o resumo.' });

    const porEstado = {};
    for (const lead of data) {
        porEstado[lead.estado] = (porEstado[lead.estado] || 0) + 1;
    }

    res.json({ total: data.length, porEstado });
});

// GET /api/leads/hoje
// Devolve o que merece atenção hoje:
//  - prioridades: leads novos/analisados com a melhor pontuação
//  - followups: leads contactados há X dias sem resposta
router.get('/hoje', async (req, res) => {
    const campos = 'id, estado, servico_interesse, pontuacao, actualizado_em, empresas(nome, pais, sector)';

    // As prioridades só incluem alvos: ficam de fora grandes empresas e projetos individuais (as ainda por classificar entram).
    // Vêm ordenadas pela PRIORIDADE (pontuação + atualidade + possibilidade de contacto + serviço), não só pela pontuação.
    // Buscamos os 200 melhores por pontuação e ordenamos aqui, porque a atualidade e o contacto dependem do dia de hoje e dos decisores.
    const candidatos = await supabaseAdmin
        .from('leads')
        .select(`id, estado, servico_interesse, pontuacao, classificacao, actualizado_em, criado_em,
                 analise_sinais:analise->sinais, analise_servicos:analise->servicos,
                 empresas!inner(nome, pais, sector, origem_data, email_geral, telefone, nao_contactar,
                                decisores(categoria, linkedin_url, email, nao_contactar))`)
        .or('tipo_empresa.is.null,tipo_empresa.in.(startup,pme)', { referencedTable: 'empresas' })
        .in('estado', ['novo', 'analisado'])
        .order('pontuacao', { ascending: false, nullsFirst: false })
        .limit(200);

    const prioridades = candidatos.error ? candidatos : {
        data: candidatos.data
            .map(({ analise_sinais, analise_servicos, ...lead }) => {
                const p = calcularPrioridade({ ...lead, analise: { sinais: analise_sinais || [], servicos: analise_servicos || [] } }, lead.empresas);
                const { decisores, ...empresa } = lead.empresas;                         // os decisores só servem para calcular
                return { ...lead, empresas: empresa, prioridade: p.prioridade, prioridade_detalhe: p.componentes };
            })
            .sort((a, b) => b.prioridade - a.prioridade || (b.pontuacao ?? 0) - (a.pontuacao ?? 0))
            .slice(0, 10)
    };

    const limite = new Date(Date.now() - DIAS_FOLLOWUP * 24 * 60 * 60 * 1000).toISOString();
    const followups = await supabaseAdmin
        .from('leads')
        .select(campos)
        .eq('estado', 'contactado')
        .lt('actualizado_em', limite)
        .order('actualizado_em', { ascending: true })
        .limit(10);

    if (prioridades.error || followups.error) {
        return res.status(500).json({ erro: 'Não foi possível obter os dados de hoje.' });
    }

    res.json({ prioridades: prioridades.data, followups: followups.data });
});

module.exports = router;

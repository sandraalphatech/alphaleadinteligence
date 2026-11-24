const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const relatorios = require('./services/report.service');
const analises = require('./services/monthly-analysis.service');

const { traduzir, guardarIdioma } = require('./services/messages.service');
const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { INVALIDO: 400, VAZIO: 400, LIMITE: 429, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nos relatórios:', String(e.message).slice(0, 300));
    const ia = /credit balance|api[_ ]key|anthropic|overloaded|rate/i.test(e.message);
    res.status(ia ? 502 : 500).json({ erro: traduzir(ia ? 'O serviço de IA não está disponível neste momento.' : 'Não foi possível concluir a operação.', res.locals.idioma), codigo: ia ? 'IA' : 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeGerar = exigirPapel('admin', 'comercial');       // o papel «leitura» só vê

// GET /api/relatorios?mes=AAAA-MM   (sem «mes»: o mês atual). Todos os papéis veem: são só números agregados.
router.get('/', tratar(async (req, res) => res.json(await relatorios.relatorioMensal(req.query.mes))));

// GET /api/relatorios/analise?mes=AAAA-MM&idioma=pt: a análise guardada desse mês (ou { item: null }); item = { mes, idioma, analise, modelo, parcial, criado_em }
router.get('/analise', tratar(async (req, res) => res.json({ item: await analises.obterAnalise(req.query.mes, req.query.idioma) })));

// POST /api/relatorios/analise   corpo: { mes, idioma, forcar }: gera (ou devolve a guardada, se não se pedir para forçar)
router.post('/analise', podeGerar, tratar(async (req, res) => {
    const b = req.body || {};
    res.json(await analises.gerarAnalise(b.mes, b.idioma, req.utilizador, { forcar: b.forcar === true }));
}));

module.exports = router;

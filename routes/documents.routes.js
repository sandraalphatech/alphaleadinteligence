const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const proposta = require('./services/proposal.service');

const { traduzir, guardarIdioma } = require('./services/messages.service');
const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400, PROPOSTA_ESTADO: 409, LIMITE: 429, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nos documentos:', String(e.message).slice(0, 300));
    const ia = /credit balance|api[_ ]key|anthropic|overloaded|rate/i.test(e.message);
    res.status(ia ? 502 : 500).json({ erro: traduzir(ia ? 'O serviço de IA não está disponível neste momento.' : 'Não foi possível concluir a operação.', res.locals.idioma), codigo: ia ? 'IA' : 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');

// GET /api/documentos/catalogo: serviços (com textos por idioma), condições por defeito e dados da Alpha Tech
router.get('/catalogo', tratar(async (req, res) => res.json(proposta.catalogo())));

// GET /api/documentos/elegiveis: só os leads em reunião agendada (os únicos para os quais se criam propostas)
router.get('/elegiveis', tratar(async (req, res) => res.json({ leads: await proposta.leadsElegiveis({ incluir: req.query.cliente }) })));

// GET /api/documentos/propostas?lead=<id>
router.get('/propostas', tratar(async (req, res) => res.json({ propostas: await proposta.listarPropostas({ leadId: req.query.lead }) })));

// GET /api/documentos/propostas/:id
router.get('/propostas/:id', tratar(async (req, res) => res.json(await proposta.obterProposta(req.params.id))));

// POST /api/documentos/leads/:id/propostas   corpo: os dados do formulário (ver proposal.service.js)
router.post('/leads/:id/propostas', podeEditar, tratar(async (req, res) => res.status(201).json(await proposta.criarProposta(req.params.id, req.body || {}, req.utilizador))));

// POST /api/documentos/leads/:id/sugestao   corpo: { idioma, itens: [{ servico, nome }] }: a IA escreve os textos (nunca os preços)
router.post('/leads/:id/sugestao', podeEditar, tratar(async (req, res) => res.json(await proposta.sugerirTexto(req.params.id, req.body || {}, req.utilizador))));

// PUT /api/documentos/propostas/:id
router.put('/propostas/:id', podeEditar, tratar(async (req, res) => res.json(await proposta.atualizarProposta(req.params.id, req.body || {}))));

// POST /api/documentos/propostas/:id/enviada: marca como enviada e passa o lead a «proposta enviada»
router.post('/propostas/:id/enviada', podeEditar, tratar(async (req, res) => res.json(await proposta.marcarEnviada(req.params.id, req.utilizador))));

// DELETE /api/documentos/propostas/:id
router.delete('/propostas/:id', podeEditar, tratar(async (req, res) => { await proposta.apagarProposta(req.params.id); res.status(204).end(); }));

module.exports = router;

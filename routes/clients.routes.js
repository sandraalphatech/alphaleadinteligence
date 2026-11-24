const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const contratos = require('./services/contract.service');
const proposta = require('./services/proposal.service');

const { traduzir, guardarIdioma } = require('./services/messages.service');
const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400, CLIENTE_ESTADO: 409, CONTRATO_BLOQUEADO: 409, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo, ...(e.faltam ? { faltam: e.faltam } : {}) });
    console.error('Erro nos clientes:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');

// GET /api/clientes: os clientes ganhos, com o estado do contrato e as datas
router.get('/', tratar(async (req, res) => res.json(await contratos.listarClientes())));

// GET /api/clientes/catalogo: serviços (com textos por idioma), dados da Alpha Tech e valores por defeito dos contratos
router.get('/catalogo', tratar(async (req, res) => res.json({ ...proposta.catalogo(), defeitos: contratos.defeitos() })));

// Contratos (antes de /:lead para o caminho não se confundir)
router.get('/contratos/:id', tratar(async (req, res) => res.json(await contratos.contratoCompleto(req.params.id))));
router.put('/contratos/:id', podeEditar, tratar(async (req, res) => res.json(await contratos.atualizarContrato(req.params.id, req.body || {}))));
router.delete('/contratos/:id', podeEditar, tratar(async (req, res) => { await contratos.apagarContrato(req.params.id); res.status(204).end(); }));
router.post('/contratos/:id/enviado', podeEditar, tratar(async (req, res) => res.json(await contratos.marcarEnviado(req.params.id))));
router.post('/contratos/:id/reabrir', podeEditar, tratar(async (req, res) => res.json(await contratos.reabrirContrato(req.params.id))));
router.post('/contratos/:id/assinado', podeEditar, tratar(async (req, res) => res.json(await contratos.anexarAssinado(req.params.id, req.body || {}))));
router.delete('/contratos/:id/assinado', podeEditar, tratar(async (req, res) => res.json(await contratos.removerAssinado(req.params.id))));
router.get('/contratos/:id/assinado', tratar(async (req, res) => res.json(await contratos.ligacaoAssinado(req.params.id))));

// Um cliente: contratos, propostas e sugestões de propostas futuras
router.get('/:lead', tratar(async (req, res) => res.json(await contratos.obterCliente(req.params.lead))));
router.get('/:lead/preparar', podeEditar, tratar(async (req, res) => res.json(await contratos.prepararContrato(req.params.lead, req.query.proposta))));
router.post('/:lead/contratos', podeEditar, tratar(async (req, res) => res.status(201).json(await contratos.criarContrato(req.params.lead, req.body || {}, req.utilizador))));

module.exports = router;

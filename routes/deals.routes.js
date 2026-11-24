const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const negocios = require('./services/deal.service');
const { traduzir, guardarIdioma } = require('./services/messages.service');

const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400, BLOQUEADO: 409, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nos negócios:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');       // o papel «leitura» só vê

// GET /api/negocios?estado=aberto|ganho|perdido|todos&q=&responsavel=
router.get('/', tratar(async (req, res) => res.json(await negocios.listarNegocios(req.query))));
// GET /api/negocios/empresas?q=: empresas (que se podem contactar) para escolher ao criar um negócio
router.get('/empresas', tratar(async (req, res) => res.json({ empresas: await negocios.procurarEmpresas(req.query.q) })));
// GET /api/negocios/propostas?lead=<id>: as propostas desse lead, com o valor sugerido para o negócio
router.get('/propostas', tratar(async (req, res) => res.json({ propostas: await negocios.propostasDoLead(req.query.lead) })));
// POST /api/negocios   corpo: { empresa_id, lead_id?, titulo?, valor?, moeda?, etapa?, data_prevista?, responsavel_id? }
router.post('/', podeEditar, tratar(async (req, res) => res.status(201).json(await negocios.criarNegocio(req.body || {}, req.utilizador))));
// PATCH /api/negocios/:id   corpo: { titulo?, valor?, moeda?, etapa?, data_prevista?, responsavel_id? }
router.patch('/:id', podeEditar, tratar(async (req, res) => res.json(await negocios.atualizarNegocio(req.params.id, req.body || {}))));
// POST /api/negocios/:id/ganho  |  /perdido (corpo: { motivo? })  |  /reabrir
router.post('/:id/ganho', podeEditar, tratar(async (req, res) => res.json(await negocios.fecharNegocio(req.params.id, 'ganho'))));
router.post('/:id/perdido', podeEditar, tratar(async (req, res) => res.json(await negocios.fecharNegocio(req.params.id, 'perdido', req.body?.motivo))));
router.post('/:id/reabrir', podeEditar, tratar(async (req, res) => res.json(await negocios.reabrirNegocio(req.params.id))));
// DELETE /api/negocios/:id
router.delete('/:id', podeEditar, tratar(async (req, res) => { await negocios.apagarNegocio(req.params.id); res.status(204).end(); }));

module.exports = router;

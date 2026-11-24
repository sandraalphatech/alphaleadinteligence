const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const tarefas = require('./services/task.service');
const negocios = require('./services/deal.service');
const { traduzir, guardarIdioma } = require('./services/messages.service');

const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nas tarefas:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');       // o papel «leitura» só vê

// GET /api/tarefas?estado=aberta|concluida|todas&responsavel=<id>|eu|nenhum&criada_por=<id>|eu&q=
router.get('/', tratar(async (req, res) => res.json(await tarefas.listarTarefas(req.query, req.utilizador))));
// GET /api/tarefas/empresas?q=: empresas (que se podem contactar), cada uma com o seu melhor lead, para criar uma tarefa
router.get('/empresas', tratar(async (req, res) => res.json({ empresas: await negocios.procurarEmpresas(req.query.q) })));
// POST /api/tarefas   corpo: { lead_id, titulo, tipo?, prazo, responsavel_id?, planeamento? }
router.post('/', podeEditar, tratar(async (req, res) => res.status(201).json(await tarefas.criarTarefa(req.body || {}, req.utilizador))));
// PATCH /api/tarefas/:id   corpo: { titulo?, tipo?, prazo?, responsavel_id?, planeamento?, concluida? }
router.patch('/:id', podeEditar, tratar(async (req, res) => res.json(await tarefas.atualizarTarefa(req.params.id, req.body || {}))));
// DELETE /api/tarefas/:id
router.delete('/:id', podeEditar, tratar(async (req, res) => { await tarefas.apagarTarefa(req.params.id); res.status(204).end(); }));

module.exports = router;

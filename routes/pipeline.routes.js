const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const pipeline = require('./services/pipeline.service');
const contactToday = require('./services/contact-today.service');

const { traduzir, guardarIdioma } = require('./services/messages.service');
const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro no pipeline:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');

// GET /api/pipeline/leads?q=&estado=&servico=&classificacao=&responsavel=   (responsavel: um id ou "nenhum")
router.get('/leads', tratar(async (req, res) => res.json(await pipeline.listarLeads(req.query))));

// GET /api/pipeline/hoje: o que contactar hoje, por canal, e as respostas por responder
router.get('/hoje', tratar(async (req, res) => res.json(await contactToday.contactarHoje(req.utilizador))));

// GET /api/pipeline/hoje/respostas: quantas respostas de clientes estão por responder (o número do menu)
router.get('/hoje/respostas', tratar(async (req, res) => res.json(await contactToday.contarRespostas())));

// GET /api/pipeline/leads/:id: a ficha do lead (contactos, tarefas, linha do tempo)
router.get('/leads/:id', tratar(async (req, res) => {
    const lead = await pipeline.obterLead(req.params.id);
    if (!lead) return res.status(404).json({ erro: 'Lead não encontrado.', codigo: 'NAO_ENCONTRADA' });
    res.json(lead);
}));

// PATCH /api/pipeline/leads/:id   corpo: { estado?, responsavel_id? }
router.patch('/leads/:id', podeEditar, tratar(async (req, res) => res.json(await pipeline.mudarLead(req.params.id, req.body, req.utilizador))));

// POST /api/pipeline/leads/:id/tarefas   corpo: { titulo, tipo?, prazo (AAAA-MM-DD), responsavel_id? }
router.post('/leads/:id/tarefas', podeEditar, tratar(async (req, res) => res.status(201).json(await pipeline.criarTarefa(req.params.id, req.body || {}, req.utilizador))));

// POST /api/pipeline/leads/:id/interaccoes   corpo: { canal, direcao?, conteudo, assunto?, data? }
router.post('/leads/:id/interaccoes', podeEditar, tratar(async (req, res) => res.status(201).json(await pipeline.registarInteraccao(req.params.id, req.body || {}, req.utilizador))));

// PATCH /api/pipeline/tarefas/:id   corpo: { concluida?, titulo?, prazo?, tipo?, responsavel_id? }
router.patch('/tarefas/:id', podeEditar, tratar(async (req, res) => res.json(await pipeline.atualizarTarefa(req.params.id, req.body || {}))));

// DELETE /api/pipeline/tarefas/:id
router.delete('/tarefas/:id', podeEditar, tratar(async (req, res) => { await pipeline.apagarTarefa(req.params.id); res.status(204).end(); }));

// GET /api/pipeline/tarefas?dias=3: tarefas por fazer (atrasadas e a vencer), para o painel "Hoje"
router.get('/tarefas', tratar(async (req, res) => res.json({ tarefas: await pipeline.tarefasPorFazer({ dias: req.query.dias }) })));

module.exports = router;

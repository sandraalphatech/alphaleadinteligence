const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const google = require('./services/google-calendar.service');
const { traduzir, guardarIdioma } = require('./services/messages.service');

const router = express.Router();
router.use(guardarIdioma);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { INVALIDO: 400, NAO_LIGADO: 409, AUTORIZACAO: 409, CONFIG: 503, GOOGLE: 502 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro no Google Calendar:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const soAdmin = exigirPapel('admin');

// GET /api/google/callback: regresso do Google (sem sessão: o «state» assinado prova quem pediu a ligação). Volta à página das Tarefas.
router.get('/callback', async (req, res) => {
    const voltar = (resultado, motivo) => res.redirect(`/assets/pages/tasks.html#google=${resultado}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`);
    try { await google.concluirLigacao({ code: req.query.code, state: req.query.state, error: req.query.error }); voltar('ok'); }
    catch (e) { voltar('erro', ['ESTADO', 'RECUSADO', 'SEM_REFRESH', 'CONFIG'].includes(e.codigo) ? e.codigo : (e.motivo || 'GOOGLE')); if (!['ESTADO', 'RECUSADO'].includes(e.codigo)) console.error('Google Calendar (ligação):', String(e.message).slice(0, 200)); }
});

router.use(exigirLogin);

// GET /api/google/estado: configurado? ligado? a que conta? algum erro?
router.get('/estado', tratar(async (req, res) => res.json(await google.estado())));

// POST /api/google/ligar (administrador): devolve o endereço do Google onde se autoriza
router.post('/ligar', soAdmin, tratar(async (req, res) => res.json({ url: await google.urlParaLigar(req.utilizador) })));

// POST /api/google/desligar (administrador)
router.post('/desligar', soAdmin, tratar(async (req, res) => { await google.desligar(); res.json(await google.estado()); }));

// POST /api/google/sincronizar (administrador): envia para o Google as reuniões e tarefas com hora que ainda estão por fazer
router.post('/sincronizar', soAdmin, tratar(async (req, res) => res.json(await google.sincronizarTodas())));

// GET /api/google/eventos?de=AAAA-MM-DD&ate=AAAA-MM-DD: os eventos do Google (só leitura) para o calendário das Tarefas
router.get('/eventos', tratar(async (req, res) => res.json(await google.listarEventos({ de: req.query.de, ate: req.query.ate }))));

module.exports = router;

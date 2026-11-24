const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const { criarClienteLogin } = require('./services/supabase.service');
const definicoes = require('./services/settings.service');
const { traduzir, guardarIdioma } = require('./services/messages.service');

const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400, CONFIG: 503 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nas definições:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const soAdmin = exigirPapel('admin');

// O perfil de quem tem sessão iniciada (todos os papéis): nome, email, papel e idioma preferido.
router.get('/perfil', tratar(async (req, res) => res.json(await definicoes.obterPerfil(req.utilizador))));
// PUT /api/definicoes/perfil   corpo: { nome?, idioma? }. Cada um só altera o PRÓPRIO perfil (o id vem da sessão, nunca do pedido).
router.put('/perfil', tratar(async (req, res) => res.json(await definicoes.atualizarPerfil(req.utilizador, req.body || {}))));
// POST /api/definicoes/perfil/palavra-passe: envia para o PRÓPRIO email o link para redefinir a palavra-passe
router.post('/perfil/palavra-passe', tratar(async (req, res) => {
    const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    await criarClienteLogin().auth.resetPasswordForEmail(req.utilizador.email, { redirectTo: `${base}/assets/pages/redefine.html` });
    res.json({ ok: true });
}));

// Equipa e papéis: só o admin
router.get('/equipa', soAdmin, tratar(async (req, res) => res.json({ equipa: await definicoes.listarEquipa() })));
router.put('/equipa/:id', soAdmin, tratar(async (req, res) => res.json(await definicoes.mudarPapel(req.utilizador, req.params.id, req.body?.papel))));

// Integrações (só sim/não, nunca segredos) para admin e comercial; limites em vigor para todos
router.get('/integracoes', exigirPapel('admin', 'comercial'), tratar(async (req, res) => res.json(definicoes.estadoIntegracoes())));
router.get('/limites', tratar(async (req, res) => res.json(definicoes.limites())));

module.exports = router;

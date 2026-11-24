// Webhook do WhatsApp (API da Meta). É PÚBLICO (a Meta não tem login), por isso:
//  - o pedido de verificação (GET) só responde se o token coincidir com WHATSAPP_VERIFY_TOKEN;
//  - cada aviso (POST) só é aceite com a assinatura HMAC válida (WHATSAPP_APP_SECRET); sem segredo configurado, recusa tudo.
// Serve para saber se a mensagem foi entregue ou lida, para registar as respostas e para tratar o pedido "PARAR".
// Só funciona com o servidor acessível na internet (um endereço https público), não em localhost.
const express = require('express');
const wa = require('./services/whatsapp.service');

const router = express.Router();

// GET /api/whatsapp/webhook: a Meta confirma que o endereço é nosso
router.get('/webhook', (req, res) => {
    const desafio = wa.verificarWebhook(req.query);
    if (desafio === null) return res.sendStatus(403);
    res.type('text/plain').send(desafio);
});

// POST /api/whatsapp/webhook: avisos de estado e mensagens recebidas. O corpo em bruto (req.rawBody) é guardado em server.js.
router.post('/webhook', async (req, res) => {
    const segredo = wa.ambiente.segredo();
    if (!segredo) return res.sendStatus(503);
    if (!wa.assinaturaValida(req.rawBody, req.get('X-Hub-Signature-256'), segredo)) return res.sendStatus(401);
    try { await wa.processarWebhook(req.body); }
    catch (e) { console.error('Erro ao tratar o aviso do WhatsApp:', String(e.message).slice(0, 200)); }
    res.sendStatus(200);                                   // 200 sempre que a assinatura é válida: assim a Meta não repete o aviso sem fim
});

module.exports = router;

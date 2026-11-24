const express = require('express');
const { exigirLogin, exigirPapel } = require('../middleware/auth.middleware');
const importacao = require('./services/import.service');
const exportacao = require('./services/export.service');
const dnc = require('./services/dnc.service');
const fontes = require('./services/sources.service');

const { traduzir, guardarIdioma } = require('./services/messages.service');
const router = express.Router();
router.use(guardarIdioma);
router.use(exigirLogin);

// Os detalhes técnicos ficam no servidor; o browser só recebe uma mensagem curta e um código.
function responderErro(res, e) {
    const estados = { NAO_ENCONTRADA: 404, INVALIDO: 400, VAZIO: 400 };
    if (estados[e.codigo]) return res.status(estados[e.codigo]).json({ erro: traduzir(e.message, res.locals.idioma), codigo: e.codigo });
    console.error('Erro nos dados:', String(e.message).slice(0, 300));
    res.status(500).json({ erro: traduzir('Não foi possível concluir a operação.', res.locals.idioma), codigo: 'ERRO' });
}
const tratar = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { responderErro(res, e); } };
const podeEditar = exigirPapel('admin', 'comercial');       // o papel «leitura» só vê
const soAdmin = exigirPapel('admin');

// ---------- importar ----------
// POST /api/dados/importar/previsao   corpo: { csv }: analisa o ficheiro e mostra o que aconteceria. Não grava nada.
// os motivos e avisos de cada linha saem no idioma de quem fez o pedido
const traduzirPrevia = (previa, idioma) => ({ ...previa, linhas: previa.linhas.map((l) => ({ ...l, motivos: l.motivos.map((x) => traduzir(x, idioma)), avisos: l.avisos.map((x) => traduzir(x, idioma)) })) });
router.post('/importar/previsao', podeEditar, tratar(async (req, res) => res.json(traduzirPrevia(await importacao.previsao(req.body?.csv), res.locals.idioma))));
// POST /api/dados/importar   corpo: { csv, ficheiro }: volta a analisar e grava as empresas novas
router.post('/importar', podeEditar, tratar(async (req, res) => res.status(201).json(await importacao.importarCsv(req.body?.csv, { nomeFicheiro: req.body?.ficheiro, utilizador: req.utilizador }))));

// ---------- exportar ----------
// GET /api/dados/exportar/:tipo?sep=;&conteudo=1&estado=...: descarrega um CSV (leads aceita os filtros da página Leads)
router.get('/exportar/:tipo', podeEditar, tratar(async (req, res) => {
    const { sep, conteudo, ...filtros } = req.query;
    const r = await exportacao.exportar(req.params.tipo, { filtros, separador: sep === ',' ? ',' : sep === 'tab' ? '\t' : ';', conteudo: conteudo === '1', naoContactar: () => dnc.listar() });
    const nome = `${r.nome}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store', 'X-Linhas': String(r.linhas) });
    res.send(r.csv);
}));

// ---------- não contactar ----------
router.get('/nao-contactar', tratar(async (req, res) => res.json(await dnc.listar())));
router.get('/nao-contactar/procurar', tratar(async (req, res) => res.json({ empresas: await dnc.procurar(req.query.q) })));
router.post('/nao-contactar/empresas/:id', podeEditar, tratar(async (req, res) => res.status(201).json(await dnc.adicionarEmpresa(req.params.id))));
router.delete('/nao-contactar/empresas/:id', soAdmin, tratar(async (req, res) => res.json(await dnc.removerEmpresa(req.params.id))));
router.put('/nao-contactar/pessoas/:id', podeEditar, tratar(async (req, res) => res.json(await dnc.alterarPessoa(req.params.id, req.body?.nao_contactar !== false))));
router.delete('/nao-contactar/pessoas/:id', soAdmin, tratar(async (req, res) => res.json(await dnc.alterarPessoa(req.params.id, false))));

// ---------- fontes ----------
router.get('/fontes', tratar(async (req, res) => res.json({ fontes: await fontes.listar() })));
router.patch('/fontes/:id', soAdmin, tratar(async (req, res) => res.json(await fontes.alterar(req.params.id, req.body?.activa === true))));

module.exports = router;

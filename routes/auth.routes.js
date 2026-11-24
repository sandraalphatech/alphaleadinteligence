const express = require('express');
const { criarClienteLogin, supabaseAdmin } = require('./services/supabase.service');
const { exigirLogin } = require('../middleware/auth.middleware');

const router = express.Router();

// POST /api/auth/login   corpo: { "email": "...", "password": "..." }
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ erro: 'Indique o email e a palavra-passe.' });
    }

    const { data, error } = await criarClienteLogin().auth.signInWithPassword({ email, password });

    if (error) {
        // Mensagem genérica de propósito: não revela se o email existe
        return res.status(401).json({ erro: 'Email ou palavra-passe incorrectos.' });
    }

    res.json({
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expira_em: data.session.expires_at
    });
});

// POST /api/auth/refresh   corpo: { "refresh_token": "..." }
// O token dura cerca de 1 hora; esta rota troca-o por um novo sem pedir a palavra-passe.
router.post('/refresh', async (req, res) => {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ erro: 'Falta o refresh_token.' });

    const { data, error } = await criarClienteLogin().auth.refreshSession({ refresh_token });
    if (error || !data.session) return res.status(401).json({ erro: 'Sessão expirada.' });

    res.json({
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expira_em: data.session.expires_at
    });
});

// POST /api/auth/recover   corpo: { "email": "..." }
// Passo 1 da recuperação: o Supabase envia um email com um link para redefinir a palavra-passe.
// A resposta é SEMPRE a mesma, exista o email ou não (não revela quem tem conta).
router.post('/recover', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ erro: 'Indique o seu email.' });

    const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    await criarClienteLogin().auth.resetPasswordForEmail(email, {
        redirectTo: `${base}/assets/pages/redefine.html`
    });

    res.json({ mensagem: 'Se o email existir, enviámos um link para redefinir a palavra-passe.' });
});

// POST /api/auth/redefine   corpo: { "token": "...", "password": "..." }
// Passo 2: o token vem no link do email. Confirmamos que é válido e gravamos a nova palavra-passe.
router.post('/redefine', async (req, res) => {
    const { token, password } = req.body || {};

    if (!token || !password) return res.status(400).json({ erro: 'Dados em falta.' });
    if (password.length < 8) return res.status(400).json({ erro: 'A palavra-passe deve ter pelo menos 8 caracteres.' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
        return res.status(401).json({ erro: 'O link expirou ou já foi utilizado. Peça um novo.' });
    }

    const { error: erroAtualizar } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password });
    if (erroAtualizar) return res.status(400).json({ erro: 'Não foi possível guardar a nova palavra-passe.' });

    // fecha as outras sessões abertas (se alguém tinha acesso, deixa de ter)
    try { await supabaseAdmin.auth.admin.signOut(token, 'global'); } catch { /* a palavra-passe já foi alterada: não falhar por isto */ }

    res.json({ mensagem: 'Palavra-passe alterada com sucesso.' });
});

// GET /api/auth/me (protegida) devolve quem está com sessão iniciada
router.get('/me', exigirLogin, async (req, res) => {
    // o idioma preferido está na conta; se a coluna ainda não existir (database/settings.sql por correr), vem null e tudo funciona na mesma
    const { data, error } = await supabaseAdmin.from('utilizadores').select('idioma').eq('id', req.utilizador.id).maybeSingle();
    res.json({ ...req.utilizador, idioma: !error && ['pt', 'en', 'es'].includes(data?.idioma) ? data.idioma : null });
});

module.exports = router;

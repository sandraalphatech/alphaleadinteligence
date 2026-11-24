const { supabaseAdmin } = require('../routes/services/supabase.service');

// Guarda de segurança: corre ANTES de cada rota protegida.
// Verifica o token enviado pelo browser no cabeçalho
//   Authorization: Bearer <token>
// Se for válido, deixa passar e disponibiliza req.utilizador.
async function exigirLogin(req, res, next) {
    const cabecalho = req.headers.authorization || '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

    if (!token) {
        return res.status(401).json({ erro: 'Sessão não iniciada.' });
    }

    // O Supabase confirma se o token é válido e não expirou
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    // Vai buscar o papel (admin, comercial, leitura) à nossa tabela
    const { data: perfil } = await supabaseAdmin
        .from('utilizadores')
        .select('id, nome, email, papel')
        .eq('id', data.user.id)
        .single();

    if (!perfil) {
        return res.status(403).json({ erro: 'Utilizador sem perfil na plataforma.' });
    }

    req.utilizador = perfil;
    next();
}

// Segunda guarda: limita uma rota a certos papéis.
// Exemplo: router.delete('/:id', exigirLogin, exigirPapel('admin'), ...)
function exigirPapel(...papeisPermitidos) {
    return (req, res, next) => {
        if (!papeisPermitidos.includes(req.utilizador.papel)) {
            return res.status(403).json({ erro: 'Sem permissão para esta acção.' });
        }
        next();
    };
}

module.exports = { exigirLogin, exigirPapel };

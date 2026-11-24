const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_PUBLIC_KEY, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY || !SUPABASE_SECRET_KEY) {
    throw new Error('Faltam variáveis do Supabase no ficheiro .env');
}

// Cliente "administrador": usa a chave secreta (secret key), ignora as regras RLS.
// Só pode existir no backend. NUNCA enviar esta chave para o browser.
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// Cliente "público": usa a chave pública (public key), serve para fazer login.
// Criamos um novo por cada login para que as sessões não se misturem.
function criarClienteLogin() {
    return createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
}

module.exports = { supabaseAdmin, criarClienteLogin };

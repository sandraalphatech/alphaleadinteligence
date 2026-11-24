/* recover.js: páginas "Recuperar palavra-passe" e "Nova palavra-passe" (textos vêm de i18n.js) */

(() => {
    const erro = document.getElementById('erro');
    const ok = document.getElementById('ok');
    const botao = document.getElementById('btn');

    const limpar = () => { erro.hidden = true; ok.hidden = true; };
    const botaoTexto = (chave) => { botao.dataset.i18n = chave; I18N.aplicar(); };

    // Envia o pedido. Em caso de erro, devolve uma CHAVE de tradução (não texto).
    async function enviar(url, corpo, erroPorEstado = {}) {
        let resposta;
        try {
            resposta = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo)
            });
        } catch { throw new Error('err_generic'); }
        if (!resposta.ok) {
            const servidorErrado = resposta.status === 404 || resposta.status === 405;
            throw new Error(erroPorEstado[resposta.status] || (resposta.status === 429 ? 'err_rate' : servidorErrado ? 'err_server' : 'err_generic'));
        }
    }

    // ---------- passo 1: pedir o email com o link ----------
    const formRecover = document.getElementById('form-recover');
    if (formRecover) {
        formRecover.addEventListener('submit', async (e) => {
            e.preventDefault();
            limpar();

            const email = formRecover.email.value.trim();
            if (!email) return I18N.mensagem(erro, 'err_email');

            botao.disabled = true;
            botaoTexto('rec_sending');
            try {
                await enviar('/api/auth/recover', { email }, { 400: 'err_email' });
                I18N.mensagem(ok, 'rec_ok');
            } catch (err) {
                I18N.mensagem(erro, err.message);
            }
            botao.disabled = false;
            botaoTexto('rec_btn');
        });
    }

    // ---------- passo 2: definir a nova palavra-passe ----------
    const formRedefine = document.getElementById('form-redefine');
    if (formRedefine) {
        // O Supabase põe o token no endereço, depois do "#": ...redefine.html#access_token=...
        const params = new URLSearchParams(location.hash.slice(1));
        const token = params.get('access_token');
        history.replaceState(null, '', location.pathname);   // tira o token do endereço visível

        if (!token) {
            I18N.mensagem(erro, params.get('error_description') ? 'err_expired' : 'err_invalid');
            botao.disabled = true;
        }

        formRedefine.addEventListener('submit', async (e) => {
            e.preventDefault();
            limpar();

            const { password, password2 } = formRedefine;
            if (password.value.length < 8) return I18N.mensagem(erro, 'err_short');
            if (password.value !== password2.value) return I18N.mensagem(erro, 'err_match');

            botao.disabled = true;
            botaoTexto('pwd_saving');
            try {
                await enviar('/api/auth/redefine', { token, password: password.value },
                    { 400: 'err_short', 401: 'err_expired' });
                I18N.mensagem(ok, 'pwd_done');
                setTimeout(() => location.replace('/assets/pages/login.html'), 2200);
            } catch (err) {
                I18N.mensagem(erro, err.message);
                botao.disabled = false;
                botaoTexto('pwd_save');
            }
        });
    }
})();

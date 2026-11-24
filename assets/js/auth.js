/* auth.js: lógica da página de login (textos vêm de i18n.js) */

(() => {
    const CHAVE_TOKEN = 'ns_token';
    const CHAVE_REFRESH = 'ns_refresh';

    // Se já tem sessão, vai direto para o painel
    if (localStorage.getItem(CHAVE_TOKEN)) location.replace('/assets/pages/dashboard.html');

    const form = document.getElementById('form-login');
    const erro = document.getElementById('erro');
    const botao = document.getElementById('btn-entrar');

    const repor = () => { botao.disabled = false; botao.dataset.i18n = 'signin'; I18N.aplicar(); };

    form.addEventListener('submit', async (evento) => {
        evento.preventDefault();          // impede a página de recarregar
        erro.hidden = true;

        const email = form.email.value.trim();
        const password = form.password.value;
        if (!email || !password) return I18N.mensagem(erro, 'err_fields');

        botao.disabled = true;
        botao.dataset.i18n = 'signing';
        I18N.aplicar();

        try {
            const resposta = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const dados = await resposta.json().catch(() => ({}));

            if (!resposta.ok) {
                // 401 = credenciais erradas; outros códigos = erro genérico
                // 404/405 = a página não está a ser servida pelo nosso servidor Node
                const chave = resposta.status === 401 ? 'err_login'
                    : resposta.status === 429 ? 'err_rate'
                    : (resposta.status === 404 || resposta.status === 405) ? 'err_server' : 'err_generic';
                throw new Error(chave);
            }

            localStorage.setItem(CHAVE_TOKEN, dados.token);
            localStorage.setItem(CHAVE_REFRESH, dados.refresh_token);
            location.replace('/assets/pages/dashboard.html');
        } catch (e) {
            I18N.mensagem(erro, e.message.startsWith('err_') ? e.message : 'err_generic');
            repor();
        }
    });
})();

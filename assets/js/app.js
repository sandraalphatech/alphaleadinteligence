/* ============================================================
   app.js: código partilhado por todas as páginas internas.
   - guarda de sessão (sem login, volta para a página de login)
   - função api() para falar com o backend
   - menu lateral desenhado uma só vez para todas as páginas
   ============================================================ */

const NS = (() => {
    const CHAVE_TOKEN = 'ns_token';
    const CHAVE_REFRESH = 'ns_refresh';
    const PAGINA_LOGIN = '/assets/pages/login.html';

    // ---------- sessão ----------
    const guardar = (t, r) => { localStorage.setItem(CHAVE_TOKEN, t); localStorage.setItem(CHAVE_REFRESH, r); };
    const limpar = () => { localStorage.removeItem(CHAVE_TOKEN); localStorage.removeItem(CHAVE_REFRESH); };
    const token = () => localStorage.getItem(CHAVE_TOKEN);

    function sair() { limpar(); location.replace(PAGINA_LOGIN); }

    // Pede um token novo com o refresh_token. Devolve true se conseguiu.
    async function renovar() {
        const refresh_token = localStorage.getItem(CHAVE_REFRESH);
        if (!refresh_token) return false;
        try {
            const r = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token })
            });
            if (!r.ok) return false;
            const d = await r.json();
            guardar(d.token, d.refresh_token);
            return true;
        } catch { return false; }
    }

    // ---------- chamadas à API ----------
    // Junta o token a cada pedido. Se expirou, tenta renovar uma vez.
    async function api(caminho, opcoes = {}, jaRenovou = false) {
        const resposta = await fetch(caminho, {
            ...opcoes,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token(), 'X-Idioma': I18N.idioma(), ...(opcoes.headers || {}) }
        });

        if (resposta.status === 401) {
            if (!jaRenovou && await renovar()) return api(caminho, opcoes, true);
            sair();
            throw new Error(I18N.t('err_session'));
        }

        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            const erro = new Error(dados.erro || I18N.t('err_generic'));
            erro.status = resposta.status;          // permite à página distinguir, por exemplo, 409 de 503
            erro.codigo = dados.codigo;             // código do motivo (IA, LIMITE, BLOQUEADO, SMTP, CONFIG...), quando o servidor o envia
            erro.bloqueios = dados.bloqueios;
            erro.faltam = dados.faltam;                // o que falta preencher (contratos)
            throw erro;
        }
        return dados;
    }

    // ---------- utilitários ----------
    // Protege contra HTML injectado nos dados (segurança básica, usar sempre!)
    const esc = (txt) => String(txt ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Nomes de estados e serviços vêm do dicionário (i18n.js), no idioma escolhido.
    // Se aparecer um valor desconhecido, mostra-o tal como está.
    const traduzir = (prefixo, valor) => {
        const chave = prefixo + valor;
        const texto = I18N.t(chave);
        return texto === chave ? (valor || '') : texto;
    };
    const estado = (valor) => traduzir('estado_', valor);
    const servico = (valor) => traduzir('servico_', valor);

    // ---------- menu lateral ----------
    const ICONES = {
        hoje: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
        radar: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/></svg>',
        leads: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        contactar: '<svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
        clientes: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.3 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>',
        tarefas: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9l2 2 3.5-4M8 16h8"/></svg>',
        negocios: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="10" y="3" width="5" height="12" rx="1.5"/><rect x="17" y="3" width="4" height="8" rx="1.5"/></svg>',
        documentos: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>',
        relatorios: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
        definicoes: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
        dados: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>'
    };

    const PAGINAS = [
        { id: 'hoje', href: '/assets/pages/dashboard.html' },
        { id: 'radar', href: '/assets/pages/radar.html' },
        { id: 'leads', href: '/assets/pages/leads.html' },
        { id: 'negocios', href: '/assets/pages/deals.html' },
        { id: 'clientes', href: '/assets/pages/clients.html' },
        { id: 'tarefas', href: '/assets/pages/tasks.html' },
        { id: 'documentos', href: '/assets/pages/documents.html' },
        { id: 'relatorios', href: '/assets/pages/reports.html' },
        { id: 'dados', href: '/assets/pages/data.html' },
        { id: 'definicoes', href: '/assets/pages/settings.html' }
    ];

    function desenharMenu(paginaActual) {
        // data-i18n com a chave nav_<página>: o texto é preenchido por I18N.aplicar() no idioma escolhido
        const links = PAGINAS.map((p) =>
            `<a href="${p.href}" class="${p.id === paginaActual ? 'on' : ''}">${ICONES[p.id]}<span data-i18n="nav_${p.id}"></span></a>`).join('');

        document.getElementById('sidebar').innerHTML = `
            <div class="brand">
                <img src="/assets/images/logo.png" alt="Alpha Tech">
                <div class="brand-name">Alpha Tech<small>Leads Intelligence</small></div>
            </div>
            <nav class="nav">
                <div class="nav-label" data-i18n="nav_menu"></div>
                ${links}
            </nav>
            <div class="side-foot">
                <div class="user">
                    <div class="avatar" id="user-avatar">·</div>
                    <div class="user-info"><b id="user-nome" data-i18n="loading"></b><span id="user-papel"></span></div>
                </div>
                <button class="btn-sair" id="btn-sair" data-i18n="signout"></button>
            </div>`;

        document.getElementById('btn-sair').addEventListener('click', sair);
        I18N.aplicar();
    }

    // O idioma preferido está na conta. No início de cada sessão do browser aplica-se o da conta (uma vez); depois, cada mudança
    // feita pelo utilizador grava-se na conta. Se a coluna ainda não existir (database/settings.sql por correr), isto não faz nada.
    let idiomaConta = null;
    function sincronizarIdioma(u) {
        idiomaConta = u.idioma || null;
        let jaFeito = false;
        try { jaFeito = !!sessionStorage.getItem('ns_idioma_conta'); sessionStorage.setItem('ns_idioma_conta', '1'); } catch { /* sem armazenamento: aplica sempre */ }
        if (u.idioma && u.idioma !== I18N.idioma() && !jaFeito) I18N.definir(u.idioma);
        I18N.aoMudar(() => {
            if (I18N.idioma() === idiomaConta) return;
            idiomaConta = I18N.idioma();
            api('/api/definicoes/perfil', { method: 'PUT', body: JSON.stringify({ idioma: idiomaConta }) }).catch(() => { /* a conta pode não suportar ainda: o browser guarda na mesma */ });
        });
    }

    async function preencherUtilizador() {
        try {
            const u = await api('/api/auth/me');
            const nome = document.getElementById('user-nome');
            nome.removeAttribute('data-i18n');          // deixa de ser "A carregar…"
            nome.textContent = u.nome;
            document.getElementById('user-papel').dataset.i18n = 'role_' + u.papel;
            I18N.aplicar();
            document.getElementById('user-avatar').textContent = u.nome.charAt(0).toUpperCase();
            sincronizarIdioma(u);
            return u;
        } catch { return null; }
    }

    // ---------- arranque da página ----------
    function iniciar() {
        // Sem token: nem vale a pena mostrar a página
        if (!token()) { location.replace(PAGINA_LOGIN); return Promise.resolve(null); }

        desenharMenu(document.body.dataset.page);

        const burger = document.getElementById('burger');
        const menu = document.getElementById('sidebar');
        if (burger) burger.addEventListener('click', () => menu.classList.toggle('aberto'));
        // clicar fora do menu (no ecrã escurecido) fecha-o
        document.addEventListener('click', (e) => {
            if (menu.classList.contains('aberto') && !menu.contains(e.target) && !burger.contains(e.target)) {
                menu.classList.remove('aberto');
            }
        });

        return preencherUtilizador().then((u) => { if (u) iniciarAvisoRespostas(); return u; });
    }

    // ---------- aviso de respostas por responder ----------
    // Número no menu «Hoje» e no título do separador; quando chega uma nova, um aviso no canto. Pergunta de minuto a minuto (e ao voltar ao separador).
    let contagemRespostas = null, temporizadorRespostas = null;
    function mostrarRespostas(n) {
        const link = document.querySelector('.nav a[href="/assets/pages/dashboard.html"]');
        if (link) {
            let b = link.querySelector('.nav-badge');
            if (n > 0) {
                if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; link.appendChild(b); }
                b.textContent = n > 99 ? '99+' : String(n);
                b.title = I18N.t('resp_badge').replace('{n}', n);
            } else if (b) b.remove();
        }
        document.title = (n > 0 ? '(' + n + ') ' : '') + document.title.replace(/^\(\d+\+?\)\s/, '');
        if (contagemRespostas != null && n > contagemRespostas) avisoRespostaNova(n - contagemRespostas);
        contagemRespostas = n;
    }
    function avisoRespostaNova(novas) {
        document.querySelector('.resp-aviso')?.remove();
        const a = document.createElement('a');
        a.className = 'resp-aviso'; a.href = '/assets/pages/dashboard.html'; a.setAttribute('role', 'status');
        a.textContent = I18N.t(novas === 1 ? 'resp_new_one' : 'resp_new_many').replace('{n}', novas);
        document.body.appendChild(a);
        setTimeout(() => a.remove(), 9000);
    }
    async function atualizarRespostas() {
        try { mostrarRespostas((await api('/api/pipeline/hoje/respostas')).total || 0); } catch { /* sem rede ou sem permissão: o número fica como estava */ }
    }
    function iniciarAvisoRespostas() {
        if (temporizadorRespostas || !document.getElementById('sidebar')) return;
        atualizarRespostas();
        temporizadorRespostas = setInterval(() => { if (!document.hidden) atualizarRespostas(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizarRespostas(); });
        I18N.aoMudar(() => { if (contagemRespostas) { const n = contagemRespostas; contagemRespostas = null; mostrarRespostas(n); } });
    }

    // Descarrega um ficheiro (por exemplo, um CSV) com o token do utilizador. Devolve { linhas, nome }.
    async function descarregar(caminho, jaRenovou = false) {
        const r = await fetch(caminho, { headers: { Authorization: 'Bearer ' + token(), 'X-Idioma': I18N.idioma() } });
        if (r.status === 401) {
            if (!jaRenovou && await renovar()) return descarregar(caminho, true);
            sair();
            throw new Error(I18N.t('err_session'));
        }
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            const erro = new Error(d.erro || I18N.t('err_generic'));
            erro.status = r.status; erro.codigo = d.codigo;
            throw erro;
        }
        const blob = await r.blob();
        const nome = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || 'dados.csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { linhas: Number(r.headers.get('X-Linhas') || 0), nome };
    }

    return { api, esc, iniciar, guardar, token, estado, servico, descarregar, PAGINA_LOGIN };
})();

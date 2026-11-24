/* settings.js: página «Definições». Perfil (nome, idioma na conta, palavra-passe), equipa e papéis (admin), estado das integrações
   (só sim ou não, nunca segredos) e os limites em vigor. Os textos vêm de i18n.js. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const eAdmin = !!utilizador && utilizador.papel === 'admin';
    const veIntegracoes = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const IDIOMAS = ['pt', 'en', 'es'];
    const NOMES_IDIOMA = { pt: 'Português', en: 'English', es: 'Español' };

    let perfil = null, equipa = null, integracoes = null, limites = null, temporizador = null;
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    function aviso(texto, erro = false) {
        $('st-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('st-aviso').innerHTML = ''; }, 6000);
    }
    const erroDe = (e) => (e && e.codigo === 'CONFIG' ? t('st_err_sql') : e && ['INVALIDO', 'VAZIO'].includes(e.codigo) && e.message ? e.message : t('st_err'));
    const estado = (ok, rotuloOk = t('st_ok'), rotuloNao = t('st_missing')) => `<span class="chip ${ok ? 'chip-ok' : 'atrasada'}">${esc(ok ? rotuloOk : rotuloNao)}</span>`;

    // ---------- carregar ----------
    async function carregar() {
        const pedidos = [
            api('/api/definicoes/perfil').then((r) => { perfil = r; }),
            api('/api/definicoes/limites').then((r) => { limites = r; }),
            eAdmin ? api('/api/definicoes/equipa').then((r) => { equipa = r.equipa; }) : null,
            veIntegracoes ? api('/api/definicoes/integracoes').then((r) => { integracoes = r; }) : null
        ].filter(Boolean);
        await Promise.allSettled(pedidos);
        desenhar();
    }

    // ---------- blocos ----------
    function perfilHtml() {
        if (!perfil) return '';
        return `<section class="card"><div class="card-head"><h2>${esc(t('st_s_profile'))}</h2></div><div class="card-body g-form">
            <div class="g-linha"><label class="campo"><span>${esc(t('st_name'))}</span><input type="text" id="st-nome" maxlength="80" value="${esc(perfil.nome)}"></label>
                <label class="campo"><span>${esc(t('st_email'))}</span><input type="text" value="${esc(perfil.email)}" disabled></label></div>
            <div class="g-linha"><div class="campo"><span>${esc(t('st_role'))}</span><p class="st-papel">${esc(t('role_' + perfil.papel))}</p></div>
                <label class="campo"><span>${esc(t('st_lang'))}</span><select id="st-idioma">${IDIOMAS.map((l) => `<option value="${l}" ${l === I18N.idioma() ? 'selected' : ''}>${NOMES_IDIOMA[l]}</option>`).join('')}</select></label></div>
            <p class="nota">${esc(t('st_lang_hint'))}${perfil.idioma_disponivel ? '' : ' ' + esc(t('st_err_sql'))}</p>
            <div class="st-acoes"><button type="button" class="btn btn-secundario" id="st-guardar-nome">${esc(t('st_save_name'))}</button>
                <button type="button" class="btn-link" id="st-palavra-passe">${esc(t('st_pw'))}: ${esc(t('st_pw_btn'))}</button></div></div></section>`;
    }

    function equipaHtml() {
        if (!eAdmin || !equipa) return '';
        const linhas = equipa.map((u) => `<tr data-id="${esc(u.id)}" data-nome="${esc(u.nome)}"><td><b>${esc(u.nome)}</b>${u.id === utilizador.id ? ` <span class="nota">${esc(t('st_you'))}</span>` : ''}</td><td>${esc(u.email)}</td>
            <td><select data-papel ${u.id === utilizador.id ? 'disabled' : ''} aria-label="${esc(t('st_th_role'))}: ${esc(u.nome)}">${['admin', 'comercial', 'leitura'].map((p) => `<option value="${p}" ${p === u.papel ? 'selected' : ''}>${esc(t('role_' + p))}</option>`).join('')}</select></td></tr>`).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('st_s_team'))}</h2></div><div class="card-body"><p class="nota">${esc(t('st_team_hint'))}</p>
            <div class="tabela-rolar"><table class="tabela st-tabela"><thead><tr><th>${esc(t('st_th_name'))}</th><th>${esc(t('st_th_email'))}</th><th>${esc(t('st_th_role'))}</th></tr></thead><tbody>${linhas}</tbody></table></div>
            <p class="nota">${esc(t('st_team_note'))}</p></div></section>`;
    }

    function integracoesHtml() {
        if (!veIntegracoes || !integracoes) return '';
        const i = integracoes;
        const linha = (rotulo, corpo) => `<div class="st-int"><span>${esc(rotulo)}</span><div>${corpo}</div></div>`;
        const modelos = i.ia.modelos.map((m) => `<li><span>${esc(t('st_use_' + m.uso))}</span><code>${esc(m.modelo)}</code></li>`).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('st_s_integrations'))}</h2></div><div class="card-body"><p class="nota">${esc(t('st_int_hint'))}</p><div class="st-ints">
            ${linha(t('st_int_ai'), estado(i.ia.configurada))}
            ${linha(t('st_int_email'), `${estado(i.email.configurado)} <span class="nota">${esc(t('st_int_server'))}: ${esc(i.email.servidor)}:${i.email.porta}</span>`)}
            ${linha(t('st_int_wa'), estado(i.whatsapp.configurado))}
            ${linha(t('st_int_wa_webhook'), estado(i.whatsapp.webhook))}
            ${linha(t('st_int_wa_waba'), estado(i.whatsapp.waba))}
            ${linha(t('st_int_wa_version'), `<code>${esc(i.whatsapp.versao_api)}</code>`)}
            ${linha(t('st_int_url'), i.endereco.url ? `<code>${esc(i.endereco.url)}</code>` : `<span class="chip atrasada">${esc(t('st_int_url_none'))}</span>`)}</div>
            ${i.endereco.local ? `<div class="erro-ui">${esc(t('st_int_url_local'))}</div>` : ''}
            <h3 class="dt-h3">${esc(t('st_int_models'))}</h3><ul class="st-modelos">${modelos}</ul></div></section>`;
    }

    function limitesHtml() {
        if (!limites) return '';
        const l = limites;
        const linhas = l.diarios.map((c) => `<tr><td>${esc(c.canal === 'whatsapp_respostas' ? t('st_lim_wa_replies') : t('ch_' + c.canal))}</td><td class="num"><b>${c.valor}</b></td><td><code>${esc(c.variavel)}</code></td></tr>`).join('');
        const regra = (rot, v) => `<li><span>${esc(rot)}</span><b>${v}</b></li>`;
        return `<section class="card"><div class="card-head"><h2>${esc(t('st_s_limits'))}</h2></div><div class="card-body"><p class="nota">${esc(t('st_lim_hint'))}</p>
            <div class="tabela-rolar"><table class="tabela st-tabela"><thead><tr><th>${esc(t('st_lim_channel'))}</th><th class="num">${esc(t('st_lim_value'))}</th><th>${esc(t('st_lim_var'))}</th></tr></thead><tbody>${linhas}</tbody></table></div>
            <ul class="st-regras">${regra(t('st_rule_between'), l.regras.dias_entre_mensagens)}${regra(t('st_rule_follow'), l.regras.followups)}${regra(t('st_rule_rest'), l.regras.dias_descanso)}${regra(t('st_rule_drafts'), l.regras.rascunhos_por_hora)}
                ${regra(t('st_file_import'), l.ficheiros.importacao_linhas)}${regra(t('st_file_export'), l.ficheiros.exportacao_linhas)}${regra(t('st_file_board'), l.ficheiros.leads_quadro)}</ul></div></section>`;
    }

    function desenhar() {
        const antes = document.activeElement?.id === 'st-nome' ? { v: $('st-nome').value, p: $('st-nome').selectionStart } : null;
        $('st-corpo').innerHTML = `<div class="st-grelha">${perfilHtml()}${equipaHtml()}${integracoesHtml()}${limitesHtml()}</div>`;
        if (antes && $('st-nome')) { $('st-nome').value = antes.v; $('st-nome').focus(); $('st-nome').setSelectionRange(antes.p, antes.p); }
    }

    // ---------- eventos ----------
    $('st-corpo').addEventListener('click', async (ev) => {
        if (ev.target.closest('#st-guardar-nome')) {
            try { perfil = await api('/api/definicoes/perfil', { method: 'PUT', body: JSON.stringify({ nome: $('st-nome').value }) }); aviso(t('st_saved')); const nomeMenu = $('user-nome'); if (nomeMenu) nomeMenu.textContent = perfil.nome; desenhar(); }
            catch (e) { aviso(erroDe(e), true); }
        } else if (ev.target.closest('#st-palavra-passe')) {
            try { await api('/api/definicoes/perfil/palavra-passe', { method: 'POST' }); aviso(t('st_pw_sent')); }
            catch (e) { aviso(erroDe(e), true); }
        }
    });
    $('st-corpo').addEventListener('change', async (ev) => {
        const el = ev.target;
        if (el.id === 'st-idioma') { I18N.definir(el.value); return; }                      // aplica já e grava na conta (ver app.js)
        if (el.matches('[data-papel]')) {
            const tr = el.closest('tr');
            if (!window.confirm(sub(t('st_confirm_role'), { n: tr.dataset.nome, r: t('role_' + el.value) }))) { await recarregarEquipa(); return; }
            try { await api(`/api/definicoes/equipa/${encodeURIComponent(tr.dataset.id)}`, { method: 'PUT', body: JSON.stringify({ papel: el.value }) }); aviso(sub(t('st_role_changed'), { n: tr.dataset.nome, r: t('role_' + el.value) })); }
            catch (e) { aviso(erroDe(e), true); }
            await recarregarEquipa();
        }
    });
    async function recarregarEquipa() { try { equipa = (await api('/api/definicoes/equipa')).equipa; } catch { /* mantém */ } desenhar(); }

    I18N.aoMudar(desenhar);
    carregar();
})();

/* data.js: página «Dados». Importar (CSV, com pré-visualização), Exportar (CSV), Fontes e Não contactar.
   Os textos vêm de i18n.js; as mensagens que explicam linhas do ficheiro vêm do servidor (em português). */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const eAdmin = !!utilizador && utilizador.papel === 'admin';

    const SEPARADORES = ['imp', 'exp', 'fon', 'dnc'];
    const NOMES = { imp: 'dt_tab_import', exp: 'dt_tab_export', fon: 'dt_tab_sources', dnc: 'dt_tab_dnc' };
    const HASH = { importar: 'imp', exportar: 'exp', fontes: 'fon', 'nao-contactar': 'dnc' };
    let separador = HASH[location.hash.slice(1)] || 'imp';
    let imp = { ficheiro: null, texto: null, previa: null, ocupado: false, resultado: null };
    let exp = { sep: ';', conteudo: false, estado: '', ocupado: null };
    let fon = null, dncDados = null, dncBusca = [], dncTermo = '';
    let temporizador = null;

    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const dataCurta = (iso) => (iso ? new Date(iso).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
    const nomePais = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
    function aviso(texto, erro = false) {
        $('dt-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('dt-aviso').innerHTML = ''; }, 6000);
    }
    const msg = (e, padrao) => (e && e.message && ['INVALIDO', 'VAZIO', 'NAO_ENCONTRADA'].includes(e.codigo) ? e.message : padrao);

    // ---------- separadores ----------
    function desenharSeparadores() {
        $('dt-separadores').innerHTML = SEPARADORES.map((k) => `<button type="button" role="tab" data-sep="${k}" aria-selected="${k === separador}" class="${k === separador ? 'on' : ''}">${esc(t(NOMES[k]))}</button>`).join('');
    }
    async function mudarSeparador(k) {
        separador = k; aviso('');
        desenharSeparadores(); desenhar();
        if (k === 'fon' && !fon) await carregarFontes();
        if (k === 'dnc' && !dncDados) await carregarDnc();
    }
    $('dt-separadores').addEventListener('click', (ev) => { const b = ev.target.closest('[data-sep]'); if (b) mudarSeparador(b.dataset.sep); });

    // ======================= IMPORTAR =======================
    const MODELO_CSV = 'nome;site;país;idioma;setor;cidade;email;telefone;linkedin;instagram;whatsapp;contacto;cargo;email do contacto;linkedin do contacto;descrição\r\n'
        + 'Exemplo Lda;exemplo.pt;Portugal;pt;fintech;Lisboa;ola@exemplo.pt;+351 912 345 678;linkedin.com/company/exemplo;@exemplo;+351912345678;Ana Dias;CEO;ana@exemplo.pt;linkedin.com/in/anadias;Plataforma de pagamentos para PME\r\n';
    function descarregarModelo() {
        const blob = new Blob(['﻿' + MODELO_CSV], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'modelo-importacao.csv'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    // O Excel em português grava muitas vezes em Windows-1252: se não for UTF-8 válido, lê-se assim
    async function lerFicheiro(ficheiro) {
        const bytes = await ficheiro.arrayBuffer();
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
    }
    async function escolherFicheiro(ficheiro) {
        if (!ficheiro) return;
        imp = { ficheiro: ficheiro.name, texto: null, previa: null, ocupado: true, resultado: null };
        desenhar();
        try {
            if (ficheiro.size > 1.8 * 1024 * 1024) throw Object.assign(new Error(t('dt_err_big')), { codigo: 'INVALIDO' });
            imp.texto = await lerFicheiro(ficheiro);
            imp.previa = await api('/api/dados/importar/previsao', { method: 'POST', body: JSON.stringify({ csv: imp.texto }) });
        } catch (e) { imp.texto = null; imp.previa = null; aviso(msg(e, t('dt_err_import')), true); }
        imp.ocupado = false;
        desenhar();
    }
    async function confirmarImportacao() {
        const n = imp.previa.resumo.nova;
        if (!window.confirm(sub(t('dt_imp_confirm'), { n, f: imp.ficheiro }))) return;
        imp.ocupado = true; desenhar();
        try {
            imp.resultado = await api('/api/dados/importar', { method: 'POST', body: JSON.stringify({ csv: imp.texto, ficheiro: imp.ficheiro }) });
            imp.previa = null; imp.texto = null;
            const r = imp.resultado;
            aviso(sub(t('dt_imp_done'), { n: r.importadas, c: r.contactos, s: r.fonte || '–' }) + (r.erros + r.recusadas_pela_base ? ' ' + sub(t('dt_imp_fail'), { n: r.erros + r.recusadas_pela_base }) : ''));
            fon = null; dncDados = null;
        } catch (e) { aviso(msg(e, t('dt_err_import')), true); }
        imp.ocupado = false;
        desenhar();
    }

    function importarHtml() {
        const p = imp.previa;
        const cabeca = `<section class="card"><div class="card-head"><h2>${esc(t('dt_tab_import'))}</h2></div><div class="card-body">
            <p class="nota">${esc(t('dt_imp_intro'))}</p>
            <div class="dt-acoes"><button type="button" class="btn-link" id="dt-modelo">${esc(t('dt_imp_template'))}</button>
                ${podeEditar ? `<label class="btn btn-secundario dt-ficheiro">${esc(t('dt_imp_choose'))}<input type="file" id="dt-ficheiro" accept=".csv,.txt,text/csv" hidden></label>` : ''}
                ${imp.ficheiro ? `<span class="nota">${esc(imp.ficheiro)}</span>` : ''}</div>
            ${imp.ocupado ? `<p class="nota">${esc(t('dt_imp_reading'))}</p>` : ''}</div></section>`;
        if (imp.resultado && !p) {
            return cabeca + `<section class="card"><div class="card-body"><p>${esc(sub(t('dt_imp_done'), { n: imp.resultado.importadas, c: imp.resultado.contactos, s: imp.resultado.fonte || '–' }))}</p>
                <a class="btn btn-secundario" href="/assets/pages/leads.html">${esc(t('dt_imp_see'))}</a></div></section>`;
        }
        if (!p) return cabeca;
        const R = p.resumo;
        const caixas = [['nova', R.nova], ['existente', R.existente], ['repetida', R.repetida], ['nao_contactar', R.nao_contactar], ['invalida', R.invalida]]
            .map(([k, n]) => `<div class="dt-num ${k}"><b>${n}</b><span>${esc(t('dt_s_' + k))}</span></div>`).join('') + `<div class="dt-num"><b>${R.com_avisos}</b><span>${esc(t('dt_s_avisos'))}</span></div>`;
        const colunas = p.colunas.map((c) => `<li><b>${esc(t('dt_field_' + c.campo))}</b> ← ${esc(c.coluna)}</li>`).join('');
        const linhas = p.linhas.map((l) => `<tr><td>${l.linha}</td><td><span class="chip dt-chip-${l.estado}">${esc(t('dt_s_' + l.estado))}</span></td>
            <td><b>${esc(l.nome || '–')}</b></td><td>${esc(l.site || '')}</td><td>${esc(l.pais ? nomePais(l.pais) : '')}</td><td>${esc(l.contacto || '')}</td>
            <td class="dt-notas">${[...l.motivos, ...l.avisos].map((x) => `<span>${esc(x)}</span>`).join('')}</td></tr>`).join('');
        return cabeca + `<section class="card"><div class="card-head"><h2>${esc(imp.ficheiro)}</h2></div><div class="card-body">
            <div class="dt-nums">${caixas}</div>
            ${p.truncado ? `<div class="erro-ui">${esc(t('dt_imp_truncated'))}</div>` : ''}
            <h3 class="dt-h3">${esc(t('dt_imp_cols'))}</h3><ul class="dt-cols">${colunas}</ul>
            ${p.ignoradas.length ? `<p class="nota">${esc(sub(t('dt_imp_ignored'), { c: p.ignoradas.join(', ') }))}</p>` : ''}
            <div class="tabela-rolar"><table class="tabela dt-tabela"><thead><tr><th>${esc(t('dt_th_line'))}</th><th>${esc(t('dt_th_status'))}</th><th>${esc(t('dt_th_company'))}</th><th>${esc(t('dt_th_site'))}</th><th>${esc(t('dt_th_country'))}</th><th>${esc(t('dt_th_contact'))}</th><th>${esc(t('dt_th_notes'))}</th></tr></thead><tbody>${linhas}</tbody></table></div>
            ${p.total > p.linhas.length ? `<p class="nota">${esc(sub(t('dt_prev_note'), { n: p.linhas.length, t: p.total }))}</p>` : ''}
            ${podeEditar ? (R.nova ? `<button type="button" class="btn" id="dt-importar" ${imp.ocupado ? 'disabled' : ''}>${esc(sub(t('dt_imp_go'), { n: R.nova }))}</button>` : `<p class="nota">${esc(t('dt_imp_none'))}</p>`) : ''}</div></section>`;
    }

    // ======================= EXPORTAR =======================
    const ESTADOS_LEAD = ['novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'proposta_enviada', 'proposta_aceite', 'negocio_fechado', 'proposta_recusada', 'oportunidade_perdida', 'nao_contactar'];
    async function exportar(tipo) {
        exp.ocupado = tipo; desenhar();
        try {
            const qs = new URLSearchParams({ sep: exp.sep === ',' ? ',' : exp.sep === '\t' ? 'tab' : ';' });
            if (tipo === 'interaccoes' && exp.conteudo) qs.set('conteudo', '1');
            if (tipo === 'leads' && exp.estado) qs.set('estado', exp.estado);
            const r = await NS.descarregar(`/api/dados/exportar/${tipo}?${qs}`);
            aviso(sub(t('dt_exp_done'), { n: r.linhas }));
        } catch (e) { aviso(msg(e, t('dt_err_export')), true); }
        exp.ocupado = null; desenhar();
    }
    function exportarHtml() {
        const cartao = (tipo, extra = '') => `<div class="dt-exp"><div><h3>${esc(t('dt_exp_' + tipo))}</h3><p class="nota">${esc(t('dt_exp_' + tipo + '_d'))}</p>${extra}</div>
            <button type="button" class="btn btn-secundario" data-exportar="${tipo}" ${exp.ocupado ? 'disabled' : ''}>${esc(exp.ocupado === tipo ? '…' : t('dt_exp_btn'))}</button></div>`;
        const filtroEstado = `<label class="campo"><span>${esc(t('lf_stage'))}</span><select id="dt-estado"><option value="">${esc(t('f_all'))}</option>${ESTADOS_LEAD.map((e) => `<option value="${e}" ${exp.estado === e ? 'selected' : ''}>${esc(NS.estado(e))}</option>`).join('')}</select></label>`;
        const incluirTexto = `<label class="check"><input type="checkbox" id="dt-conteudo" ${exp.conteudo ? 'checked' : ''}><span>${esc(t('dt_exp_include_text'))}</span></label>`;
        return `<section class="card"><div class="card-head"><h2>${esc(t('dt_tab_export'))}</h2></div><div class="card-body">
            <p class="nota">${esc(t('dt_exp_intro'))}</p>
            <label class="campo dt-sep"><span>${esc(t('dt_exp_sep'))}</span><select id="dt-sep">${[[';', 'dt_sep_semicolon'], [',', 'dt_sep_comma'], ['\t', 'dt_sep_tab']].map(([v, k]) => `<option value="${v === '\t' ? 'tab' : v}" ${exp.sep === v ? 'selected' : ''}>${esc(t(k))}</option>`).join('')}</select></label>
            <div class="dt-exps">${cartao('leads', filtroEstado)}${cartao('empresas')}${cartao('decisores')}${cartao('interaccoes', incluirTexto)}${cartao('nao_contactar')}</div></div></section>`;
    }

    // ======================= FONTES =======================
    async function carregarFontes() {
        try { fon = (await api('/api/dados/fontes')).fontes; } catch { fon = []; aviso(t('dt_err_source'), true); }
        desenhar();
    }
    function fontesHtml() {
        if (!fon) return `<p class="nota">${esc(t('loading'))}</p>`;
        const linhas = fon.map((f) => `<tr data-id="${esc(f.id)}"><td><b>${esc(f.nome)}</b>${f.url ? `<span class="lead-sub">${esc(f.url.replace(/^https?:\/\//, ''))}</span>` : ''}</td>
            <td>${esc(t('dt_type_' + f.tipo))}</td><td>${f.empresas}</td><td>${esc(f.ultima_atividade ? dataCurta(f.ultima_atividade) : t('dt_src_never'))}</td>
            <td>${f.pode_desligar ? (f.disponivel ? `<label class="dt-comutador"><input type="checkbox" data-fonte ${f.activa ? 'checked' : ''} ${eAdmin ? '' : 'disabled'}><span>${esc(f.activa ? t('dt_src_on') : t('dt_src_off'))}</span></label>` : `<span class="nota">${esc(t('dt_src_unavailable'))}</span>`) : '–'}</td></tr>`).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('dt_tab_sources'))}</h2></div><div class="card-body"><p class="nota">${esc(t('dt_src_intro'))}${eAdmin ? '' : ' ' + esc(t('dt_src_admin'))}</p>
            ${fon.length ? `<div class="tabela-rolar"><table class="tabela dt-tabela"><thead><tr><th>${esc(t('dt_th_source'))}</th><th>${esc(t('dt_th_type'))}</th><th>${esc(t('dt_th_companies'))}</th><th>${esc(t('dt_th_activity'))}</th><th>${esc(t('dt_th_active'))}</th></tr></thead><tbody>${linhas}</tbody></table></div>` : `<p class="nota">${esc(t('dt_src_none'))}</p>`}</div></section>`;
    }

    // ======================= NÃO CONTACTAR =======================
    async function carregarDnc() {
        try { dncDados = await api('/api/dados/nao-contactar'); } catch { dncDados = { itens: [] }; aviso(t('dt_err_dnc'), true); }
        desenhar();
    }
    const ORIGENS = ['whatsapp', 'nao_contactar', 'pipeline', 'manual', 'importacao'];
    function dncHtml() {
        if (!dncDados) return `<p class="nota">${esc(t('loading'))}</p>`;
        const linhas = dncDados.itens.map((i) => `<tr data-tipo="${i.tipo}" data-id="${esc(i.id)}" data-nome="${esc(i.nome || '')}"><td>${esc(t(i.tipo === 'empresa' ? 'dt_dnc_company' : 'dt_dnc_person'))}</td>
            <td><b>${esc(i.nome || '–')}</b>${i.cargo ? `<span class="lead-sub">${esc(i.cargo)}</span>` : ''}</td><td>${esc(i.tipo === 'pessoa' ? (i.empresa || '–') : '')}${i.pais ? `<span class="lead-sub">${esc(nomePais(i.pais))}</span>` : ''}</td>
            <td>${esc(dataCurta(i.desde))}</td><td>${esc(t(ORIGENS.includes(i.origem) ? 'dt_origin_' + i.origem : 'dt_origin_unknown'))}</td>
            <td>${eAdmin ? `<button type="button" class="btn-link pp-apagar" data-remover>${esc(t('dt_dnc_remove'))}</button>` : ''}</td></tr>`).join('');
        const resultados = dncBusca.length ? `<ul class="dt-busca">${dncBusca.map((e) => `<li data-empresa="${esc(e.id)}" data-nome="${esc(e.nome)}"><span><b>${esc(e.nome)}</b>${e.pais ? ` · ${esc(nomePais(e.pais))}` : ''}</span><button type="button" class="btn btn-secundario" data-bloquear>${esc(t('dt_dnc_add'))}</button></li>`).join('')}</ul>`
            : (dncTermo.length >= 2 ? `<p class="nota">${esc(t('dt_dnc_none_found'))}</p>` : '');
        return `<section class="card"><div class="card-head"><h2>${esc(t('dt_tab_dnc'))} <span class="nota">· ${dncDados.itens.length}</span></h2></div><div class="card-body">
            <p class="nota">${esc(t('dt_dnc_intro'))}${eAdmin ? '' : ' ' + esc(t('dt_dnc_admin'))}</p>
            ${podeEditar ? `<label class="campo dt-pesquisa"><span>${esc(t('dt_dnc_add'))}</span><input type="search" id="dt-procurar" maxlength="80" autocomplete="off" placeholder="${esc(t('dt_dnc_search_ph'))}" value="${esc(dncTermo)}"></label>${resultados}` : ''}
            ${dncDados.itens.length ? `<div class="tabela-rolar"><table class="tabela dt-tabela"><thead><tr><th>${esc(t('dt_th_type'))}</th><th>${esc(t('dt_th_name'))}</th><th>${esc(t('dt_th_company'))}</th><th>${esc(t('dt_th_since'))}</th><th>${esc(t('dt_th_origin'))}</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
                : `<p class="nota">${esc(t('dt_dnc_empty'))}</p>`}</div></section>`;
    }

    // ---------- desenhar e eventos ----------
    function desenhar() {
        const guardarPesquisa = document.activeElement?.id === 'dt-procurar' ? document.activeElement.selectionStart : null;
        $('dt-corpo').innerHTML = separador === 'imp' ? importarHtml() : separador === 'exp' ? exportarHtml() : separador === 'fon' ? fontesHtml() : dncHtml();
        if (guardarPesquisa !== null && $('dt-procurar')) { $('dt-procurar').focus(); $('dt-procurar').setSelectionRange(guardarPesquisa, guardarPesquisa); }
    }

    $('dt-corpo').addEventListener('click', async (ev) => {
        const alvo = ev.target;
        if (alvo.closest('#dt-modelo')) { descarregarModelo(); return; }
        if (alvo.closest('#dt-importar')) { await confirmarImportacao(); return; }
        const ex = alvo.closest('[data-exportar]');
        if (ex) { await exportar(ex.dataset.exportar); return; }
        const bl = alvo.closest('[data-bloquear]');
        if (bl) {
            const li = bl.closest('[data-empresa]');
            if (!window.confirm(sub(t('dt_dnc_confirm_add'), { n: li.dataset.nome }))) return;
            try { await api(`/api/dados/nao-contactar/empresas/${encodeURIComponent(li.dataset.empresa)}`, { method: 'POST' }); aviso(sub(t('dt_dnc_added'), { n: li.dataset.nome })); dncBusca = []; dncTermo = ''; await carregarDnc(); }
            catch (e) { aviso(msg(e, t('dt_err_dnc')), true); }
            return;
        }
        const rm = alvo.closest('[data-remover]');
        if (rm) {
            const tr = rm.closest('tr');
            if (!window.confirm(sub(t('dt_dnc_confirm_remove'), { n: tr.dataset.nome }))) return;
            try {
                await api(`/api/dados/nao-contactar/${tr.dataset.tipo === 'empresa' ? 'empresas' : 'pessoas'}/${encodeURIComponent(tr.dataset.id)}`, { method: 'DELETE' });
                aviso(sub(t('dt_dnc_removed'), { n: tr.dataset.nome })); await carregarDnc();
            } catch (e) { aviso(msg(e, t('dt_err_dnc')), true); }
        }
    });

    $('dt-corpo').addEventListener('change', async (ev) => {
        const el = ev.target;
        if (el.id === 'dt-ficheiro') { await escolherFicheiro(el.files[0]); return; }
        if (el.id === 'dt-sep') { exp.sep = el.value === 'tab' ? '\t' : el.value; return; }
        if (el.id === 'dt-conteudo') { exp.conteudo = el.checked; return; }
        if (el.id === 'dt-estado') { exp.estado = el.value; return; }
        if (el.matches('[data-fonte]')) {
            const id = el.closest('tr').dataset.id;
            try { await api(`/api/dados/fontes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ activa: el.checked }) }); aviso(t('dt_src_changed')); await carregarFontes(); }
            catch (e) { aviso(msg(e, t('dt_err_source')), true); await carregarFontes(); }
        }
    });

    let esperar = null;
    $('dt-corpo').addEventListener('input', (ev) => {
        if (ev.target.id !== 'dt-procurar') return;
        dncTermo = ev.target.value.trim();
        clearTimeout(esperar);
        esperar = setTimeout(async () => {
            try { dncBusca = dncTermo.length >= 2 ? (await api(`/api/dados/nao-contactar/procurar?q=${encodeURIComponent(dncTermo)}`)).empresas : []; } catch { dncBusca = []; }
            if (separador === 'dnc') desenhar();
        }, 300);
    });

    I18N.aoMudar(() => { desenharSeparadores(); desenhar(); });
    desenharSeparadores();
    desenhar();
    if (separador === 'fon') carregarFontes();
    if (separador === 'dnc') carregarDnc();
})();

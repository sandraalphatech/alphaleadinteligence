/* deals.js: página «Negócios». As oportunidades de venda num quadro de etapas (arrastar e largar) ou numa lista, com valores e totais
   por etapa, pesquisa, filtros, ordenação e uma janela para criar e editar. Os totais calculam-se aqui a partir dos negócios abertos
   que o servidor devolve (o servidor valida cada alteração). Os textos vêm de i18n.js. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const ETAPAS = ['qualificado', 'contactado', 'reuniao', 'proposta', 'negociacao'];
    const MOEDAS = ['EUR', 'USD', 'GBP', 'BRL'];
    const ESTADOS = ['aberto', 'ganho', 'perdido', 'todos'];
    const ORDENS = ['atividade', 'valor', 'previsao', 'recente', 'nome'];

    // ---------- utilitários ----------
    const lembrar = (k, v) => { try { localStorage.setItem('ns_negocios_' + k, v); } catch { /* sem armazenamento: não faz mal */ } };
    const lido = (k, padrao) => { try { return localStorage.getItem('ns_negocios_' + k) || padrao; } catch { return padrao; } };
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const dois = (n) => String(n).padStart(2, '0');
    const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };
    const diasAte = (iso) => Math.round((Date.parse(`${iso}T12:00:00`) - Date.parse(`${hojeLocal()}T12:00:00`)) / 86400000);
    const dataCurta = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const dinheiro = (v, moeda) => new Intl.NumberFormat(I18N.locale(), { style: 'currency', currency: moeda || 'EUR', maximumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2 }).format(Number(v) || 0);
    const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
    const nomeEtapa = (e) => t('dl_etapa_' + e);
    const somaTexto = (valores) => { const k = Object.keys(valores); return k.length ? k.map((m) => dinheiro(valores[m], m)).join(' + ') : dinheiro(0, 'EUR'); };
    const erroDe = (e) => (e && e.codigo === 'CONFIG' ? t('dl_err_sql') : e && ['INVALIDO', 'VAZIO', 'BLOQUEADO', 'NAO_ENCONTRADA'].includes(e.codigo) && e.message ? e.message : t('dl_err'));

    // ---------- estado da página ----------
    let vista = lido('vista', 'quadro') === 'lista' ? 'lista' : 'quadro';
    const filtros = { q: '', responsavel: '', estado: ESTADOS.includes(lido('estado', 'aberto')) ? lido('estado', 'aberto') : 'aberto' };
    let ordem = ORDENS.includes(lido('ordem', 'atividade')) ? lido('ordem', 'atividade') : 'atividade';
    let dados = { negocios: [], equipa: [], limite: 1000 };
    let carregado = false, falhou = false, erroSql = false, pedido = 0, temporizador = null;

    function aviso(texto, erro = false) {
        $('ng-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('ng-aviso').innerHTML = ''; }, 5000);
    }

    // ---------- carregar ----------
    async function carregar() {
        const n = ++pedido;
        const qs = new URLSearchParams();
        qs.set('estado', filtros.estado);
        if (filtros.responsavel) qs.set('responsavel', filtros.responsavel);
        if (filtros.q) qs.set('q', filtros.q);
        try { const r = await api('/api/negocios?' + qs); if (n !== pedido) return; dados = r; falhou = false; erroSql = false; }
        catch (e) { if (n !== pedido) return; falhou = true; erroSql = e && e.codigo === 'CONFIG'; }
        carregado = true;
        atualizarBarra(); desenhar();
    }

    // ---------- barra (construída uma vez, para a pesquisa não perder o foco) ----------
    function montarBarra() {
        const opts = (lista, atual, rot) => lista.map((v) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(rot(v))}</option>`).join('');
        $('ng-barra').innerHTML = `<div class="ng-linha">
            <div class="vista" role="group" aria-label="${esc(t('nav_negocios'))}">${['quadro', 'lista'].map((v) => `<button type="button" data-vista="${v}" aria-pressed="${v === vista}" class="${v === vista ? 'on' : ''}">${esc(t('dl_view_' + (v === 'quadro' ? 'board' : 'list')))}</button>`).join('')}</div>
            ${podeEditar ? `<button type="button" class="btn ng-novo" id="ng-novo">${esc(t('dl_new'))}</button>` : ''}
            <span class="ng-total" id="ng-total"></span><span class="ng-fechados" id="ng-fechados"></span>
            <label class="campo ng-pesquisa"><span class="rp-so-leitor">${esc(t('dl_search_ph'))}</span><input type="search" id="ng-q" maxlength="80" autocomplete="off" placeholder="${esc(t('dl_search_ph'))}" value="${esc(filtros.q)}"></label>
            <label class="campo"><span>${esc(t('lf_owner'))}</span><select id="ng-resp"><option value="">${esc(t('f_all'))}</option>${dados.equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === filtros.responsavel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label>
            <label class="campo"><span>${esc(t('dl_status'))}</span><select id="ng-estado">${opts(ESTADOS, filtros.estado, (v) => t('dl_st_' + v))}</select></label>
            <label class="campo"><span>${esc(t('dl_sort'))}</span><select id="ng-ordem">${opts(ORDENS, ordem, (v) => t('dl_sort_' + v))}</select></label></div>
            ${podeEditar ? '' : `<p class="nota">${esc(t('dl_view_only'))}</p>`}`;
        atualizarBarra();
    }
    function atualizarBarra() {
        const abertos = dados.negocios.filter((n) => n.estado === 'aberto');
        const total = {}; abertos.forEach((n) => { total[n.moeda] = Math.round(((total[n.moeda] || 0) + n.valor) * 100) / 100; });
        if ($('ng-total')) $('ng-total').textContent = somaTexto(total);
        if ($('ng-total')) $('ng-total').title = `${t('dl_total_open')}: ${abertos.length}`;
        // atalhos para os negócios fechados (o quadro mostra os abertos por defeito)
        const f = dados.fechados;
        if ($('ng-fechados') && f) {
            const chip = (est, rot) => `<button type="button" class="chip ng-fechado ${filtros.estado === est ? 'on' : ''} ${est === 'ganho' ? 'chip-ok' : ''}" data-filtro-estado="${est}" aria-pressed="${filtros.estado === est}">${esc(t(rot))} ${f[est].n}${est === 'ganho' && f.ganho.n ? ' · ' + esc(somaTexto(f.ganho.valores)) : ''}</button>`;
            $('ng-fechados').innerHTML = chip('ganho', 'dl_st_ganho') + chip('perdido', 'dl_st_perdido');
        }
        const sel = $('ng-resp');
        if (sel && sel.options.length - 1 !== dados.equipa.length) sel.innerHTML = `<option value="">${esc(t('f_all'))}</option>${dados.equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === filtros.responsavel ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}`;
    }

    // ---------- ordenar ----------
    function ordenar(lista) {
        const nulosFim = (a, b, f, dir = 1) => { const x = f(a), y = f(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return dir * (x < y ? -1 : x > y ? 1 : 0); };
        const cmp = {
            atividade: (a, b) => nulosFim(a, b, (n) => n.proxima_atividade?.prazo),
            valor: (a, b) => b.valor - a.valor,
            previsao: (a, b) => nulosFim(a, b, (n) => n.data_prevista),
            recente: (a, b) => String(b.criado_em).localeCompare(String(a.criado_em)),
            nome: (a, b) => String(a.empresa?.nome || a.titulo).localeCompare(String(b.empresa?.nome || b.titulo), I18N.locale(), { sensitivity: 'base' })
        }[ordem];
        return lista.map((n, i) => [n, i]).sort((x, y) => cmp(x[0], y[0]) || x[1] - y[1]).map(([n]) => n);
    }

    // ---------- quadro ----------
    function cartao(n) {
        const prev = n.data_prevista ? (() => { const d = diasAte(n.data_prevista); return `<span class="chip ${d < 0 && n.estado === 'aberto' ? 'atrasada' : d <= 7 && n.estado === 'aberto' ? 'hoje' : ''}">${esc(sub(t('dl_expected'), { d: dataCurta(n.data_prevista) }))}</span>`; })() : '';
        const fechado = n.estado !== 'aberto' ? `<span class="chip ${n.estado === 'ganho' ? 'chip-ok' : 'atrasada'}">${esc(t(n.estado === 'ganho' ? 'dl_won' : 'dl_lost'))}</span>` : '';
        const atividade = n.estado === 'aberto' ? (n.proxima_atividade ? `<span class="lead-ultimo" title="${esc(n.proxima_atividade.titulo)}">${esc(n.proxima_atividade.titulo)} · ${esc(dataCurta(n.proxima_atividade.prazo))}</span>` : `<span class="lead-ultimo">${esc(t('dl_no_activity'))}</span>`) : '';
        return `<article class="lead-card ng-card" tabindex="0" role="button" ${podeEditar && n.estado === 'aberto' ? 'draggable="true"' : ''} data-negocio="${esc(n.id)}" aria-label="${esc(n.titulo)}">
            <div class="lead-top"><b>${esc(n.titulo)}</b>${n.responsavel ? `<span class="avatar-mini" title="${esc(n.responsavel.nome || '')}">${esc(iniciais(n.responsavel.nome))}</span>` : ''}</div>
            <span class="lead-sub">${esc(n.empresa?.nome || '')}</span>
            <div class="lead-meta"><span class="chip ng-valor">${esc(dinheiro(n.valor, n.moeda))}</span>${prev}${fechado}${n.proposta ? `<span class="chip ng-prop">${esc(n.proposta.numero)}</span>` : ''}</div>${atividade}</article>`;
    }

    function quadroHtml(negocios) {
        const abertos = negocios.filter((n) => n.estado === 'aberto');
        return `<div class="quadro ng-quadro">${ETAPAS.map((e) => {
            const itens = ordenar(negocios.filter((n) => n.etapa === e));
            const total = {}; abertos.filter((n) => n.etapa === e).forEach((n) => { total[n.moeda] = Math.round(((total[n.moeda] || 0) + n.valor) * 100) / 100; });
            return `<section class="coluna ng-coluna" data-etapa="${e}" aria-label="${esc(nomeEtapa(e))}">
                <header><div><b>${esc(nomeEtapa(e))}</b><small>${esc(somaTexto(total))}</small></div><span>${itens.length}</span></header>
                ${podeEditar ? `<button type="button" class="ng-mais" data-nova-etapa="${e}" aria-label="${esc(sub(t('dl_add_in'), { e: nomeEtapa(e) }))}" title="${esc(sub(t('dl_add_in'), { e: nomeEtapa(e) }))}">+</button>` : ''}
                <div class="coluna-corpo">${itens.length ? itens.map(cartao).join('') : `<p class="coluna-vazia">${esc(t('dl_col_empty'))}</p>`}</div></section>`;
        }).join('')}</div>`;
    }

    function listaHtml(negocios) {
        const linhas = ordenar(negocios).map((n) => `<tr tabindex="0" data-negocio="${esc(n.id)}"><td><b>${esc(n.titulo)}</b>${n.proposta ? `<span class="lead-sub">${esc(n.proposta.numero)}</span>` : ''}</td><td>${esc(n.empresa?.nome || '–')}</td><td>${esc(nomeEtapa(n.etapa))}</td>
            <td class="num"><b>${esc(dinheiro(n.valor, n.moeda))}</b></td><td>${n.estado === 'aberto' ? esc(t('dl_st_aberto').replace(/s$/, '')) : `<span class="chip ${n.estado === 'ganho' ? 'chip-ok' : 'atrasada'}">${esc(t(n.estado === 'ganho' ? 'dl_won' : 'dl_lost'))}</span>`}</td>
            <td>${esc(n.data_prevista ? dataCurta(n.data_prevista) : '–')}</td><td>${esc(n.responsavel?.nome || '–')}</td><td>${esc(n.proxima_atividade ? `${n.proxima_atividade.titulo} · ${dataCurta(n.proxima_atividade.prazo)}` : '–')}</td></tr>`).join('');
        return `<div class="tabela-rolar"><table class="tabela ng-tabela"><thead><tr>${['deal', 'company', 'stage', 'value', 'status', 'expected', 'owner', 'activity'].map((k) => `<th scope="col"${k === 'value' ? ' class="num"' : ''}>${esc(t('dl_th_' + k))}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    function desenhar() {
        const corpo = $('ng-corpo');
        if (!carregado) return;
        if (falhou) { corpo.innerHTML = `<div class="erro-ui" role="alert">${esc(erroSql ? t('dl_err_sql') : t('dl_err_load'))}</div>`; return; }
        const n = dados.negocios;
        const nota = n.length >= dados.limite ? `<p class="nota">${esc(sub(t('dl_truncated'), { n: dados.limite }))}</p>` : '';
        const haFechados = !!dados.fechados && (dados.fechados.ganho.n + dados.fechados.perdido.n) > 0;
        const vazio = !n.length && !filtros.q && !filtros.responsavel && filtros.estado === 'aberto' && vista === 'quadro'
            ? `<div class="ng-vazio"><b>${esc(t(haFechados ? 'dl_none_open' : 'dl_empty_t'))}</b><span>${esc(t(haFechados ? 'dl_none_open_s' : 'dl_empty_s'))}</span><div class="ng-vazio-acoes">${podeEditar ? `<button type="button" class="btn" id="ng-novo-vazio">${esc(t('dl_new'))}</button>` : ''}<a class="btn btn-secundario" href="/assets/pages/leads.html">${esc(t('dl_see_leads'))}</a></div></div>` : '';
        corpo.innerHTML = nota + (vista === 'lista' ? (n.length ? listaHtml(n) : `<div class="vazio"><b>${esc(t('dl_empty_t'))}</b></div>`) : quadroHtml(n) + vazio);
    }

    // ---------- mover de etapa (arrastar) ----------
    async function mover(id, etapa) {
        const n = dados.negocios.find((x) => x.id === id);
        if (!n || n.etapa === etapa || n.estado !== 'aberto') return;
        const anterior = n.etapa;
        n.etapa = etapa; atualizarBarra(); desenhar();                     // o cartão muda logo; se o servidor recusar, volta atrás
        try { await api(`/api/negocios/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ etapa }) }); aviso(sub(t('dl_moved'), { e: nomeEtapa(etapa) })); }
        catch (e) { n.etapa = anterior; desenhar(); aviso(erroDe(e), true); }
    }

    // ======================= JANELA (criar e editar) =======================
    const modal = $('ng-modal'), fundo = $('ng-fundo');
    let aEditar = null, empresaEscolhida = null, resultados = [], focoAnterior = null, escrever = null;
    const campo = (rot, corpo, cls = '') => `<label class="campo ${cls}"><span>${esc(rot)}</span>${corpo}</label>`;

    function abrirModal({ id = null, etapa = 'qualificado' } = {}) {
        focoAnterior = document.activeElement;
        aEditar = id ? dados.negocios.find((x) => x.id === id) : null;
        empresaEscolhida = null; resultados = [];
        if (id && !aEditar) return;
        modal.innerHTML = formularioHtml(etapa);
        modal.hidden = false; fundo.hidden = false; document.body.classList.add('modal-aberto');
        document.addEventListener('keydown', teclaModal, true);
        (modal.querySelector('#ng-f-empresa') || modal.querySelector('#ng-f-titulo'))?.focus();
        if (aEditar?.lead_id) carregarPropostas(aEditar.lead_id);
    }

    // As propostas do lead, cada uma com o valor sugerido para o negócio (usar o valor preenche o formulário; só grava quando se guarda).
    async function carregarPropostas(leadId) {
        let propostas = [];
        try { propostas = (await api(`/api/negocios/propostas?lead=${encodeURIComponent(leadId)}`)).propostas; } catch { propostas = []; }
        const caixa = $('ng-props'); if (!caixa) return;
        if (!propostas.length) { caixa.innerHTML = ''; return; }
        caixa.innerHTML = `<div class="ng-props"><h3>${esc(t('dl_props'))}</h3><ul>${propostas.map((p) => `<li><div><b>${esc(p.numero)}</b> · ${esc(p.titulo)} <span class="chip ${p.estado === 'enviada' ? 'chip-ok' : ''}">${esc(t('pp_st_' + p.estado))}</span>
            <span class="nota">${esc(sub(t('dl_prop_months'), { m: p.meses }))}</span></div>
            <div class="ng-props-acoes">${podeEditar ? `<button type="button" class="btn btn-secundario" data-usar-valor data-valor="${esc(p.valor)}" data-moeda="${esc(p.moeda)}">${esc(sub(t('dl_use_value'), { v: dinheiro(p.valor, p.moeda) }))}</button>` : ''}
                <a class="btn-link" href="/assets/pages/documents.html#proposta=${esc(p.id)}">${esc(t('dl_open_proposal'))}</a></div></li>`).join('')}</ul><p class="nota">${esc(t('dl_value_hint'))}</p></div>`;
    }
    function fecharModal() {
        modal.hidden = true; fundo.hidden = true; modal.innerHTML = ''; document.body.classList.remove('modal-aberto');
        document.removeEventListener('keydown', teclaModal, true);
        if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
        aEditar = null;
    }
    const teclaModal = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fecharModal(); } };

    function formularioHtml(etapaInicial) {
        const n = aEditar, ro = !podeEditar, fechado = n && n.estado !== 'aberto';
        const resp = (n ? n.responsavel_id : utilizador?.id) || '';
        const empresa = n
            ? `<p class="ng-empresa"><b>${esc(n.empresa?.nome || '')}</b>${n.lead_id ? ` · <a href="/assets/pages/leads.html#lead=${esc(n.lead_id)}">${esc(t('dl_open_lead'))}</a>` : ''}</p>`
            : campo(t('dl_f_company'), `<input type="search" id="ng-f-empresa" maxlength="80" autocomplete="off" placeholder="${esc(t('dl_f_company_ph'))}"><div id="ng-f-res"></div>`);
        const botoes = ro ? `<button type="button" class="btn btn-secundario" data-cancelar>${esc(t('dl_cancel'))}</button>` : `<button type="submit" class="btn">${esc(t('dl_save'))}</button><button type="button" class="btn btn-secundario" data-cancelar>${esc(t('dl_cancel'))}</button>`;
        const acoes = n && !ro ? `<div class="ng-fecho">${n.estado === 'aberto'
            ? `<button type="button" class="btn btn-secundario ng-ganho" data-fechar="ganho">${esc(t('dl_mark_won'))}</button><button type="button" class="btn btn-secundario" data-perder>${esc(t('dl_mark_lost'))}</button>`
            : `<button type="button" class="btn btn-secundario" data-reabrir>${esc(t('dl_reopen'))}</button>`}
            <button type="button" class="btn-link pp-apagar" data-apagar>${esc(t('dl_delete'))}</button></div>
            <div class="ng-perdido" id="ng-perdido" hidden>${campo(t('dl_lost_reason'), '<input type="text" id="ng-f-motivo" maxlength="200">')}<button type="button" class="btn btn-secundario" data-fechar="perdido">${esc(t('dl_confirm_lost'))}</button></div>
            ${n.lead_id ? `<p class="nota">${esc(t('dl_lead_note'))}</p>` : ''}${n.estado === 'perdido' && n.motivo_perda ? `<p class="nota">${esc(n.motivo_perda)}</p>` : ''}` : '';
        return `<form class="g-form" id="ng-form" novalidate><header class="ng-cab"><h2 id="ng-titulo">${esc(t(n ? 'dl_m_edit' : 'dl_m_new'))}</h2><button type="button" class="contact-x" data-cancelar aria-label="${esc(t('dl_cancel'))}">×</button></header>
            <div id="ng-erro"></div>${empresa}<div id="ng-props"></div>
            ${campo(t('dl_f_title'), `<input type="text" id="ng-f-titulo" maxlength="120" value="${esc(n?.titulo || '')}" ${ro ? 'disabled' : ''}>`)}
            <div class="g-linha">${campo(t('dl_f_value'), `<input type="text" inputmode="decimal" id="ng-f-valor" value="${esc(n ? String(n.valor).replace('.', ',') : '')}" placeholder="0" ${ro ? 'disabled' : ''}>`)}
                ${campo(t('dl_f_currency'), `<select id="ng-f-moeda" ${ro ? 'disabled' : ''}>${MOEDAS.map((m) => `<option ${m === (n?.moeda || 'EUR') ? 'selected' : ''}>${m}</option>`).join('')}</select>`)}</div>
            <div class="g-linha">${campo(t('dl_f_stage'), `<select id="ng-f-etapa" ${ro || fechado ? 'disabled' : ''}>${ETAPAS.map((e) => `<option value="${e}" ${e === (n?.etapa || etapaInicial) ? 'selected' : ''}>${esc(nomeEtapa(e))}</option>`).join('')}</select>`)}
                ${campo(t('dl_f_expected'), `<input type="date" id="ng-f-data" value="${esc(n?.data_prevista || '')}" ${ro ? 'disabled' : ''}>`)}</div>
            ${campo(t('lf_owner'), `<select id="ng-f-resp" ${ro ? 'disabled' : ''}><option value="">${esc(t('lf_no_owner'))}</option>${dados.equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === resp ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>`)}
            <div class="ng-botoes">${botoes}</div>${acoes}</form>`;
    }
    const erroModal = (txt) => { const e = $('ng-erro'); if (e) e.innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };

    async function guardar() {
        const corpo = { titulo: $('ng-f-titulo').value, valor: $('ng-f-valor').value, moeda: $('ng-f-moeda').value, etapa: $('ng-f-etapa').value, data_prevista: $('ng-f-data').value || null, responsavel_id: $('ng-f-resp').value || null };
        try {
            if (aEditar) {
                if (aEditar.estado !== 'aberto') delete corpo.etapa;
                await api(`/api/negocios/${encodeURIComponent(aEditar.id)}`, { method: 'PATCH', body: JSON.stringify(corpo) }); aviso(t('dl_saved'));
            } else {
                if (!empresaEscolhida) { erroModal(t('dl_choose_company')); return; }
                await api('/api/negocios', { method: 'POST', body: JSON.stringify({ ...corpo, empresa_id: empresaEscolhida.id, lead_id: empresaEscolhida.lead_id || undefined }) }); aviso(t('dl_created'));
            }
            fecharModal(); await carregar();
        } catch (e) { erroModal(erroDe(e)); }
    }
    async function fechar(resultado) {
        try {
            const motivo = resultado === 'perdido' ? ($('ng-f-motivo')?.value || '') : undefined;
            await api(`/api/negocios/${encodeURIComponent(aEditar.id)}/${resultado}`, { method: 'POST', body: JSON.stringify({ motivo }) });
            aviso(t(resultado === 'ganho' ? 'dl_closed_won' : 'dl_closed_lost')); fecharModal(); await carregar();
        } catch (e) { erroModal(erroDe(e)); }
    }
    async function acaoSimples(caminho, metodo, texto) {
        try { await api(caminho, { method: metodo }); aviso(texto); fecharModal(); await carregar(); } catch (e) { erroModal(erroDe(e)); }
    }

    // ---------- eventos ----------
    modal.addEventListener('submit', (ev) => { ev.preventDefault(); if (podeEditar) guardar(); });
    modal.addEventListener('click', async (ev) => {
        const a = ev.target;
        if (a.closest('[data-cancelar]')) { fecharModal(); return; }
        if (a.closest('[data-perder]')) { $('ng-perdido').hidden = false; $('ng-f-motivo').focus(); return; }
        const f = a.closest('[data-fechar]'); if (f) { await fechar(f.dataset.fechar); return; }
        if (a.closest('[data-reabrir]')) { await acaoSimples(`/api/negocios/${encodeURIComponent(aEditar.id)}/reabrir`, 'POST', t('dl_reopened')); return; }
        if (a.closest('[data-apagar]')) { if (window.confirm(sub(t('dl_confirm_delete'), { n: aEditar.titulo }))) await acaoSimples(`/api/negocios/${encodeURIComponent(aEditar.id)}`, 'DELETE', t('dl_deleted')); return; }
        const u = a.closest('[data-usar-valor]');
        if (u) { $('ng-f-valor').value = String(u.dataset.valor).replace('.', ','); $('ng-f-moeda').value = u.dataset.moeda; return; }
        const r = a.closest('[data-empresa]');
        if (r) {
            empresaEscolhida = resultados.find((x) => x.id === r.dataset.empresa) || null;
            if (empresaEscolhida) { $('ng-f-empresa').value = empresaEscolhida.nome; $('ng-f-res').innerHTML = ''; if (!$('ng-f-titulo').value) $('ng-f-titulo').value = empresaEscolhida.nome; if (empresaEscolhida.lead_id) carregarPropostas(empresaEscolhida.lead_id); else $('ng-props').innerHTML = ''; }
        }
    });
    modal.addEventListener('input', (ev) => {
        if (ev.target.id !== 'ng-f-empresa') return;
        empresaEscolhida = null;
        clearTimeout(escrever);
        const termo = ev.target.value.trim();
        escrever = setTimeout(async () => {
            try { resultados = termo.length >= 2 ? (await api(`/api/negocios/empresas?q=${encodeURIComponent(termo)}`)).empresas : []; } catch { resultados = []; }
            const caixa = $('ng-f-res'); if (!caixa) return;
            caixa.innerHTML = resultados.length ? `<ul class="dt-busca">${resultados.map((e) => `<li data-empresa="${esc(e.id)}" tabindex="0"><span><b>${esc(e.nome)}</b>${e.pais ? ` · ${esc(e.pais)}` : ''}</span></li>`).join('')}</ul>` : (termo.length >= 2 ? `<p class="nota">${esc(t('dl_no_results'))}</p>` : '');
        }, 300);
    });
    modal.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-empresa]')) ev.target.click(); });
    fundo.addEventListener('click', fecharModal);

    // a barra
    $('ng-barra').addEventListener('click', (ev) => {
        const atalho = ev.target.closest('[data-filtro-estado]');
        if (atalho) {                                                         // clicar outra vez no atalho ativo volta aos abertos
            filtros.estado = filtros.estado === atalho.dataset.filtroEstado ? 'aberto' : atalho.dataset.filtroEstado;
            lembrar('estado', filtros.estado); if ($('ng-estado')) $('ng-estado').value = filtros.estado; carregar(); return;
        }
        if (ev.target.closest('#ng-novo')) { abrirModal(); return; }
        const b = ev.target.closest('[data-vista]');
        if (b) { vista = b.dataset.vista; lembrar('vista', vista); montarBarra(); desenhar(); }
    });
    let esperar = null;
    $('ng-barra').addEventListener('input', (ev) => { if (ev.target.id === 'ng-q') { clearTimeout(esperar); esperar = setTimeout(() => { filtros.q = ev.target.value.trim(); carregar(); }, 300); } });
    $('ng-barra').addEventListener('change', (ev) => {
        const el = ev.target;
        if (el.id === 'ng-resp') { filtros.responsavel = el.value; carregar(); }
        else if (el.id === 'ng-estado') { filtros.estado = el.value; lembrar('estado', el.value); carregar(); }
        else if (el.id === 'ng-ordem') { ordem = el.value; lembrar('ordem', ordem); desenhar(); }
    });

    // o corpo: abrir negócio, «+» de cada coluna, arrastar e largar
    const corpo = $('ng-corpo');
    let arrastou = false;
    corpo.addEventListener('click', (ev) => {
        if (ev.target.closest('#ng-novo-vazio')) { abrirModal(); return; }
        const mais = ev.target.closest('[data-nova-etapa]'); if (mais) { abrirModal({ etapa: mais.dataset.novaEtapa }); return; }
        const c = ev.target.closest('[data-negocio]'); if (c && !arrastou) abrirModal({ id: c.dataset.negocio });
    });
    corpo.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-negocio]')) { ev.preventDefault(); abrirModal({ id: ev.target.dataset.negocio }); } });
    corpo.addEventListener('dragstart', (ev) => { const c = ev.target.closest('.ng-card'); if (!c || !podeEditar) return; arrastou = true; ev.dataTransfer.setData('text/plain', c.dataset.negocio); ev.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastar'); });
    corpo.addEventListener('dragend', (ev) => { ev.target.classList?.remove('arrastar'); document.querySelectorAll('.coluna.alvo').forEach((c) => c.classList.remove('alvo')); setTimeout(() => { arrastou = false; }, 50); });
    corpo.addEventListener('dragover', (ev) => { const c = ev.target.closest('.ng-coluna'); if (c && podeEditar) { ev.preventDefault(); c.classList.add('alvo'); } });
    corpo.addEventListener('dragleave', (ev) => { const c = ev.target.closest('.ng-coluna'); if (c && !c.contains(ev.relatedTarget)) c.classList.remove('alvo'); });
    corpo.addEventListener('drop', (ev) => {
        const c = ev.target.closest('.ng-coluna'); if (!c || !podeEditar) return;
        ev.preventDefault(); c.classList.remove('alvo');
        const id = ev.dataTransfer.getData('text/plain');
        setTimeout(() => { arrastou = false; }, 100);                       // o cartão arrastado sai da página ao redesenhar e o «dragend» pode não chegar: não deixar os cliques bloqueados
        if (id) mover(id, c.dataset.etapa);
    });

    I18N.aoMudar(() => { montarBarra(); desenhar(); if (!modal.hidden && aEditar) { const id = aEditar.id; fecharModal(); abrirModal({ id }); } });
    montarBarra();
    carregar();
})();

/* tasks.js: página «Tarefas». Todas as tarefas de todos os leads em quatro vistas: Lista, Prazo (quadro por vencimento), Planeador
   (quadro por coluna de planeamento) e Calendário (mês). As tarefas automáticas vêm do estado dos leads (o servidor cria e fecha).
   Os totais e as colunas calculam-se aqui a partir do que o servidor devolve; o servidor valida cada alteração. Textos: i18n.js. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const VISTAS = ['lista', 'prazo', 'planeador', 'calendario'];
    const ESTADOS = ['aberta', 'concluida', 'todas'];
    const MOSTRAR = ['todas', 'minhas', 'criadas', 'nenhum'];
    const TIPOS = ['follow_up', 'reuniao', 'proposta', 'outro'];
    const PLANEAMENTOS = ['nao_planeado', 'em_curso', 'esta_semana', 'revisao'];
    const COLUNAS_PRAZO = ['vencido', 'hoje', 'semana', 'proxima', 'depois', 'feito'];

    // ---------- utilitários ----------
    const lembrar = (k, v) => { try { localStorage.setItem('ns_tarefas_' + k, v); } catch { /* sem armazenamento: não faz mal */ } };
    const lido = (k, padrao) => { try { return localStorage.getItem('ns_tarefas_' + k) || padrao; } catch { return padrao; } };
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const dois = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
    const doIso = (s) => new Date(`${s}T12:00:00`);
    const hojeLocal = () => iso(new Date());
    const somar = (s, dias) => { const d = doIso(s); d.setDate(d.getDate() + dias); return iso(d); };
    const diaSemana = (s) => (doIso(s).getDay() + 6) % 7;                         // segunda = 0 … domingo = 6
    const dataCurta = (s) => doIso(s).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' });
    const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('');
    const erroDe = (e) => (e && e.codigo === 'CONFIG' ? t('tk_err_sql') : e && ['INVALIDO', 'VAZIO', 'NAO_ENCONTRADA'].includes(e.codigo) && e.message ? e.message : t('tk_err'));
    const lerEm = (k, lista, padrao) => (lista.includes(lido(k, padrao)) ? lido(k, padrao) : padrao);

    // ---------- estado da página ----------
    let vista = lerEm('vista', VISTAS, 'lista');
    const filtros = { q: '', mostrar: lerEm('mostrar', MOSTRAR, 'todas'), estado: lerEm('estado', ESTADOS, 'aberta') };
    let mes = hojeLocal().slice(0, 7);                                            // «AAAA-MM» do calendário
    let diaAberto = null;                                                         // dia do calendário com «+n mais» aberto
    let dados = { tarefas: [], equipa: [], planeamento_disponivel: true, limite: 2000, contagens: { abertas: 0, atrasadas: 0, hoje: 0 } };
    let concluidas = [];                                                          // só na vista Prazo: as últimas concluídas, para a coluna «Concluído»
    let carregado = false, falhou = false, erroSql = false, pedido = 0, temporizador = null;
    let google = { configurado: false, ligado: false };           // Google Calendar: estado da ligação
    let eventosGoogle = [], chaveGoogle = '';                      // eventos do Google no mês visível (só leitura)
    const souAdmin = !!utilizador && utilizador.papel === 'admin';

    function aviso(texto, erro = false) {
        $('tk-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('tk-aviso').innerHTML = ''; }, 5000);
    }

    // ---------- carregar ----------
    function consulta(estado) {
        const qs = new URLSearchParams();
        qs.set('estado', estado);
        if (filtros.mostrar === 'minhas') qs.set('responsavel', 'eu');
        else if (filtros.mostrar === 'nenhum') qs.set('responsavel', 'nenhum');
        else if (filtros.mostrar === 'criadas') qs.set('criada_por', 'eu');
        if (filtros.q) qs.set('q', filtros.q);
        return '/api/tarefas?' + qs;
    }
    async function carregar() {
        const n = ++pedido;
        try {
            const r = await api(consulta(filtros.estado));
            let extra = [];
            if (vista === 'prazo' && filtros.estado === 'aberta') {
                try { extra = (await api(consulta('concluida'))).tarefas.sort((a, b) => String(b.concluida_em).localeCompare(String(a.concluida_em))).slice(0, 30); } catch { extra = []; }
            }
            if (n !== pedido) return;
            dados = r; concluidas = extra; falhou = false; erroSql = false;
        } catch (e) { if (n !== pedido) return; falhou = true; erroSql = !!e && e.codigo === 'CONFIG'; }
        carregado = true;
        atualizarBarra(); desenhar();
    }

    // ---------- barra (construída uma vez, para a pesquisa não perder o foco) ----------
    function montarBarra() {
        const opts = (lista, atual, rot) => lista.map((v) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(rot(v))}</option>`).join('');
        $('tk-barra').innerHTML = `<div class="ng-linha">
            <div class="vista" role="group" aria-label="${esc(t('nav_tarefas'))}">${VISTAS.map((v) => `<button type="button" data-vista="${v}" aria-pressed="${v === vista}" class="${v === vista ? 'on' : ''}">${esc(t('tk_view_' + ({ lista: 'list', prazo: 'deadline', planeador: 'planner', calendario: 'calendar' })[v]))}</button>`).join('')}</div>
            ${podeEditar ? `<button type="button" class="btn ng-novo" id="tk-novo">${esc(t('tk_new'))}</button>` : ''}
            <span class="tk-contadores" id="tk-contadores"></span><span class="tk-google" id="tk-google"></span>
            <label class="campo ng-pesquisa"><span class="rp-so-leitor">${esc(t('tk_search_ph'))}</span><input type="search" id="tk-q" maxlength="80" autocomplete="off" placeholder="${esc(t('tk_search_ph'))}" value="${esc(filtros.q)}"></label>
            <label class="campo"><span>${esc(t('tk_show'))}</span><select id="tk-mostrar">${opts(MOSTRAR, filtros.mostrar, (v) => t('tk_show_' + ({ todas: 'all', minhas: 'mine', criadas: 'created', nenhum: 'none' })[v]))}</select></label>
            <label class="campo"><span>${esc(t('tk_st'))}</span><select id="tk-estado">${opts(ESTADOS, filtros.estado, (v) => t('tk_st_' + v))}</select></label></div>
            ${podeEditar ? '' : `<p class="nota">${esc(t('tk_view_only'))}</p>`}`;
        atualizarBarra();
    }
    // ---------- Google Calendar ----------
    function desenharGoogle() {
        const el = $('tk-google'); if (!el) return;
        const g = google;
        if (!g.configurado) { el.innerHTML = `<span class="chip vazio-chip" title="${esc(t('tk_g_unset_tip'))}">${esc(t('tk_g_unset'))}</span>`; return; }
        if (!g.ligado) { el.innerHTML = souAdmin ? `<button type="button" class="btn btn-secundario tk-g-btn" id="tk-g-ligar">${esc(t('tk_g_connect'))}</button>` : `<span class="chip vazio-chip">${esc(t('tk_g_not_connected'))}</span>`; return; }
        el.innerHTML = `<span class="chip ${g.erro ? 'atrasada' : 'chip-ok'}" title="${esc(g.erro || '')}">${esc(sub(t(g.erro ? 'tk_g_problem' : 'tk_g_connected'), { e: g.email || 'Google' }))}</span>${souAdmin ? `<button type="button" class="btn-link" id="tk-g-sync">${esc(t('tk_g_sync'))}</button><button type="button" class="btn-link pp-apagar" id="tk-g-off">${esc(t('tk_g_disconnect'))}</button>` : ''}${g.erro ? `<span class="tk-g-erro">${esc(g.erro)}</span>` : ''}`;
    }
    async function carregarGoogle() {
        try { google = await api('/api/google/estado'); } catch { google = { configurado: false, ligado: false }; }
        desenharGoogle();
        if (vista === 'calendario') { chaveGoogle = ''; desenhar(); }
    }
    // intervalo visível no calendário (a grelha inclui dias do mês anterior e seguinte)
    function intervaloCalendario() {
        const [ano, mm] = mes.split('-').map(Number), primeiro = `${mes}-01`;
        const inicio = somar(primeiro, -diaSemana(primeiro)), semanas = Math.ceil((diaSemana(primeiro) + new Date(ano, mm, 0).getDate()) / 7);
        return { de: inicio, ate: somar(inicio, semanas * 7 - 1) };
    }
    async function pedirEventosGoogle() {
        if (!google.ligado) { eventosGoogle = []; return; }
        const { de, ate } = intervaloCalendario(), chave = `${de}|${ate}`;
        if (chave === chaveGoogle) return;
        chaveGoogle = chave;
        try { eventosGoogle = (await api(`/api/google/eventos?de=${de}&ate=${ate}`)).eventos || []; } catch { eventosGoogle = []; }
        if (vista === 'calendario' && chave === chaveGoogle) desenhar();
    }
    async function acaoGoogle(caminho) {
        try { return await api(caminho, { method: 'POST' }); } catch (e) { aviso(e?.codigo === 'CONFIG' ? t('tk_g_unset_tip') : e?.message || t('tk_err'), true); return null; }
    }

    function atualizarBarra() {
        const c = dados.contagens || {};
        desenharGoogle();
        if ($('tk-contadores')) $('tk-contadores').innerHTML = `<span class="chip ${c.atrasadas ? 'atrasada' : ''}">${esc(t('tk_late'))} ${c.atrasadas || 0}</span><span class="chip ${c.hoje ? 'hoje' : ''}">${esc(t('tk_today'))} ${c.hoje || 0}</span><span class="chip" title="${esc(sub(t('tk_open'), { n: c.abertas || 0 }))}">${esc(sub(t('tk_open'), { n: c.abertas || 0 }))}</span>`;
    }

    // ---------- peças comuns ----------
    const hoje = () => hojeLocal();
    const prazoChip = (x) => {
        if (x.concluida_em) return `<span class="chip chip-ok">${esc(dataCurta(x.prazo) + horaDe(x))}</span>`;
        const h = hoje();
        return `<span class="chip ${x.prazo < h ? 'atrasada' : x.prazo === h ? 'hoje' : ''}">${esc(dataCurta(x.prazo) + horaDe(x))}</span>`;
    };
    const horaDe = (x) => (x.hora ? ` ${x.hora}` : '');
    const nomeLead = (x) => (x.lead_estado ? t('estado_' + x.lead_estado) : '');
    const avatar = (x) => (x.responsavel ? `<span class="avatar-mini" title="${esc(x.responsavel.nome || '')}">${esc(iniciais(x.responsavel.nome))}</span>` : '');
    const autoChip = (x) => (x.origem === 'automatica' ? `<span class="chip tk-auto" title="${esc(t('tk_auto_note'))}">${esc(t('tk_auto'))}</span>` : '');
    const ordenarPrazo = (lista) => lista.slice().sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)) || String(a.hora || '99').localeCompare(String(b.hora || '99')) || String(a.titulo).localeCompare(String(b.titulo)));

    function cartao(x, arrastavel) {
        return `<article class="lead-card tk-card ${x.concluida_em ? 'tk-feita' : ''}" tabindex="0" role="button" ${arrastavel ? 'draggable="true"' : ''} data-tarefa="${esc(x.id)}" aria-label="${esc(x.titulo)}">
            <div class="lead-top"><b>${esc(x.titulo)}</b>${avatar(x)}</div>
            <span class="lead-sub">${esc(x.empresa?.nome || '')}</span>
            <div class="lead-meta">${prazoChip(x)}<span class="chip">${esc(t('tt_' + x.tipo))}</span>${autoChip(x)}</div></article>`;
    }
    const colunaHtml = (chave, titulo, itens, arrastavel, atributo) => `<section class="coluna tk-coluna" ${atributo}="${esc(chave)}" aria-label="${esc(titulo)}">
        <header><b>${esc(titulo)}</b><span>${itens.length}</span></header>
        <div class="coluna-corpo">${itens.length ? itens.map((x) => cartao(x, arrastavel)).join('') : `<p class="coluna-vazia">${esc(t('tk_col_empty'))}</p>`}</div></section>`;

    // ---------- vista: Lista ----------
    function listaHtml(tarefas) {
        const linhas = ordenarPrazo(tarefas).map((x) => `<tr tabindex="0" data-tarefa="${esc(x.id)}" class="${x.concluida_em ? 'tk-feita' : ''}">
            <td class="tk-check"><input type="checkbox" data-concluir="${esc(x.id)}" ${x.concluida_em ? 'checked' : ''} ${podeEditar ? '' : 'disabled'} aria-label="${esc(t('tk_f_done') + ': ' + x.titulo)}"></td>
            <td><b>${esc(x.titulo)}</b> ${autoChip(x)}<span class="lead-sub">${esc(x.empresa?.nome || '')}${nomeLead(x) ? ' · ' + esc(nomeLead(x)) : ''}</span></td>
            <td>${prazoChip(x)}</td><td>${esc(t('tt_' + x.tipo))}</td><td>${esc(x.criada_por_nome || '–')}</td><td>${esc(x.responsavel?.nome || '–')}</td></tr>`).join('');
        return `<div class="tabela-rolar"><table class="tabela tk-tabela"><thead><tr><th scope="col" class="tk-check"></th>${['name', 'deadline', 'type', 'by', 'owner'].map((k) => `<th scope="col">${esc(t('tk_col_' + k))}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    // ---------- vista: Prazo ----------
    function colunaPrazo(x) {
        if (x.concluida_em) return 'feito';
        const h = hoje(), domingo = somar(h, 6 - diaSemana(h));
        if (x.prazo < h) return 'vencido';
        if (x.prazo === h) return 'hoje';
        if (x.prazo <= domingo) return 'semana';
        if (x.prazo <= somar(domingo, 7)) return 'proxima';
        return 'depois';
    }
    function prazoDeSoltar(coluna) {
        const h = hoje(), dow = diaSemana(h);
        if (coluna === 'hoje') return h;
        if (coluna === 'semana') return dow <= 3 ? somar(h, 4 - dow) : dow <= 5 ? somar(h, 6 - dow) : null;     // sexta; sexta/sábado → domingo; domingo: já não há dias
        if (coluna === 'proxima') return somar(h, 11 - dow);                                                   // sexta da próxima semana
        if (coluna === 'depois') return somar(h, 14);
        return null;
    }
    function prazoHtml(tarefas) {
        const todas = tarefas.concat(concluidas.filter((c) => !tarefas.some((x) => x.id === c.id)));
        return `<div class="quadro tk-quadro">${COLUNAS_PRAZO.map((c) => colunaHtml(c, t('tk_dl_' + ({ vencido: 'overdue', hoje: 'today', semana: 'week', proxima: 'next', depois: 'later', feito: 'done' })[c]), c === 'feito' ? todas.filter((x) => x.concluida_em) : ordenarPrazo(todas.filter((x) => colunaPrazo(x) === c)), podeEditar, 'data-prazo')).join('')}</div>`;
    }

    // ---------- vista: Planeador ----------
    function planeadorHtml(tarefas) {
        const abertas = tarefas.filter((x) => !x.concluida_em);
        return `${dados.planeamento_disponivel ? '' : `<p class="nota" role="note">${esc(t('tk_pl_off'))}</p>`}<div class="quadro tk-quadro tk-quadro4">${PLANEAMENTOS.map((p) => colunaHtml(p, t('tk_pl_' + p), ordenarPrazo(abertas.filter((x) => x.planeamento === p)), podeEditar && dados.planeamento_disponivel, 'data-plano')).join('')}</div>`;
    }

    // ---------- vista: Calendário ----------
    function calendarioHtml(tarefas) {
        const [ano, mm] = mes.split('-').map(Number);
        const primeiro = `${mes}-01`, h = hoje();
        const inicio = somar(primeiro, -diaSemana(primeiro));
        const diasMes = new Date(ano, mm, 0).getDate();
        const semanas = Math.ceil((diaSemana(primeiro) + diasMes) / 7);
        const porDia = new Map();
        ordenarPrazo(tarefas).forEach((x) => { if (!porDia.has(x.prazo)) porDia.set(x.prazo, []); porDia.get(x.prazo).push(x); });
        const gDia = new Map();
        eventosGoogle.forEach((e) => { if (!gDia.has(e.dia)) gDia.set(e.dia, []); gDia.get(e.dia).push(e); });
        const nomesDias = Array.from({ length: 7 }, (_, i) => doIso(somar('2024-01-01', i)).toLocaleDateString(I18N.locale(), { weekday: 'short' }));
        let celulas = '';
        for (let i = 0; i < semanas * 7; i++) {
            const dia = somar(inicio, i), fora = dia.slice(0, 7) !== mes;
            const lista = [...(porDia.get(dia) || []).map((x) => ({ x })), ...(gDia.get(dia) || []).map((e) => ({ e }))];
            const aberto = diaAberto === dia, visiveis = aberto ? lista : lista.slice(0, 3);
            celulas += `<div class="tk-dia ${fora ? 'fora' : ''} ${dia === h ? 'hoje' : ''}" data-dia="${dia}">
                ${podeEditar ? `<button type="button" class="tk-dia-num" data-novo-dia="${dia}" aria-label="${esc(t('tk_new') + ' · ' + dataCurta(dia))}">${Number(dia.slice(8))}</button>` : `<span class="tk-dia-num">${Number(dia.slice(8))}</span>`}
                ${visiveis.map((i) => (i.e ? `<button type="button" class="tk-evento google" data-google-link="${esc(i.e.link || '')}" title="${esc(t('tk_g_event_tip') + ': ' + i.e.titulo)}">${esc((i.e.hora ? i.e.hora + ' ' : '') + i.e.titulo)}</button>` : `<button type="button" class="tk-evento ${i.x.concluida_em ? 'feita' : i.x.prazo < h ? 'atrasada' : ''}" data-tarefa="${esc(i.x.id)}" title="${esc(i.x.titulo + (i.x.empresa?.nome ? ' · ' + i.x.empresa.nome : ''))}">${esc((i.x.hora ? i.x.hora + ' ' : '') + i.x.titulo)}</button>`)).join('')}
                ${lista.length > 3 && !aberto ? `<button type="button" class="tk-mais" data-mais="${dia}">${esc(sub(t('tk_cal_more'), { n: lista.length - 3 }))}</button>` : ''}</div>`;
        }
        const bruto = new Date(ano, mm - 1, 1).toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' }), titulo = bruto.charAt(0).toUpperCase() + bruto.slice(1);
        return `<div class="tk-cal"><div class="tk-cal-cab"><button type="button" class="btn btn-secundario" data-mes="-1" aria-label="${esc(t('tk_cal_prev'))}">‹</button>
            <h2>${esc(titulo)}</h2><button type="button" class="btn btn-secundario" data-mes="1" aria-label="${esc(t('tk_cal_next'))}">›</button>
            <button type="button" class="btn btn-secundario" data-mes="0">${esc(t('tk_cal_today'))}</button></div>
            <div class="tk-cal-grelha" role="grid">${nomesDias.map((n) => `<div class="tk-cal-dia-nome" role="columnheader">${esc(n)}</div>`).join('')}${celulas}</div></div>`;
    }

    function desenhar() {
        const corpo = $('tk-corpo');
        if (!carregado) return;
        if (falhou) { corpo.innerHTML = `<div class="erro-ui" role="alert">${esc(erroSql ? t('tk_err_sql') : t('tk_err_load'))}</div>`; return; }
        const n = dados.tarefas;
        const nota = n.length >= dados.limite ? `<p class="nota">${esc(sub(t('tk_truncated'), { n: dados.limite }))}</p>` : '';
        const semTarefas = !n.length && !filtros.q && filtros.mostrar === 'todas' && filtros.estado === 'aberta';
        const vazio = semTarefas ? `<div class="ng-vazio"><b>${esc(t('tk_empty_t'))}</b><span>${esc(t('tk_empty_s'))}</span></div>` : '';
        const x = $('tk-corpo');
        if (vista === 'lista') x.innerHTML = nota + (n.length ? listaHtml(n) : `<div class="vazio"><b>${esc(t('tk_empty_t'))}</b></div>`);
        else if (vista === 'prazo') x.innerHTML = nota + prazoHtml(n) + vazio;
        else if (vista === 'planeador') x.innerHTML = nota + planeadorHtml(n) + vazio;
        else { x.innerHTML = nota + calendarioHtml(n); pedirEventosGoogle(); }
    }

    // ---------- alterações rápidas ----------
    async function alterar(id, corpo, mensagem, reverter) {
        try { await api(`/api/tarefas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(corpo) }); if (mensagem) aviso(mensagem); await carregar(); }
        catch (e) { if (reverter) reverter(); aviso(erroDe(e), true); desenhar(); }
    }
    function soltarNoPrazo(id, coluna) {
        const x = [...dados.tarefas, ...concluidas].find((y) => y.id === id);
        if (!x || colunaPrazo(x) === coluna) return;
        if (coluna === 'vencido') { aviso(t('tk_no_drop_overdue'), true); return; }
        if (coluna === 'feito') { alterar(id, { concluida: true }, t('tk_completed')); return; }
        const novo = prazoDeSoltar(coluna);
        if (!novo) { aviso(t('tk_no_week_left'), true); return; }
        const nome = t('tk_dl_' + ({ hoje: 'today', semana: 'week', proxima: 'next', depois: 'later' })[coluna]);
        alterar(id, x.concluida_em ? { prazo: novo, concluida: false } : { prazo: novo }, sub(t('tk_moved'), { c: nome }));
    }
    function soltarNoPlano(id, plano) {
        const x = dados.tarefas.find((y) => y.id === id);
        if (!x || x.planeamento === plano) return;
        const anterior = x.planeamento;
        x.planeamento = plano; desenhar();                                      // o cartão muda logo; se o servidor recusar, volta atrás
        alterar(id, { planeamento: plano }, sub(t('tk_moved'), { c: t('tk_pl_' + plano) }), () => { x.planeamento = anterior; });
    }

    // ======================= JANELA (criar e editar) =======================
    const modal = $('tk-modal'), fundo = $('tk-fundo');
    let aEditar = null, empresaEscolhida = null, resultados = [], focoAnterior = null, escrever = null;
    const campo = (rot, corpo, cls = '') => `<label class="campo ${cls}"><span>${esc(rot)}</span>${corpo}</label>`;

    function abrirModal({ id = null, dia = null } = {}) {
        focoAnterior = document.activeElement;
        aEditar = id ? [...dados.tarefas, ...concluidas].find((x) => x.id === id) : null;
        if (id && !aEditar) return;
        empresaEscolhida = null; resultados = [];
        modal.innerHTML = formularioHtml(dia);
        modal.hidden = false; fundo.hidden = false; document.body.classList.add('modal-aberto');
        document.addEventListener('keydown', teclaModal, true);
        (modal.querySelector('#tk-f-empresa') || modal.querySelector('#tk-f-titulo'))?.focus();
    }
    function fecharModal() {
        modal.hidden = true; fundo.hidden = true; modal.innerHTML = ''; document.body.classList.remove('modal-aberto');
        document.removeEventListener('keydown', teclaModal, true);
        if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
        aEditar = null;
    }
    const teclaModal = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fecharModal(); } };
    const erroModal = (txt) => { const e = $('tk-erro'); if (e) e.innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };

    function formularioHtml(dia) {
        const x = aEditar, ro = !podeEditar;
        const resp = (x ? x.responsavel_id : utilizador?.id) || '';
        const empresa = x
            ? `<p class="ng-empresa"><b>${esc(x.empresa?.nome || '')}</b>${nomeLead(x) ? ` · ${esc(nomeLead(x))}` : ''} · <a href="/assets/pages/leads.html#lead=${esc(x.lead_id)}">${esc(t('tk_open_lead'))}</a></p>${x.origem === 'automatica' ? `<p class="nota">${esc(t('tk_auto_note'))}</p>` : ''}`
            : campo(t('tk_f_company'), `<input type="search" id="tk-f-empresa" maxlength="80" autocomplete="off" placeholder="${esc(t('tk_f_company_ph'))}"><div id="tk-f-res"></div>`);
        const botoes = ro ? `<button type="button" class="btn btn-secundario" data-cancelar>${esc(t('tk_cancel'))}</button>` : `<button type="submit" class="btn">${esc(t('tk_save'))}</button><button type="button" class="btn btn-secundario" data-cancelar>${esc(t('tk_cancel'))}</button>`;
        return `<form class="g-form" id="tk-form" novalidate><header class="ng-cab"><h2 id="tk-titulo">${esc(t(x ? 'tk_m_edit' : 'tk_m_new'))}</h2><button type="button" class="contact-x" data-cancelar aria-label="${esc(t('tk_cancel'))}">×</button></header>
            <div id="tk-erro"></div>${empresa}
            ${campo(t('tk_f_title'), `<input type="text" id="tk-f-titulo" maxlength="120" value="${esc(x?.titulo || '')}" ${ro ? 'disabled' : ''}>`)}
            <div class="g-linha">${campo(t('tk_col_type'), `<select id="tk-f-tipo" ${ro ? 'disabled' : ''}>${TIPOS.map((v) => `<option value="${v}" ${v === (x?.tipo || 'follow_up') ? 'selected' : ''}>${esc(t('tt_' + v))}</option>`).join('')}</select>`)}
                ${campo(t('tk_f_deadline'), `<input type="date" id="tk-f-prazo" value="${esc(x?.prazo || dia || hoje())}" ${ro ? 'disabled' : ''}>`)}</div>
            ${dados.planeamento_disponivel ? campo(t('tk_f_time'), `<input type="time" id="tk-f-hora" value="${esc(x?.hora || '')}" ${ro ? 'disabled' : ''}>`) : ''}
            <div class="g-linha">${campo(t('tk_col_owner'), `<select id="tk-f-resp" ${ro ? 'disabled' : ''}><option value="">${esc(t('lf_no_owner'))}</option>${dados.equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === resp ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>`)}
                ${dados.planeamento_disponivel ? campo(t('tk_f_planner'), `<select id="tk-f-plano" ${ro ? 'disabled' : ''}>${PLANEAMENTOS.map((p) => `<option value="${p}" ${p === (x?.planeamento || 'nao_planeado') ? 'selected' : ''}>${esc(t('tk_pl_' + p))}</option>`).join('')}</select>`) : ''}</div>
            ${x ? `<label class="tk-concluir"><input type="checkbox" id="tk-f-feita" ${x.concluida_em ? 'checked' : ''} ${ro ? 'disabled' : ''}> ${esc(t('tk_f_done'))}</label>` : ''}
            <div class="ng-botoes">${botoes}${x && !ro ? `<button type="button" class="btn-link pp-apagar" data-apagar>${esc(t('tk_delete'))}</button>` : ''}</div></form>`;
    }

    async function guardar() {
        const corpo = { titulo: $('tk-f-titulo').value, tipo: $('tk-f-tipo').value, prazo: $('tk-f-prazo').value, responsavel_id: $('tk-f-resp').value || null };
        if ($('tk-f-plano')) corpo.planeamento = $('tk-f-plano').value;
        if ($('tk-f-hora')) corpo.hora = $('tk-f-hora').value || null;
        try {
            if (aEditar) {
                corpo.concluida = !!$('tk-f-feita')?.checked;
                if (!$('tk-f-plano') || corpo.planeamento === (aEditar.planeamento || 'nao_planeado')) delete corpo.planeamento;
                await api(`/api/tarefas/${encodeURIComponent(aEditar.id)}`, { method: 'PATCH', body: JSON.stringify(corpo) }); aviso(t('tk_saved'));
            } else {
                if (!empresaEscolhida || !empresaEscolhida.lead_id) { erroModal(t('tk_choose_company')); return; }
                if (corpo.planeamento === 'nao_planeado') delete corpo.planeamento;
                await api('/api/tarefas', { method: 'POST', body: JSON.stringify({ ...corpo, lead_id: empresaEscolhida.lead_id }) }); aviso(t('tk_created'));
            }
            fecharModal(); await carregar();
        } catch (e) { erroModal(erroDe(e)); }
    }

    modal.addEventListener('submit', (ev) => { ev.preventDefault(); if (podeEditar) guardar(); });
    modal.addEventListener('click', async (ev) => {
        const a = ev.target;
        if (a.closest('[data-cancelar]')) { fecharModal(); return; }
        if (a.closest('[data-apagar]')) {
            if (!window.confirm(sub(t('tk_confirm_delete'), { n: aEditar.titulo }))) return;
            try { await api(`/api/tarefas/${encodeURIComponent(aEditar.id)}`, { method: 'DELETE' }); aviso(t('tk_deleted')); fecharModal(); await carregar(); } catch (e) { erroModal(erroDe(e)); }
            return;
        }
        const r = a.closest('[data-empresa]');
        if (r) {
            empresaEscolhida = resultados.find((x) => x.id === r.dataset.empresa) || null;
            if (empresaEscolhida) { $('tk-f-empresa').value = empresaEscolhida.nome; $('tk-f-res').innerHTML = ''; if (!$('tk-f-titulo').value) $('tk-f-titulo').focus(); }
        }
    });
    modal.addEventListener('input', (ev) => {
        if (ev.target.id !== 'tk-f-empresa') return;
        empresaEscolhida = null;
        clearTimeout(escrever);
        const termo = ev.target.value.trim();
        escrever = setTimeout(async () => {
            try { resultados = termo.length >= 2 ? (await api(`/api/tarefas/empresas?q=${encodeURIComponent(termo)}`)).empresas : []; } catch { resultados = []; }
            const caixa = $('tk-f-res'); if (!caixa) return;
            caixa.innerHTML = resultados.length ? `<ul class="dt-busca">${resultados.map((e) => `<li data-empresa="${esc(e.id)}" tabindex="0"><span><b>${esc(e.nome)}</b>${e.pais ? ` · ${esc(e.pais)}` : ''}${e.lead_id ? '' : ' · –'}</span></li>`).join('')}</ul>` : (termo.length >= 2 ? `<p class="nota">${esc(t('tk_no_results'))}</p>` : '');
        }, 300);
    });
    modal.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-empresa]')) ev.target.click(); });
    fundo.addEventListener('click', fecharModal);

    // ---------- a barra ----------
    $('tk-barra').addEventListener('click', async (ev) => {
        if (ev.target.closest('#tk-g-ligar')) { const r = await acaoGoogle('/api/google/ligar'); if (r?.url) window.location.href = r.url; return; }
        if (ev.target.closest('#tk-g-sync')) { const r = await acaoGoogle('/api/google/sincronizar'); if (r) { aviso(sub(t('tk_g_synced'), { c: r.criados, a: r.atualizados })); chaveGoogle = ''; if (vista === 'calendario') desenhar(); await carregarGoogle(); } return; }
        if (ev.target.closest('#tk-g-off')) { if (!window.confirm(t('tk_g_confirm_off'))) return; const r = await acaoGoogle('/api/google/desligar'); if (r) { google = r; eventosGoogle = []; chaveGoogle = ''; aviso(t('tk_g_off')); desenharGoogle(); if (vista === 'calendario') desenhar(); } return; }
        if (ev.target.closest('#tk-novo')) { abrirModal(); return; }
        const b = ev.target.closest('[data-vista]');
        if (b) { vista = b.dataset.vista; lembrar('vista', vista); montarBarra(); if (vista === 'prazo') carregar(); else desenhar(); }
    });
    let esperar = null;
    $('tk-barra').addEventListener('input', (ev) => { if (ev.target.id === 'tk-q') { clearTimeout(esperar); esperar = setTimeout(() => { filtros.q = ev.target.value.trim(); carregar(); }, 300); } });
    $('tk-barra').addEventListener('change', (ev) => {
        const el = ev.target;
        if (el.id === 'tk-mostrar') { filtros.mostrar = el.value; lembrar('mostrar', el.value); carregar(); }
        else if (el.id === 'tk-estado') { filtros.estado = el.value; lembrar('estado', el.value); carregar(); }
    });

    // ---------- o corpo: abrir, concluir, calendário, arrastar e largar ----------
    const corpo = $('tk-corpo');
    let arrastou = false;
    corpo.addEventListener('click', (ev) => {
        const caixa = ev.target.closest('[data-concluir]');
        if (caixa) { if (podeEditar) { const feita = caixa.checked; alterar(caixa.dataset.concluir, { concluida: feita }, t(feita ? 'tk_completed' : 'tk_reopened'), () => { caixa.checked = !feita; }); } return; }
        const mes_ = ev.target.closest('[data-mes]');
        if (mes_) { const n = Number(mes_.dataset.mes); const [a, m] = mes.split('-').map(Number); const d = n === 0 ? new Date() : new Date(a, m - 1 + n, 1); mes = `${d.getFullYear()}-${dois(d.getMonth() + 1)}`; diaAberto = null; desenhar(); return; }
        const gl = ev.target.closest('[data-google-link]'); if (gl) { if (gl.dataset.googleLink) window.open(gl.dataset.googleLink, '_blank', 'noopener'); return; }
        const mais = ev.target.closest('[data-mais]'); if (mais) { diaAberto = mais.dataset.mais; desenhar(); return; }
        const novo = ev.target.closest('[data-novo-dia]'); if (novo) { abrirModal({ dia: novo.dataset.novoDia }); return; }
        const c = ev.target.closest('[data-tarefa]'); if (c && !arrastou) abrirModal({ id: c.dataset.tarefa });
    });
    corpo.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-tarefa], .tk-card')) { ev.preventDefault(); abrirModal({ id: ev.target.dataset.tarefa }); } });
    corpo.addEventListener('dragstart', (ev) => { const c = ev.target.closest('.tk-card'); if (!c || !podeEditar) return; arrastou = true; ev.dataTransfer.setData('text/plain', c.dataset.tarefa); ev.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastar'); });
    corpo.addEventListener('dragend', (ev) => { ev.target.classList?.remove('arrastar'); document.querySelectorAll('.coluna.alvo').forEach((c) => c.classList.remove('alvo')); setTimeout(() => { arrastou = false; }, 50); });
    corpo.addEventListener('dragover', (ev) => { const c = ev.target.closest('.tk-coluna'); if (c && podeEditar) { ev.preventDefault(); c.classList.add('alvo'); } });
    corpo.addEventListener('dragleave', (ev) => { const c = ev.target.closest('.tk-coluna'); if (c && !c.contains(ev.relatedTarget)) c.classList.remove('alvo'); });
    corpo.addEventListener('drop', (ev) => {
        const c = ev.target.closest('.tk-coluna'); if (!c || !podeEditar) return;
        ev.preventDefault(); c.classList.remove('alvo');
        const id = ev.dataTransfer.getData('text/plain');
        setTimeout(() => { arrastou = false; }, 100);                       // o cartão arrastado sai da página ao redesenhar e o «dragend» pode não chegar: não deixar os cliques bloqueados
        if (!id) return;
        if (c.dataset.prazo) soltarNoPrazo(id, c.dataset.prazo);
        else if (c.dataset.plano) soltarNoPlano(id, c.dataset.plano);
    });

    I18N.aoMudar(() => { montarBarra(); desenhar(); if (!modal.hidden && aEditar) { const id = aEditar.id; fecharModal(); abrirModal({ id }); } });
    montarBarra();
    carregar();
    carregarGoogle();
    // regresso do Google: #google=ok ou #google=erro&motivo=...
    (() => {
        const m = /^#google=(ok|erro)(?:&motivo=([A-Z_]+))?$/.exec(location.hash);
        if (!m) return;
        history.replaceState(null, '', location.pathname + location.search);
        if (m[1] === 'ok') aviso(t('tk_g_ok'));
        else aviso(t({ ESTADO: 'tk_g_err_estado', RECUSADO: 'tk_g_err_recusado', SEM_REFRESH: 'tk_g_err_refresh', CONFIG: 'tk_g_err_config', CREDENCIAIS: 'tk_g_err_credenciais', REDIRECT: 'tk_g_err_redirect', CODIGO: 'tk_g_err_codigo' }[m[2]] || 'tk_g_err'), true);
    })();
})();

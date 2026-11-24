/* leads.js: gestão de leads e pipeline comercial.
   Quadro por estados (arrastar e largar) ou lista, filtros, e a ficha do lead com estado, responsável,
   tarefas de acompanhamento, registo de interações e linha do tempo. Os textos vêm de i18n.js. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);        // o papel "leitura" só vê

    // Ordem das colunas do quadro: do primeiro contacto ao fecho. Os três últimos estados ficam ocultos até se pedir.
    const COLUNAS = ['novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada', 'proposta_aceite', 'negocio_fechado',
                     'proposta_recusada', 'oportunidade_perdida', 'nao_contactar'];
    const FECHADOS = ['proposta_recusada', 'oportunidade_perdida', 'nao_contactar'];
    const SERVICOS = ['sistemas', 'website', 'marketing_digital', 'redes_sociais', 'automacao_ia', 'design_grafico'];
    const CLASSES = [['hot', 'badge_hot'], ['warm', 'badge_warm'], ['cold', 'badge_cold']];
    const CANAIS = ['email', 'linkedin', 'instagram', 'whatsapp', 'telefone', 'reuniao', 'nota'];
    const TIPOS_TAREFA = ['follow_up', 'reuniao', 'proposta', 'outro'];

    // ---------- pequenos utilitários ----------
    const lembrar = (k, valor) => { try { localStorage.setItem('ns_leads_' + k, valor); } catch { /* sem armazenamento: não faz mal */ } };
    const lido = (k, padrao) => { try { return localStorage.getItem('ns_leads_' + k) || padrao; } catch { return padrao; } };
    const dois = (n) => String(n).padStart(2, '0');
    const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };
    const diasAte = (prazo) => Math.round((Date.parse(`${prazo}T12:00:00`) - Date.parse(`${hojeLocal()}T12:00:00`)) / 86400000);
    const dataCurta = (iso) => new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso)
        .toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const dataHora = (iso) => new Date(iso).toLocaleString(I18N.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const nomePais = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
    const ha = (iso) => {
        const n = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 86400000));
        return n === 0 ? t('ago_today') : n === 1 ? t('ago_one') : t('ago_n').replace('{n}', n);
    };
    const prazoInfo = (prazo) => {
        const n = diasAte(prazo);
        if (n < 0) return { txt: t('tk_overdue').replace('{n}', -n), classe: 'atrasada' };
        if (n === 0) return { txt: t('tk_today'), classe: 'hoje' };
        if (n === 1) return { txt: t('tk_tomorrow'), classe: '' };
        return { txt: n <= 6 ? t('tk_in').replace('{n}', n) : dataCurta(prazo), classe: '' };
    };
    const etiqueta = (l) => {
        if (l.pontuacao == null) return `<span class="badge novo">${esc(t('badge_new'))}</span>`;
        const c = l.classificacao === 'hot' ? ['quente', 'badge_hot'] : l.classificacao === 'warm' ? ['morno', 'badge_warm'] : ['frio', 'badge_cold'];
        return `<span class="badge ${c[0]}">${esc(t(c[1]))} · ${esc(l.pontuacao)}</span>`;
    };
    const iniciais = (nome) => String(nome || '?').trim().charAt(0).toUpperCase();
    const pick = (o) => (o && typeof o === 'object' ? (o[I18N.idioma()] || o.pt || o.en || o.es || '') : String(o || ''));
    const linkSeguro = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

    // ---------- estado da página ----------
    const FILTROS_VAZIOS = { q: '', estado: '', responsavel: '', servico: '', classificacao: '', pais: '', setor: '', tarefas: '', contacto: '', ordem: 'pontuacao' };
    const filtros = { ...FILTROS_VAZIOS };
    try { const g = JSON.parse(localStorage.getItem('ns_leads_filtros') || '{}'); for (const k of ['pais', 'setor', 'tarefas', 'contacto', 'ordem']) if (typeof g[k] === 'string' && g[k]) filtros[k] = g[k]; } catch { /* sem memória: usa os valores por defeito */ }
    const guardarFiltros = () => { try { localStorage.setItem('ns_leads_filtros', JSON.stringify({ pais: filtros.pais, setor: filtros.setor, tarefas: filtros.tarefas, contacto: filtros.contacto, ordem: filtros.ordem })); } catch { /* ignora */ } };
    const rotuloSetor = (s) => (t('sector_' + s) !== 'sector_' + s ? t('sector_' + s) : s);
    let vista = lido('vista', 'quadro') === 'lista' ? 'lista' : 'quadro';
    let mostrarFechados = false;
    let dados = { leads: [], equipa: [], limite: 600 };
    let carregado = false, falhou = false, pedido = 0;

    // ---------- avisos curtos ----------
    let temporizador = null;
    function aviso(texto, erro = false) {
        $('leads-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="status">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('leads-aviso').innerHTML = ''; }, 4500);
    }

    // ---------- filtros ----------
    const opcoes = (lista, atual) => lista.map(([v, txt]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(txt)}</option>`).join('');
    function montarFiltros() {
        $('lf-q').placeholder = t('f_search_ph');
        $('lf-estado').innerHTML = opcoes([['', t('f_all')], ...COLUNAS.map((e) => [e, NS.estado(e)])], filtros.estado);
        $('lf-responsavel').innerHTML = opcoes([['', t('lf_any_owner')], ['nenhum', t('lf_no_owner')], ...dados.equipa.map((u) => [u.id, u.nome])], filtros.responsavel);
        $('lf-servico').innerHTML = opcoes([['', t('f_all')], ...SERVICOS.map((s) => [s, NS.servico(s)])], filtros.servico);
        $('lf-classificacao').innerHTML = opcoes([['', t('f_all')], ...CLASSES.map(([c, k]) => [c, t(k)])], filtros.classificacao);
        const fac = dados.facetas || { paises: [], setores: [] };
        $('lf-pais').innerHTML = opcoes([['', t('f_all')], ...fac.paises.map((c) => [c, nomePais(c)])], filtros.pais);
        $('lf-setor').innerHTML = opcoes([['', t('f_all')], ...fac.setores.map((s) => [s, rotuloSetor(s)])], filtros.setor);
        $('lf-tarefas').innerHTML = opcoes([['', t('f_all')], ['atrasadas', t('lt_overdue')], ['hoje', t('lt_today')], ['semana', t('lt_week')], ['com', t('lt_with')], ['sem', t('lt_none')]], filtros.tarefas);
        $('lf-contacto').innerHTML = opcoes([['', t('f_all')], ['nunca', t('lc_never')], ['ate7', t('lc_7')], ['mais7', t('lc_gt7')], ['mais30', t('lc_gt30')]], filtros.contacto);
        $('lf-ordem').innerHTML = opcoes([['pontuacao', t('ls_score')], ['recente', t('ls_recent')], ['contacto_recente', t('ls_contact_recent')], ['contacto_antigo', t('ls_contact_old')], ['proxima_tarefa', t('ls_task')], ['nome', t('ls_name')]], filtros.ordem);
        $('lf-vista').innerHTML = [['quadro', 'lv_board'], ['lista', 'lv_list']].map(([v, k]) =>
            `<button type="button" data-vista="${v}" aria-pressed="${v === vista}" class="${v === vista ? 'on' : ''}">${esc(t(k))}</button>`).join('');
        $('lf-vista').setAttribute('aria-label', t('lv_view'));
    }

    // ---------- carregar ----------
    async function carregar() {
        const n = ++pedido;                                   // se o utilizador mudar de filtro entretanto, a resposta antiga é ignorada
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
        try {
            const r = await api('/api/pipeline/leads' + (qs.toString() ? '?' + qs : ''));
            if (n !== pedido) return;
            dados = r; falhou = false;
        } catch { if (n !== pedido) return; falhou = true; }
        carregado = true;
        montarFiltros();
        desenhar();
    }

    // ---------- quadro e lista ----------
    const visiveis = () => dados.leads.filter((l) => mostrarFechados || !FECHADOS.includes(l.estado) || filtros.estado === l.estado);

    function cartao(l) {
        const e = l.empresa || {};
        const detalhes = [l.servico_interesse ? NS.servico(l.servico_interesse) : null, e.pais ? nomePais(e.pais) : null].filter(Boolean).join(' · ');
        const tarefa = l.proxima_tarefa ? (() => { const p = prazoInfo(l.proxima_tarefa.prazo); return `<span class="chip ${p.classe}" title="${esc(l.proxima_tarefa.titulo)}">${esc(p.txt)}</span>`; })() : `<span class="chip vazio-chip">${esc(t('lp_no_task'))}</span>`;
        const ultimo = l.ultima_interaccao ? esc(t('lp_last').replace('{when}', ha(l.ultima_interaccao.ocorrida_em))) : esc(t('lp_never'));
        return `<article class="lead-card" tabindex="0" role="button" ${podeEditar ? 'draggable="true"' : ''} data-lead="${esc(l.id)}" aria-label="${esc(e.nome || t('unnamed'))}">
            <div class="lead-top"><b>${esc(e.nome || t('unnamed'))}</b>${l.responsavel ? `<span class="avatar-mini" title="${esc(l.responsavel.nome || '')}">${esc(iniciais(l.responsavel.nome))}</span>` : ''}</div>
            ${detalhes ? `<span class="lead-sub">${esc(detalhes)}</span>` : ''}
            <div class="lead-meta">${etiqueta(l)}${tarefa}</div>
            <span class="lead-ultimo">${ultimo}</span></article>`;
    }

    function desenharQuadro(leads) {
        const colunas = filtros.estado ? [filtros.estado] : COLUNAS.filter((c) => mostrarFechados || !FECHADOS.includes(c));
        return `<div class="quadro">${colunas.map((c) => {
            const itens = leads.filter((l) => l.estado === c);
            return `<section class="coluna" data-estado="${c}" aria-label="${esc(NS.estado(c))}">
                <header><b>${esc(NS.estado(c))}</b><span>${itens.length}</span></header>
                <div class="coluna-corpo">${itens.length ? itens.map(cartao).join('') : `<p class="coluna-vazia">${esc(t('lp_col_empty'))}</p>`}</div></section>`;
        }).join('')}</div>`;
    }

    function desenharLista(leads) {
        const linhas = leads.map((l) => {
            const e = l.empresa || {};
            const p = l.proxima_tarefa ? prazoInfo(l.proxima_tarefa.prazo) : null;
            return `<tr tabindex="0" data-lead="${esc(l.id)}">
                <td><b>${esc(e.nome || t('unnamed'))}</b><span class="lead-sub">${esc(e.pais ? nomePais(e.pais) : '')}</span></td>
                <td>${esc(NS.estado(l.estado))}</td>
                <td>${esc(l.servico_interesse ? NS.servico(l.servico_interesse) : '—')}</td>
                <td>${etiqueta(l)}</td>
                <td>${esc(l.responsavel?.nome || '—')}</td>
                <td>${p ? `<span class="chip ${p.classe}">${esc(p.txt)}</span> <span class="lead-sub">${esc(l.proxima_tarefa.titulo)}</span>` : '—'}</td>
                <td>${l.ultima_interaccao ? esc(ha(l.ultima_interaccao.ocorrida_em)) : '—'}</td></tr>`;
        }).join('');
        return `<div class="tabela-rolar"><table class="tabela"><thead><tr>
            ${['lc_company', 'lf_stage', 'lc_service', 'lc_score', 'lf_owner', 'lc_task', 'lc_last'].map((k) => `<th scope="col">${esc(t(k))}</th>`).join('')}
            </tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    function desenhar() {
        const corpo = $('leads-vista');
        $('lf-fechados').checked = mostrarFechados;
        if (!carregado) return;
        if (falhou) { $('leads-total').textContent = ''; corpo.innerHTML = `<div class="erro-ui">${esc(t('err_load'))}</div>`; return; }
        const leads = visiveis();
        const ocultos = dados.leads.length - leads.length;
        $('leads-total').textContent = leads.length === 1 ? t('lp_total_one') : t('lp_total').replace('{n}', leads.length);
        const notas = [ocultos > 0 ? t('lp_closed_hidden').replace('{n}', ocultos) : null, dados.leads.length >= dados.limite ? t('lp_truncated').replace('{n}', dados.limite) : null].filter(Boolean);
        const nota = notas.length ? `<p class="nota leads-nota">${esc(notas.join(' · '))}</p>` : '';
        if (!leads.length) { corpo.innerHTML = `${nota}<div class="vazio"><b>${esc(t('lp_empty_t'))}</b><span>${esc(t('lp_empty_s'))}</span></div>`; return; }
        corpo.innerHTML = nota + (vista === 'lista' ? desenharLista(leads) : desenharQuadro(leads));
    }

    // ---------- dia e hora da reunião ----------
    // Ao passar para «reunião agendada» pergunta-se quando é; devolve { reuniao_data, reuniao_hora } ou null se a pessoa cancelar.
    function pedirReuniao() {
        return new Promise((resolver) => {
            const fundo = document.createElement('div'); fundo.className = 'ng-fundo';
            const caixa = document.createElement('div'); caixa.className = 'ng-modal'; caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-modal', 'true'); caixa.setAttribute('aria-labelledby', 'reun-t'); caixa.tabIndex = -1;
            caixa.innerHTML = `<form class="g-form" novalidate><header class="ng-cab"><h2 id="reun-t">${esc(t('lp_meet_t'))}</h2></header><p class="nota">${esc(t('lp_meet_s'))}</p><div id="reun-erro"></div>
                <div class="g-linha"><label class="campo"><span>${esc(t('lp_meet_date'))}</span><input type="date" id="reun-data" min="${hojeLocal()}" value="${hojeLocal()}" required></label>
                <label class="campo"><span>${esc(t('lp_meet_time'))}</span><input type="time" id="reun-hora" value="10:00"></label></div>
                <div class="ng-botoes"><button type="submit" class="btn">${esc(t('lp_meet_ok'))}</button><button type="button" class="btn btn-secundario" data-cancelar>${esc(t('lp_meet_cancel'))}</button></div></form>`;
            document.body.append(fundo, caixa); document.body.classList.add('modal-aberto');
            const fechar = (valor) => { document.removeEventListener('keydown', tecla, true); fundo.remove(); caixa.remove(); document.body.classList.remove('modal-aberto'); resolver(valor); };
            const tecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(null); } };
            document.addEventListener('keydown', tecla, true);
            fundo.addEventListener('click', () => fechar(null));
            caixa.addEventListener('click', (ev) => { if (ev.target.closest('[data-cancelar]')) fechar(null); });
            caixa.querySelector('form').addEventListener('submit', (ev) => {
                ev.preventDefault();
                const data = caixa.querySelector('#reun-data').value;
                if (!data || data < hojeLocal()) { caixa.querySelector('#reun-erro').innerHTML = `<div class="erro-ui" role="alert">${esc(t('lp_meet_err'))}</div>`; return; }
                fechar({ reuniao_data: data, reuniao_hora: caixa.querySelector('#reun-hora').value || null });
            });
            caixa.querySelector('#reun-data').focus();
        });
    }

    // ---------- mudar estado ----------
    async function mover(id, estado) {
        const lead = dados.leads.find((l) => l.id === id);
        if (!lead || lead.estado === estado) return;
        const quando = estado === 'reuniao_agendada' ? await pedirReuniao() : {};
        if (!quando) return;                                              // cancelou: o cartão fica onde estava
        const anterior = lead.estado;
        lead.estado = estado; desenhar();                                 // o cartão muda logo; se o servidor recusar, volta atrás
        try {
            await api(`/api/pipeline/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ estado, ...quando }) });
            aviso(t('lp_moved').replace('{estado}', NS.estado(estado)));
            carregar();                                                    // as tarefas automáticas podem ter mudado
        } catch { lead.estado = anterior; desenhar(); aviso(t('lp_err_save'), true); }
    }

    // ---------- eventos da página ----------
    let escrever = null;
    $('lf-q').addEventListener('input', (ev) => { clearTimeout(escrever); escrever = setTimeout(() => { filtros.q = ev.target.value.trim(); carregar(); }, 300); });
    for (const [id, chave] of [['lf-estado', 'estado'], ['lf-responsavel', 'responsavel'], ['lf-servico', 'servico'], ['lf-classificacao', 'classificacao'], ['lf-pais', 'pais'], ['lf-setor', 'setor'], ['lf-tarefas', 'tarefas'], ['lf-contacto', 'contacto'], ['lf-ordem', 'ordem']]) {
        $(id).addEventListener('change', (ev) => { filtros[chave] = ev.target.value; guardarFiltros(); carregar(); });
    }
    $('form-leads').addEventListener('submit', (ev) => ev.preventDefault());
    $('lf-fechados').addEventListener('change', (ev) => { mostrarFechados = ev.target.checked; desenhar(); });
    $('lf-limpar').addEventListener('click', () => {
        Object.assign(filtros, FILTROS_VAZIOS); guardarFiltros();
        $('lf-q').value = ''; mostrarFechados = false; carregar();
    });
    $('lf-vista').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-vista]'); if (!b) return;
        vista = b.dataset.vista; lembrar('vista', vista); montarFiltros(); desenhar();
    });

    const corpoVista = $('leads-vista');
    let arrastou = false;
    corpoVista.addEventListener('click', (ev) => { const a = ev.target.closest('[data-lead]'); if (a && !arrastou) abrirFicha(a.dataset.lead, a); });
    corpoVista.addEventListener('keydown', (ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[data-lead]')) { ev.preventDefault(); abrirFicha(ev.target.dataset.lead, ev.target); }
    });
    // arrastar e largar (para quem edita); quem usa teclado muda o estado na ficha do lead
    corpoVista.addEventListener('dragstart', (ev) => {
        const c = ev.target.closest('.lead-card'); if (!c || !podeEditar) return;
        arrastou = true; ev.dataTransfer.setData('text/plain', c.dataset.lead); ev.dataTransfer.effectAllowed = 'move'; c.classList.add('arrastar');
    });
    corpoVista.addEventListener('dragend', (ev) => { ev.target.classList?.remove('arrastar'); document.querySelectorAll('.coluna.alvo').forEach((c) => c.classList.remove('alvo')); setTimeout(() => { arrastou = false; }, 0); });
    corpoVista.addEventListener('dragover', (ev) => { const c = ev.target.closest('.coluna'); if (c && podeEditar) { ev.preventDefault(); c.classList.add('alvo'); } });
    corpoVista.addEventListener('dragleave', (ev) => { const c = ev.target.closest('.coluna'); if (c && !c.contains(ev.relatedTarget)) c.classList.remove('alvo'); });
    corpoVista.addEventListener('drop', (ev) => {
        const c = ev.target.closest('.coluna'); if (!c || !podeEditar) return;
        ev.preventDefault(); c.classList.remove('alvo');
        const id = ev.dataTransfer.getData('text/plain');
        setTimeout(() => { arrastou = false; }, 100);                       // o cartão arrastado sai da página ao redesenhar e o «dragend» pode não chegar: não deixar os cliques bloqueados
        if (id) mover(id, c.dataset.estado);
    });

    // ============================ FICHA DO LEAD ============================
    const gaveta = $('gaveta'), fundo = $('gaveta-fundo');
    let ficha = null, fichaId = null, focoAnterior = null;

    function fecharFicha() {
        gaveta.hidden = true; fundo.hidden = true; gaveta.innerHTML = '';
        document.body.classList.remove('modal-aberto');
        document.removeEventListener('keydown', teclaGaveta, true);
        ficha = null; fichaId = null;
        if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
    }
    function teclaGaveta(ev) {
        if (ev.key === 'Escape' && !document.querySelector('.contact-fundo, .contact-menu')) return fecharFicha();
        if (ev.key !== 'Tab') return;
        const f = [...gaveta.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const primeiro = f[0], ultimo = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
    }

    async function abrirFicha(id, origem) {
        focoAnterior = origem || document.activeElement;
        if (fichaId !== id) { respostaWa = null; textoWa = ''; baseWa = null; iaWa = null; }
        fichaId = id;
        gaveta.hidden = false; fundo.hidden = false;
        document.body.classList.add('modal-aberto');
        document.addEventListener('keydown', teclaGaveta, true);
        gaveta.innerHTML = `<div class="gaveta-corpo"><p class="nota">${esc(t('loading'))}</p></div>`;
        gaveta.focus();
        try { ficha = await api(`/api/pipeline/leads/${encodeURIComponent(id)}`); await carregarRespostaWa(id, ficha.empresas?.id); if (fichaId === id) desenharFicha(); }
        catch { if (fichaId === id) gaveta.innerHTML = `<div class="gaveta-corpo"><div class="erro-ui">${esc(t('err_load'))}</div><button type="button" class="btn btn-secundario" data-g-fechar>${esc(t('d_close'))}</button></div>`; }
    }
    // ---------- respostas assistidas no WhatsApp (dentro das 24 horas) ----------
    let respostaWa = null, textoWa = '', baseWa = null, iaWa = null;
    async function carregarRespostaWa(id, empresaId) {
        respostaWa = null;
        if (!empresaId || !(ficha?.interaccoes || []).some((i) => i.canal === 'whatsapp' && i.direcao === 'entrada')) return;
        try { const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresaId)}/whatsapp/resposta`); if (fichaId === id) respostaWa = r; } catch { respostaWa = null; }
    }
    const duracao = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
    function painelRespostaWa() {
        const r = respostaWa;
        if (!r || !r.disponivel) return '';
        const aberta = r.janela.aberta, livre = podeEditar && aberta && !r.bloqueios.length && r.api.configurado;
        const bolhas = r.conversa.map((m) => `<div class="wr-msg ${m.direcao === 'entrada' ? 'in' : 'out'}"><p>${esc(m.conteudo)}</p><span class="nota">${esc(dataHora(m.ocorrida_em))}</span></div>`).join('');
        const aviso = [
            aberta ? `<span class="chip chip-ok">${esc(t('wr_open').replace('{t}', duracao(r.janela.minutos_restantes)))}</span>` : `<span class="chip atrasada">${esc(t('wr_closed'))}</span>`,
            ...r.bloqueios.map((b) => `<span class="chip atrasada">${esc(b.codigo === 'limite_diario' ? t('wr_limit').replace('{u}', b.usados).replace('{l}', b.limite) : t('blk_' + b.codigo))}</span>`),
            r.api.configurado ? '' : `<span class="chip atrasada">${esc(t('wr_no_api'))}</span>`
        ].join('');
        const form = livre ? `<div class="g-form wr-form"><button type="button" class="btn btn-secundario" id="wr-ia">${esc(t('wr_suggest'))}</button>
                <label class="campo"><span>${esc(t('wr_text'))}</span><textarea id="wr-texto" rows="5" maxlength="1000">${esc(textoWa)}</textarea></label>
                <p class="nota" id="wr-base">${baseWa ? esc(t('wr_based') + ' ' + baseWa) : ''}</p>
                <div id="wr-erro"></div>
                <button type="button" class="btn" id="wr-enviar">${esc(t('wr_send'))}</button></div>` : (aberta ? '' : `<p class="nota">${esc(t('wr_closed_hint'))}</p>`);
        return `<section class="g-sec"><h3>${esc(t('wr_title'))}</h3><div class="wr-estado">${aviso}</div><div class="wr-conversa">${bolhas}</div>${form}</section>`;
    }
    function ligarRespostaWa(id) {
        const erroWa = (txt) => { const e = $('wr-erro'); if (e) e.innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };
        const empresaId = ficha.empresas?.id;
        $('wr-texto')?.addEventListener('input', (ev) => { textoWa = ev.target.value; });
        $('wr-ia')?.addEventListener('click', async (ev) => {
            const b = ev.currentTarget; b.disabled = true; const antes = b.textContent; b.textContent = t('wr_writing'); erroWa('');
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresaId)}/whatsapp/resposta/rascunho`, { method: 'POST', body: JSON.stringify({}) });
                textoWa = r.texto; baseWa = r.base; iaWa = { gerado: true, modelo: r.modeloIA };
                if (fichaId === id) desenharFicha();
            } catch (e) { b.disabled = false; b.textContent = antes; erroWa(e.codigo === 'WA_JANELA' ? t('wr_closed_hint') : t('wr_err_draft')); }
        });
        $('wr-enviar')?.addEventListener('click', async (ev) => {
            const texto = ($('wr-texto')?.value || '').trim();
            if (!texto) { erroWa(t('wr_err_empty')); return; }
            if (!window.confirm(t('wr_confirm').replace('{empresa}', ficha.empresas?.nome || ''))) return;
            const b = ev.currentTarget; b.disabled = true; erroWa('');
            try {
                await api(`/api/outreach/empresas/${encodeURIComponent(empresaId)}/whatsapp/resposta/enviar`, { method: 'POST', body: JSON.stringify({ texto, ia: iaWa || undefined }) });
                textoWa = ''; baseWa = null; iaWa = null; aviso(t('wr_sent'));
                await recarregarFicha();
            } catch (e) { b.disabled = false; erroWa(e.codigo === 'WA_JANELA' ? t('wr_closed_hint') : e.codigo === 'BLOQUEADO' ? t('wr_err_blocked') : t('wr_err_send')); }
        });
    }

    async function recarregarFicha() {
        if (!fichaId) return;
        try { const id = fichaId; const nova = await api(`/api/pipeline/leads/${encodeURIComponent(id)}`); if (fichaId === id) { ficha = nova; await carregarRespostaWa(id, nova.empresas?.id); if (fichaId === id) desenharFicha(); } } catch { /* mantém a ficha anterior */ }
        carregar();
    }
    const erroFicha = (txt) => { const e = $('g-erro'); if (e) e.innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };

    // o que mostrar a seguir ao canal: o assunto (email) ou, no LinkedIn, se foi o pedido de ligação ou a mensagem
    const rotuloInteraccao = (i) => i.assunto || (i.resultado === 'convite_enviado' ? t('li_kind_convite') : i.resultado === 'mensagem_enviada' ? t('li_kind_mensagem') : i.resultado === 'dm_enviada' ? t('ig_kind_dm') : /^wa_/.test(i.resultado || '') ? t('ws_st_' + i.resultado.slice(3)) : '');

    function linhaTempo() {
        const equipa = ficha.equipa;
        const nomeDe = (id) => equipa.find((u) => u.id === id)?.nome || '';
        const eventos = [
            ...ficha.interaccoes.map((i) => ({ quando: i.ocorrida_em, i })),
            ...ficha.historico.map((h) => ({ quando: h.criado_em, h }))
        ].sort((a, b) => new Date(b.quando) - new Date(a.quando));
        if (!eventos.length) return `<p class="nota">${esc(t('d_timeline_empty'))}</p>`;
        return `<ol class="tl">${eventos.map(({ quando, i, h }) => {
            if (h) {
                const txt = h.campo === 'estado'
                    ? (h.valor_antigo ? t('tl_state').replace('{a}', NS.estado(h.valor_antigo)).replace('{b}', NS.estado(h.valor_novo)) : t('tl_state_new').replace('{b}', NS.estado(h.valor_novo)))
                    : (h.valor_novo ? t('tl_owner').replace('{n}', nomeDe(h.valor_novo) || '—') : t('tl_owner_none'));
                const origem = t('origem_' + h.origem); const orig = origem === 'origem_' + h.origem ? h.origem : origem;
                return `<li class="tl-estado"><span class="tl-ponto" aria-hidden="true"></span><div><b>${esc(txt)}</b><span class="nota">${esc(dataHora(quando))} · ${esc(orig)}</span></div></li>`;
            }
            const longo = (i.conteudo || '').length > 220;
            const dir = i.direcao === 'entrada' ? 'entrada' : i.direcao === 'interna' ? 'interna' : 'saida';
            const quem = i.utilizador_id ? nomeDe(i.utilizador_id) : '';
            return `<li class="tl-${dir}"><span class="tl-ponto" aria-hidden="true"></span><div>
                <b>${esc(t('ch_' + i.canal))} · ${esc(t('dir_' + dir))}${rotuloInteraccao(i) ? ` — ${esc(rotuloInteraccao(i))}` : ''}</b>
                ${i.conteudo ? (longo ? `<details><summary>${esc(i.conteudo.slice(0, 220))}…</summary><p class="tl-texto">${esc(i.conteudo)}</p></details>` : `<p class="tl-texto">${esc(i.conteudo)}</p>`) : ''}
                <span class="nota">${esc(dataHora(quando))}${quem ? ' · ' + esc(t('d_by').replace('{n}', quem)) : ''}${i.gerado_por_ia ? ' · ' + esc(t('d_ai')) : ''}</span></div></li>`;
        }).join('')}</ol>`;
    }

    let editarTarefaId = null;
    function listaTarefas() {
        const equipa = ficha.equipa;
        const abertas = ficha.tarefas.filter((x) => !x.concluida_em).sort((a, b) => a.prazo.localeCompare(b.prazo));
        const feitas = ficha.tarefas.filter((x) => x.concluida_em).slice(-5).reverse();
        const item = (x) => {
            if (podeEditar && editarTarefaId === x.id && !x.concluida_em) {
                return `<li class="tarefa editando" data-tarefa="${esc(x.id)}"><form class="g-form g-editar" data-g-form-editar novalidate>
                    <label class="campo"><span>${esc(t('d_task_title'))}</span><input type="text" data-e-titulo maxlength="120" required value="${esc(x.titulo)}"></label>
                    <div class="g-linha3"><label class="campo"><span>${esc(t('d_task_date'))}</span><input type="date" data-e-prazo required value="${esc(x.prazo)}"></label>
                    <label class="campo"><span>${esc(t('d_task_type'))}</span><select data-e-tipo>${TIPOS_TAREFA.map((k) => `<option value="${k}" ${k === x.tipo ? 'selected' : ''}>${esc(t('tt_' + k))}</option>`).join('')}</select></label>
                    <label class="campo"><span>${esc(t('d_task_owner'))}</span><select data-e-resp>${equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === x.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label></div>
                    <div class="g-linha"><button type="submit" class="btn btn-secundario">${esc(t('d_task_update'))}</button><button type="button" class="btn-link" data-g-cancelar>${esc(t('d_task_cancel'))}</button></div></form></li>`;
            }
            const feita = !!x.concluida_em, p = feita ? null : prazoInfo(x.prazo);
            const resp = equipa.find((u) => u.id === x.responsavel_id)?.nome;
            return `<li class="tarefa ${feita ? 'feita' : ''}" data-tarefa="${esc(x.id)}">
                <label class="tarefa-check"><input type="checkbox" data-g-concluir ${feita ? 'checked' : ''} ${podeEditar ? '' : 'disabled'} aria-label="${esc(t('d_task_done'))}: ${esc(x.titulo)}"></label>
                <div class="tarefa-info"><b>${esc(x.titulo)}</b>
                    <span class="nota">${esc(t('tt_' + x.tipo))}${resp ? ' · ' + esc(resp) : ''}${x.origem === 'automatica' ? ' · ' + esc(t('d_task_auto')) : ''}</span></div>
                ${p ? `<span class="chip ${p.classe}">${esc(p.txt)}</span>` : `<span class="nota">${esc(dataCurta(x.concluida_em))}</span>`}
                ${podeEditar && !feita ? `<button type="button" class="tarefa-x" data-g-editar aria-label="${esc(t('d_task_edit'))}: ${esc(x.titulo)}">✎</button>` : ''}
                ${podeEditar ? `<button type="button" class="tarefa-x" data-g-apagar aria-label="${esc(t('d_task_del'))}: ${esc(x.titulo)}">×</button>` : ''}</li>`;
        };
        const itens = [...abertas, ...feitas];
        return itens.length ? `<ul class="tarefas">${itens.map(item).join('')}</ul>` : `<p class="nota">${esc(t('d_tasks_empty'))}</p>`;
    }

    function desenharFicha() {
        if (!ficha) return;
        const rascunho = { tarefa: $('g-tarefa-titulo')?.value || '', log: $('g-log-texto')?.value || '' };      // não perder o que se estava a escrever
        const f = ficha, e = f.empresas || {}, a = f.analise || {};
        const equipa = f.equipa;
        const detalhes = [f.servico_interesse ? NS.servico(f.servico_interesse) : null, e.pais ? nomePais(e.pais) : null, e.sector ? (t('sector_' + e.sector) !== 'sector_' + e.sector ? t('sector_' + e.sector) : e.sector) : null].filter(Boolean).join(' · ');
        const servicoRec = a.servicos?.[0];
        const analise = (pick(a.resumo) || servicoRec || pick(a.abordagem)) ? `<section class="g-sec"><h3>${esc(t('d_summary'))}</h3>
            ${pick(a.resumo) ? `<p>${esc(pick(a.resumo))}</p>` : ''}
            ${servicoRec ? `<p><b>${esc(t('d_service_rec'))}:</b> ${esc(NS.servico(servicoRec.servico))}${pick(servicoRec.motivo) ? ` — ${esc(pick(servicoRec.motivo))}` : ''}</p>` : ''}
            ${pick(a.abordagem) ? `<p><b>${esc(t('d_approach'))}:</b> ${esc(pick(a.abordagem))}</p>` : ''}</section>` : '';
        const pessoas = f.decisores?.length ? `<section class="g-sec"><h3>${esc(t('d_people'))}</h3><ul class="g-pessoas">${f.decisores.map((d) =>
            `<li><b>${esc(d.nome)}</b>${d.cargo ? ` <span class="nota">${esc(d.cargo)}</span>` : ''}${linkSeguro(d.linkedin_url) ? ` <a href="${esc(linkSeguro(d.linkedin_url))}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ''}</li>`).join('')}</ul></section>` : '';
        const dis = podeEditar ? '' : 'disabled';

        gaveta.innerHTML = `<div class="gaveta-corpo">
            <header class="gaveta-cab"><div><h2 id="gaveta-titulo">${esc(e.nome || t('unnamed'))}</h2><p class="nota">${esc(detalhes)}</p></div>
                <div class="gaveta-acoes">${podeEditar && !e.nao_contactar ? `<button type="button" class="btn-contactar" id="g-contactar">${esc(t('d_contact'))}</button>` : ''}
                <button type="button" class="contact-x" data-g-fechar aria-label="${esc(t('d_close'))}">×</button></div></header>
            <div id="g-erro"></div>
            <div class="g-linha"><label class="campo"><span>${esc(t('lf_stage'))}</span><select id="g-estado" ${dis}>${COLUNAS.map((c) => `<option value="${c}" ${c === f.estado ? 'selected' : ''}>${esc(NS.estado(c))}</option>`).join('')}</select></label>
                <label class="campo"><span>${esc(t('lf_owner'))}</span><select id="g-resp" ${dis}><option value="">${esc(t('lf_no_owner'))}</option>${equipa.map((u) => `<option value="${esc(u.id)}" ${u.id === f.responsavel_id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label></div>
            <p>${etiqueta(f)}</p>
            ${painelRespostaWa()}${analise}${pessoas}
            <section class="g-sec"><h3>${esc(t('d_tasks'))}</h3>${listaTarefas()}
                ${podeEditar ? `<form id="g-form-tarefa" class="g-form" novalidate><h4>${esc(t('d_task_add'))}</h4>
                    <label class="campo"><span>${esc(t('d_task_title'))}</span><input type="text" id="g-tarefa-titulo" maxlength="120" required></label>
                    <div class="g-linha3"><label class="campo"><span>${esc(t('d_task_date'))}</span><input type="date" id="g-tarefa-prazo" min="${hojeLocal()}" required></label>
                    <label class="campo"><span>${esc(t('d_task_type'))}</span><select id="g-tarefa-tipo">${TIPOS_TAREFA.map((x) => `<option value="${x}">${esc(t('tt_' + x))}</option>`).join('')}</select></label>
                    <label class="campo"><span>${esc(t('d_task_owner'))}</span><select id="g-tarefa-resp">${equipa.map((u) => `<option value="${esc(u.id)}" ${utilizador && u.id === utilizador.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></label></div>
                    <button type="submit" class="btn btn-secundario">${esc(t('d_task_save'))}</button></form>` : ''}</section>
            ${podeEditar ? `<section class="g-sec"><h3>${esc(t('d_log'))}</h3><p class="nota">${esc(t('d_log_hint'))}</p>
                <form id="g-form-log" class="g-form" novalidate>
                    <div class="g-linha3"><label class="campo"><span>${esc(t('d_log_channel'))}</span><select id="g-log-canal">${CANAIS.map((c) => `<option value="${c}">${esc(t('ch_' + c))}</option>`).join('')}</select></label>
                    <label class="campo"><span>${esc(t('d_log_dir'))}</span><select id="g-log-dir"><option value="entrada">${esc(t('dir_entrada'))}</option><option value="saida">${esc(t('dir_saida'))}</option><option value="interna">${esc(t('dir_interna'))}</option></select></label>
                    <label class="campo"><span>${esc(t('d_log_date'))}</span><input type="date" id="g-log-data" max="${hojeLocal()}" value="${hojeLocal()}"></label></div>
                    <label class="campo"><span>${esc(t('d_log_text'))}</span><textarea id="g-log-texto" rows="3" maxlength="4000" required></textarea></label>
                    <button type="submit" class="btn btn-secundario">${esc(t('d_log_save'))}</button></form></section>` : ''}
            <section class="g-sec"><h3>${esc(t('d_timeline'))}</h3>${linhaTempo()}</section></div>`;

        if ($('g-tarefa-titulo')) $('g-tarefa-titulo').value = rascunho.tarefa;
        if ($('g-log-texto')) $('g-log-texto').value = rascunho.log;
        ligarFicha();
    }

    async function alterar(pedidoApi, textoSucesso) {
        erroFicha('');
        try { const r = await pedidoApi(); if (textoSucesso) aviso(textoSucesso(r)); await recarregarFicha(); return r; }
        catch { await recarregarFicha(); erroFicha(t('lp_err_save')); return null; }
    }

    function ligarFicha() {
        const id = fichaId;
        const bt = (caminho, metodo, corpo) => api(caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });
        if (!podeEditar) return;

        $('g-estado')?.addEventListener('change', async (ev) => {
            const estado = ev.target.value;
            const quando = estado === 'reuniao_agendada' ? await pedirReuniao() : {};
            if (!quando) { await recarregarFicha(); return; }                  // cancelou: o estado volta ao que estava
            alterar(() => bt(`/api/pipeline/leads/${encodeURIComponent(id)}`, 'PATCH', { estado, ...quando }), () => t('lp_moved').replace('{estado}', NS.estado(estado)));
        });
        $('g-resp')?.addEventListener('change', (ev) => alterar(() => bt(`/api/pipeline/leads/${encodeURIComponent(id)}`, 'PATCH', { responsavel_id: ev.target.value || null })));

        gaveta.querySelector('.tarefas')?.addEventListener('change', (ev) => {
            const li = ev.target.closest('[data-tarefa]');
            if (li && ev.target.matches('[data-g-concluir]')) alterar(() => bt(`/api/pipeline/tarefas/${encodeURIComponent(li.dataset.tarefa)}`, 'PATCH', { concluida: ev.target.checked }));
        });
        gaveta.querySelector('.tarefas')?.addEventListener('click', (ev) => {
            const li = ev.target.closest('[data-tarefa]');
            if (li && ev.target.closest('[data-g-apagar]')) alterar(() => bt(`/api/pipeline/tarefas/${encodeURIComponent(li.dataset.tarefa)}`, 'DELETE'));
            if (li && ev.target.closest('[data-g-editar]')) { editarTarefaId = li.dataset.tarefa; desenharFicha(); gaveta.querySelector('[data-e-titulo]')?.focus(); }
            if (li && ev.target.closest('[data-g-cancelar]')) { editarTarefaId = null; desenharFicha(); }
        });
        gaveta.querySelector('.tarefas')?.addEventListener('submit', (ev) => {
            const form = ev.target.closest('[data-g-form-editar]'); if (!form) return;
            ev.preventDefault();
            const li = form.closest('[data-tarefa]');
            const titulo = form.querySelector('[data-e-titulo]').value.trim(), prazo = form.querySelector('[data-e-prazo]').value;
            if (!titulo || !prazo) { erroFicha(t('lp_err_save')); return; }
            const corpo = { titulo, prazo, tipo: form.querySelector('[data-e-tipo]').value, responsavel_id: form.querySelector('[data-e-resp]').value || null };
            editarTarefaId = null;
            alterar(() => bt(`/api/pipeline/tarefas/${encodeURIComponent(li.dataset.tarefa)}`, 'PATCH', corpo), () => t('d_task_updated'));
        });
        $('g-form-tarefa')?.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const titulo = $('g-tarefa-titulo').value.trim(), prazo = $('g-tarefa-prazo').value;
            if (!titulo || !prazo) { erroFicha(t('lp_err_save')); return; }
            alterar(() => bt(`/api/pipeline/leads/${encodeURIComponent(id)}/tarefas`, 'POST', { titulo, prazo, tipo: $('g-tarefa-tipo').value, responsavel_id: $('g-tarefa-resp').value || null }))
                .then(() => { if ($('g-tarefa-titulo')) $('g-tarefa-titulo').value = ''; });
        });
        // nota interna só pode ser interna; os outros canais são "contactámos" ou "responderam"
        $('g-log-canal')?.addEventListener('change', (ev) => {
            const d = $('g-log-dir');
            if (ev.target.value === 'nota') d.value = 'interna'; else if (d.value === 'interna') d.value = 'entrada';
        });
        $('g-form-log')?.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const conteudo = $('g-log-texto').value.trim();
            if (!conteudo) { erroFicha(t('lp_err_save')); return; }
            const r = await alterar(() => bt(`/api/pipeline/leads/${encodeURIComponent(id)}/interaccoes`, 'POST',
                { canal: $('g-log-canal').value, direcao: $('g-log-dir').value, conteudo, data: $('g-log-data').value || undefined }),
                (res) => (res.estado === 'respondeu' && ficha?.estado === 'contactado' ? t('d_log_replied') : t('d_log_saved')));
            if (r && $('g-log-texto')) $('g-log-texto').value = '';
        });
        ligarRespostaWa(id);
        $('g-contactar')?.addEventListener('click', (ev) => {
            const e = ficha.empresas || {};
            Contact.menu(ev.currentTarget, { id: e.id, nome: e.nome }, () => recarregarFicha());
        });
    }

    gaveta.addEventListener('click', (ev) => { if (ev.target.closest('[data-g-fechar]')) fecharFicha(); });
    fundo.addEventListener('click', fecharFicha);

    // ---------- arranque ----------
    I18N.aoMudar(() => { montarFiltros(); desenhar(); if (fichaId && ficha) desenharFicha(); });
    montarFiltros();
    carregar();
    // ligação vinda de «Contactar hoje»: /leads.html#lead=<id> abre logo a ficha
    const dohash = /^#lead=([0-9a-f-]{36})$/i.exec(location.hash);
    if (dohash) { abrirFicha(dohash[1], null); history.replaceState(null, '', location.pathname + location.search); }
})();

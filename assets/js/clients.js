/* clients.js: página «Clientes». Os clientes ganhos (negócio fechado) com o estado do contrato e as datas; a ficha de cada cliente
   (contratos, propostas e sugestões de propostas futuras); e o editor do contrato de prestação de serviços (formulário + pré-visualização
   ao vivo + PDF + estado «enviado» + anexo do contrato assinado). O texto jurídico gera-se em contract-render.js a partir do formulário. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const IDIOMAS = ['pt', 'en', 'es'];
    const MODELOS = ['mensal', 'pontual', 'sucesso'];
    const MOEDAS = ['EUR', 'USD', 'GBP', 'BRL'];
    const IVAS = ['mais_iva', 'incluido', 'isento'];
    const PLANOS = ['mensal_antecipado', 'entrada_saldo', 'unico'];
    const SERVICOS = ['sistemas', 'website', 'marketing_digital', 'redes_sociais', 'automacao_ia', 'design_grafico'];
    const FILTROS = ['', 'sem_contrato', 'rascunho', 'enviado', 'assinado', 'terminar'];

    // ---------- utilitários ----------
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(',', '.').trim()) : Number(v); return Number.isFinite(n) ? n : 0; };
    const dataCurta = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
    const dinheiro = (v, moeda) => new Intl.NumberFormat(I18N.locale(), { style: 'currency', currency: moeda || 'EUR', maximumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2 }).format(Number(v) || 0);
    const nomePais = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
    const mensagemErro = (e, padrao) => (e?.codigo === 'CONFIG' ? t('cl_err_sql') : ['INVALIDO', 'VAZIO', 'NAO_ENCONTRADA', 'CLIENTE_ESTADO', 'CONTRATO_BLOQUEADO'].includes(e?.codigo) && e.message ? e.message : padrao);
    const lembrar = (k, v) => { try { localStorage.setItem('ns_clientes_' + k, v); } catch { /* sem armazenamento: não faz mal */ } };
    const lido = (k, padrao) => { try { return localStorage.getItem('ns_clientes_' + k) || padrao; } catch { return padrao; } };

    let temporizador = null;
    function aviso(texto, erro = false) {
        $('cl-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) { temporizador = setTimeout(() => { $('cl-aviso').innerHTML = ''; }, 6000); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }

    // ---------- estado ----------
    let catalogo = null, dados = { clientes: [], resumo: {}, contratos_disponivel: true };
    let filtro = FILTROS.includes(lido('filtro', '')) ? lido('filtro', '') : '', busca = '';
    let carregado = false, falhou = false, erroSql = false, pedido = 0;
    let ficha = null, ed = null;
    const marca = () => ({ nome: catalogo.empresa.nome, marca: catalogo.empresa.marca, lema: catalogo.empresa.lema, email: catalogo.empresa.email });
    const vista = (qual) => { $('cl-lista').hidden = qual !== 'lista'; $('cl-ficha').hidden = qual !== 'ficha'; $('cl-editor').hidden = qual !== 'editor'; };
    const chipEstado = (e) => `<span class="chip ${e === 'assinado' ? 'chip-ok' : e === 'enviado' ? 'hoje' : e === 'sem_contrato' ? 'vazio-chip' : ''}">${esc(t('cl_st_' + e))}</span>`;
    const fimChip = (dias) => (dias == null ? '' : `<span class="chip ${dias < 0 ? 'atrasada' : dias <= 60 ? 'hoje' : ''}">${esc(dias < 0 ? sub(t('cl_ended'), { n: -dias }) : dias === 0 ? t('cl_today') : sub(t('cl_in_days'), { n: dias }))}</span>`);

    // ======================= LISTA =======================
    async function carregar() {
        const n = ++pedido;
        try {
            if (!catalogo) catalogo = await api('/api/clientes/catalogo');
            const r = await api('/api/clientes');
            if (n !== pedido) return;
            dados = r; falhou = false; erroSql = false;
        } catch (e) { if (n !== pedido) return; falhou = true; erroSql = e?.codigo === 'CONFIG'; }
        carregado = true; montarBarra(); desenharLista();
    }

    function montarBarra() {
        const r = dados.resumo || {};
        const contagem = { '': r.total || 0, sem_contrato: r.sem_contrato || 0, rascunho: r.rascunho || 0, enviado: r.enviado || 0, assinado: r.assinado || 0, terminar: r.a_terminar || 0 };
        const rot = (f) => (f === '' ? t('cl_f_all') : f === 'terminar' ? t('cl_ending') : t('cl_st_' + f));
        $('cl-barra').innerHTML = `<div class="ng-linha"><div class="ct-tabs cl-filtros" role="group">${FILTROS.map((f) => `<button type="button" data-filtro="${f}" class="${f === filtro ? 'on' : ''}" aria-pressed="${f === filtro}">${esc(rot(f))}<b>${contagem[f]}</b></button>`).join('')}</div>
            <label class="campo ng-pesquisa"><span class="rp-so-leitor">${esc(t('cl_search_ph'))}</span><input type="search" id="cl-q" maxlength="80" autocomplete="off" placeholder="${esc(t('cl_search_ph'))}" value="${esc(busca)}"></label>
            ${podeEditar ? `<button type="button" class="btn" id="cl-anexar-geral">${esc(t('cl_c_attach'))}${(dados.por_assinar || []).length ? ` (${dados.por_assinar.length})` : ''}</button>` : ''}</div>
            ${podeEditar ? '' : `<p class="nota">${esc(t('cl_view_only'))}</p>`}`;
    }

    function desenharLista() {
        const corpo = $('cl-corpo');
        if (!carregado) return;
        if (falhou) { corpo.innerHTML = `<div class="erro-ui" role="alert">${esc(t('cl_err_load'))}</div>`; return; }
        const termo = busca.toLowerCase();
        const lista = dados.clientes.filter((c) => (filtro === '' ? true : filtro === 'terminar' ? c.dias_para_fim != null && c.dias_para_fim <= 60 : c.contrato_estado === filtro) && (!termo || String(c.empresa.nome || '').toLowerCase().includes(termo)));
        const aviso_sql = dados.contratos_disponivel === false ? `<div class="erro-ui" role="alert">${esc(t('cl_err_sql'))}</div>` : '';
        if (!dados.clientes.length) { corpo.innerHTML = aviso_sql + `<div class="ng-vazio"><b>${esc(t('cl_none_t'))}</b><span>${esc(t('cl_none_s'))}</span></div>`; return; }
        if (!lista.length) { corpo.innerHTML = aviso_sql + `<div class="vazio"><b>${esc(t('cl_none_t'))}</b></div>`; return; }
        const linhas = lista.map((c) => `<tr tabindex="0" data-cliente="${esc(c.lead_id)}"><td><b>${esc(c.empresa.nome || t('unnamed'))}</b>${c.empresa.pais ? `<span class="lead-sub">${esc(nomePais(c.empresa.pais))}</span>` : ''}</td>
            <td>${esc(dataCurta(c.cliente_desde))}</td><td class="num">${c.valor_ganho != null ? `<b>${esc(dinheiro(c.valor_ganho, c.moeda_ganho))}</b>` : '–'}</td>
            <td>${chipEstado(c.contrato_estado)}${c.contrato ? `<span class="lead-sub">${esc(c.contrato.numero)}</span>` : ''}${podeEditar && c.contrato_estado === 'enviado' ? `<button type="button" class="btn btn-secundario cl-mini" data-anexar-contrato="${esc(c.contrato.id)}">${esc(t('cl_attach_row'))}</button>` : ''}</td>
            <td>${esc(dataCurta(c.inicio))}</td><td>${esc(c.fim_previsto ? dataCurta(c.fim_previsto) : (c.contrato ? t('cl_no_end') : '–'))} ${fimChip(c.dias_para_fim)}</td></tr>`).join('');
        corpo.innerHTML = aviso_sql + `<div class="tabela-rolar"><table class="tabela cl-tabela"><thead><tr>${['client', 'since', 'won', 'contract', 'start', 'end'].map((k) => `<th scope="col"${k === 'won' ? ' class="num"' : ''}>${esc(t('cl_th_' + k))}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
    }

    $('cl-barra').addEventListener('click', (ev) => { if (ev.target.closest('#cl-anexar-geral')) { abrirAnexo({}); return; } const b = ev.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; lembrar('filtro', filtro); montarBarra(); desenharLista(); } });
    let esperar = null;
    $('cl-barra').addEventListener('input', (ev) => { if (ev.target.id === 'cl-q') { clearTimeout(esperar); esperar = setTimeout(() => { busca = ev.target.value.trim(); desenharLista(); }, 200); } });
    $('cl-corpo').addEventListener('click', (ev) => {
        const anexo = ev.target.closest('[data-anexar-contrato]'); if (anexo) { abrirAnexo({ contratoId: anexo.dataset.anexarContrato }); return; }
        const l = ev.target.closest('[data-cliente]'); if (l) abrirFicha(l.dataset.cliente);
    });
    $('cl-corpo').addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('tr[data-cliente]')) { ev.preventDefault(); abrirFicha(ev.target.dataset.cliente); } });

    // ======================= FICHA DO CLIENTE =======================
    async function abrirFicha(leadId, { silencioso = false } = {}) {
        try {
            ficha = await api(`/api/clientes/${encodeURIComponent(leadId)}`);
        } catch (e) { aviso(mensagemErro(e, t('cl_err_load')), true); return; }
        ed = null; vista('ficha'); desenharFicha();
        if (!silencioso) window.scrollTo({ top: 0 });
        history.replaceState(null, '', `${location.pathname}#cliente=${leadId}`);
    }
    function voltarLista() { ficha = null; ed = null; vista('lista'); history.replaceState(null, '', location.pathname); carregar(); }

    const nomeServico = (s) => catalogo.servicos[s]?.[I18N.idioma()]?.nome || catalogo.servicos[s]?.pt?.nome || s;
    function sugestaoHtml(s) {
        if (s.tipo === 'renovacao') return `<article class="cl-sug"><b>${esc(t('cl_sug_renew'))}</b><span>${esc(sub(t(s.dias < 0 ? 'cl_sug_renew_over' : 'cl_sug_renew_why'), { n: Math.abs(s.dias) }))}</span>
            ${podeEditar ? `<a class="btn btn-secundario" href="/assets/pages/documents.html#novo=${esc(ficha.lead_id)}&servicos=${esc(ficha.contratados.join(','))}">${esc(t('cl_sug_make'))}</a>` : ''}</article>`;
        const motivos = s.motivos.map((m) => (m.tipo === 'analise' ? t('cl_sug_why_analise') : sub(t('cl_sug_why_comp'), { s: nomeServico(m.servico) })));
        return `<article class="cl-sug"><b>${esc(nomeServico(s.servico))}</b><span>${esc(motivos.join(' '))}</span>
            ${podeEditar ? `<a class="btn btn-secundario" href="/assets/pages/documents.html#novo=${esc(ficha.lead_id)}&servicos=${esc(s.servico)}">${esc(t('cl_sug_make'))}</a>` : ''}</article>`;
    }

    function contratoLinhaHtml(c) {
        const quando = c.estado === 'assinado' ? sub(t('cl_signed_on'), { d: dataCurta(c.assinado_em) }) : c.enviado_em ? sub(t('cl_sent_on'), { d: dataCurta(c.enviado_em) }) : '';
        return `<article class="cl-contrato" data-contrato="${esc(c.id)}">
            <div class="cl-contrato-cab"><div><b>${esc(c.titulo)}</b><span class="lead-sub">${esc(c.numero)}</span></div>${chipEstado(c.estado)}</div>
            <p class="cl-datas">${esc(t('cl_th_start'))}: <b>${esc(dataCurta(c.inicio))}</b> · ${esc(t('cl_th_end'))}: <b>${esc(c.fim_previsto ? dataCurta(c.fim_previsto) : t('cl_no_end'))}</b>${c.total != null ? ` · <b>${esc(dinheiro(c.total, c.moeda))}</b>` : (c.mensal ? ` · <b>${esc(sub(t('cl_per_month'), { v: dinheiro(c.mensal, c.moeda) }))}</b>` : '')}${quando ? ` · ${esc(quando)}` : ''}</p>
            <div class="cl-contrato-btns"><button type="button" class="btn" data-abrir>${esc(t('cl_c_open'))}</button><button type="button" class="btn btn-secundario" data-pdf>${esc(t('cl_c_pdf'))}</button>
                ${c.tem_ficheiro ? `<button type="button" class="btn btn-secundario" data-ver-assinado>${esc(t('cl_c_view_signed'))}</button>` : ''}
                ${podeEditar && c.estado !== 'rascunho' ? `<button type="button" class="btn ${c.estado === 'enviado' ? '' : 'btn-secundario'}" data-anexar-contrato>${esc(t(c.estado === 'enviado' ? 'cl_c_attach' : 'cl_c_replace'))}</button>` : ''}</div></article>`;
    }

    function desenharFicha() {
        const el = $('cl-ficha');
        const e = ficha.empresa || {};
        const linhaLista = dados.clientes.find((c) => c.lead_id === ficha.lead_id);
        const desde = linhaLista?.cliente_desde;
        const propostasOpts = ficha.propostas.map((p) => `<option value="${esc(p.id)}">${esc(p.numero)} · ${esc(p.titulo)}${p.estado === 'enviada' ? '' : ' (' + esc(t('pp_st_' + p.estado)) + ')'}</option>`).join('');
        el.innerHTML = `<div class="cl-cab"><button type="button" class="btn btn-secundario" id="cl-voltar">${esc(t('cl_back'))}</button>
            <div><h2>${esc(e.nome || t('unnamed'))}</h2><p class="nota">${desde ? esc(sub(t('cl_since'), { d: dataCurta(desde) })) : ''}${e.pais ? ` · ${esc(nomePais(e.pais))}` : ''} · <a href="/assets/pages/leads.html#lead=${esc(ficha.lead_id)}">${esc(t('cl_open_lead'))}</a></p></div></div>
            ${ficha.contratos_disponivel ? '' : `<div class="erro-ui" role="alert">${esc(t('cl_err_sql'))}</div>`}
            <section class="card"><div class="card-head"><h2>${esc(t('cl_contracts'))}</h2></div><div class="card-body">
                ${podeEditar && ficha.contratos_disponivel ? `<div class="cl-novo"><label class="campo"><span>${esc(t('cl_from_proposal'))}</span><select id="cl-novo-prop"><option value="">${esc(t('cl_no_proposal'))}</option>${propostasOpts}</select></label><button type="button" class="btn" id="cl-novo">${esc(t('cl_new_contract'))}</button></div>` : ''}
                ${ficha.contratos.length ? ficha.contratos.map(contratoLinhaHtml).join('') : `<p class="nota">${esc(t('cl_no_contracts'))}</p>`}</div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_sug_t'))}</h2></div><div class="card-body">
                ${ficha.sugestoes.length ? `<div class="cl-sugs">${ficha.sugestoes.map(sugestaoHtml).join('')}</div>` : `<p class="nota">${esc(t('cl_sug_none'))}</p>`}</div></section>
            ${ficha.propostas.length ? `<section class="card"><div class="card-head"><h2>${esc(t('cl_props'))}</h2></div><div class="card-body"><ul class="cl-props">${ficha.propostas.map((p) => `<li><span><b>${esc(p.numero)}</b> · ${esc(p.titulo)} <span class="chip ${p.estado === 'enviada' ? 'chip-ok' : ''}">${esc(t('pp_st_' + p.estado))}</span></span><a class="btn-link" href="/assets/pages/documents.html#proposta=${esc(p.id)}">${esc(t('cl_prop_open'))}</a></li>`).join('')}</ul></div></section>` : ''}`;
    }

    $('cl-ficha').addEventListener('click', async (ev) => {
        if (ev.target.closest('#cl-voltar')) { voltarLista(); return; }
        if (ev.target.closest('#cl-novo')) {
            const prop = $('cl-novo-prop').value;
            try { const r = await api(`/api/clientes/${encodeURIComponent(ficha.lead_id)}/preparar${prop ? `?proposta=${encodeURIComponent(prop)}` : ''}`); abrirEditor({ leadId: ficha.lead_id, preparado: r }); }
            catch (e) { aviso(mensagemErro(e, t('cl_err')), true); }
            return;
        }
        const card = ev.target.closest('[data-contrato]'); if (!card) return;
        const id = card.dataset.contrato;
        try {
            if (ev.target.closest('[data-abrir]')) abrirEditor({ leadId: ficha.lead_id, contrato: await api(`/api/clientes/contratos/${encodeURIComponent(id)}`) });
            else if (ev.target.closest('[data-pdf]')) { const c = await api(`/api/clientes/contratos/${encodeURIComponent(id)}`); Contrato.imprimir(c, marca()); }
            else if (ev.target.closest('[data-ver-assinado]')) await verAssinado(id);
            else if (ev.target.closest('[data-anexar-contrato]')) abrirAnexo({ contratoId: id, lead: ficha.lead_id, rotulo: ficha.contratos.find((x) => x.id === id)?.titulo });
        } catch (e) { aviso(mensagemErro(e, t('cl_err')), true); }
    });

    async function verAssinado(id) {
        const r = await api(`/api/clientes/contratos/${encodeURIComponent(id)}/assinado`);
        window.open(r.url, '_blank', 'noopener');
    }

    // ======================= EDITOR DO CONTRATO =======================
    const padraoItem = (servico, idioma) => {
        const c = catalogo.servicos[servico];
        if (!c) return { servico: 'outro', nome: '', modelo: 'pontual', valor: '', descricao: '', entregaveis: [], nota: '' };
        const d = c[idioma];
        return { servico, nome: d.nome, modelo: c.modelo, valor: '', descricao: d.descricao, entregaveis: [...d.entregaveis], nota: '' };
    };
    const mesmoTexto = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const METODO = { pt: 'transferência bancária', en: 'bank transfer', es: 'transferencia bancaria' };

    function abrirEditor({ leadId, contrato = null, preparado = null }) {
        const base = contrato ? contrato.dados : preparado.dados;
        const d = JSON.parse(JSON.stringify(base));
        d.itens = (d.itens || []).map((i) => ({ ...i, valor: String(i.valor ?? ''), entregaveis: i.entregaveis || [] }));
        for (const k of ['desconto_pct', 'duracao_meses', 'aviso_dias', 'revisoes', 'prazo_aprovacao_dias', 'confidencialidade_anos']) d[k] = d[k] == null ? '' : String(d[k]);
        d.pagamento = { plano: '', entrada_pct: 50, metodo: METODO[d.idioma], iban: '', prazo_dias: 8, ...(d.pagamento || {}) };
        d.pagamento.entrada_pct = String(d.pagamento.entrada_pct); d.pagamento.prazo_dias = String(d.pagamento.prazo_dias);
        if (d.cliente?.pais && Contrato.codigoPais(d.cliente.pais) && /^[A-Za-z]{2}$/.test(d.cliente.pais)) d.cliente.pais = Contrato.nomePais(Contrato.codigoPais(d.cliente.pais), I18N.idioma());
        d.inicio = d.inicio || ''; d.fim = d.fim || ''; d.clausulas_extra = d.clausulas_extra || [];
        ed = { id: contrato?.id || null, leadId, numero: contrato?.numero || null, criado_em: contrato?.criado_em || null, estado: contrato?.estado || 'rascunho', empresa: contrato?.empresa || { nome: ficha.empresa?.nome },
            propostaId: contrato?.proposta_id || preparado?.proposta_id || null, enviado_em: contrato?.enviado_em || null, assinado_em: contrato?.assinado_em || null, tem_ficheiro: !!contrato?.tem_ficheiro, ficheiro_nome: contrato?.ficheiro_nome || null, dados: d };
        vista('editor'); desenharEditor(); window.scrollTo({ top: 0 });
    }
    function fecharEditor() { const lead = ed.leadId; ed = null; abrirFicha(lead); }

    // dados prontos para o servidor (e para a pré-visualização): números como números
    const paraServidor = () => {
        const d = ed.dados, p = d.pagamento;
        return { ...d, itens: d.itens.map((i) => ({ ...i, valor: num(i.valor) })), desconto_pct: num(d.desconto_pct), duracao_meses: Math.round(num(d.duracao_meses)), aviso_dias: num(d.aviso_dias) || 30, revisoes: num(d.revisoes), prazo_aprovacao_dias: num(d.prazo_aprovacao_dias) || 5,
            confidencialidade_anos: num(d.confidencialidade_anos) || 3, inicio: d.inicio || null, fim: d.fim || null, pagamento: { ...p, plano: p.plano || null, entrada_pct: num(p.entrada_pct) || 50, prazo_dias: num(p.prazo_dias) || 8 }, proposta_id: ed.propostaId || undefined };
    };

    const opt = (lista, atual, rotulo) => lista.map((v) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(rotulo(v))}</option>`).join('');
    const campo = (rotulo, corpo, extra = '') => `<label class="campo ${extra}"><span>${esc(rotulo)}</span>${corpo}</label>`;
    const trava = () => (ed.estado !== 'rascunho' || !podeEditar ? 'disabled' : '');
    const inp = (caminho, rotulo, { tipo = 'text', max = 200, extra = '' } = {}) => {
        const v = caminho.split('.').reduce((o, k) => o?.[k], ed.dados) ?? '';
        return campo(rotulo, `<input type="${tipo}" data-k="${caminho}" maxlength="${max}" value="${esc(v)}" ${trava()}>`, extra);
    };
    // Identificação fiscal do cliente: o rótulo depende do país (NIF, CNPJ, EIN...)
    const rotuloFiscalCliente = () => Contrato.rotuloFiscal(ed.dados.cliente?.pais) || t('cl_f_taxid_other');
    const clienteHtml = () => {
        const c = ed.dados.cliente, ro = trava();
        const paises = Contrato.PAISES.map((p) => Contrato.nomePais(p, I18N.idioma())).sort((a, b) => a.localeCompare(b, I18N.locale()));
        return `<div class="g-linha">${inp('cliente.nome', t('cl_f_name'), { max: 120 })}${campo(t('cl_f_country'), `<input type="text" data-k="cliente.pais" id="cl-pais" list="cl-paises" maxlength="60" autocomplete="off" value="${esc(c.pais || '')}" ${ro}><datalist id="cl-paises">${paises.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`)}</div>
            <div class="g-linha">${campo(rotuloFiscalCliente(), `<input type="text" data-k="cliente.nif" id="cl-nif" maxlength="30" value="${esc(c.nif || '')}" ${ro}>`, 'cl-fiscal')}${inp('cliente.representante', t('cl_f_rep'), { max: 100 })}</div>
            ${inp('cliente.morada', t('cl_f_address'), { max: 220 })}
            <div class="g-linha">${inp('cliente.cargo', t('cl_f_role'), { max: 80 })}${inp('cliente.email', t('cl_f_email'), { tipo: 'email', max: 120 })}</div>`;
    };
    const parteHtml = (chave) => `<div class="g-linha">${inp(`${chave}.nome`, t('cl_f_name'), { max: 120 })}${inp(`${chave}.nif`, t('cl_f_taxid'), { max: 30 })}</div>
        ${inp(`${chave}.morada`, t('cl_f_address'), { max: 220 })}
        <div class="g-linha3">${inp(`${chave}.representante`, t('cl_f_rep'), { max: 100 })}${inp(`${chave}.cargo`, t('cl_f_role'), { max: 80 })}${inp(`${chave}.email`, t('cl_f_email'), { tipo: 'email', max: 120 })}</div>`;

    function itemHtml(i, n, total) {
        const d = ed.dados, pct = i.modelo === 'sucesso', dis = trava();
        return `<div class="pp-item" data-i="${n}">
            <div class="pp-item-cab"><b>${esc(i.nome || t('pp_f_custom'))}</b><span class="pp-item-btns">
                <button type="button" class="btn-link" data-mover="-1" ${n === 0 || dis ? 'disabled' : ''} aria-label="${esc(t('pp_up'))}">↑</button>
                <button type="button" class="btn-link" data-mover="1" ${n === total - 1 || dis ? 'disabled' : ''} aria-label="${esc(t('pp_down'))}">↓</button>
                <button type="button" class="btn-link pp-apagar" data-remover ${dis}>${esc(t('pp_remove'))}</button></span></div>
            <div class="g-linha3">${campo(t('pp_f_item_name'), `<input type="text" data-f="nome" maxlength="90" value="${esc(i.nome)}" ${dis}>`)}
                ${campo(t('pp_f_model'), `<select data-f="modelo" ${dis}>${opt(MODELOS, i.modelo, (m) => t('pp_m_' + m))}</select>`)}
                ${campo(pct ? t('pp_f_percent') : `${t('pp_f_amount')} (${d.moeda})`, `<input type="text" inputmode="decimal" data-f="valor" value="${esc(i.valor)}" placeholder="${pct ? '20' : '0'}" ${dis}>`)}</div>
            ${campo(t('pp_f_desc'), `<textarea data-f="descricao" rows="2" maxlength="400" ${dis}>${esc(i.descricao)}</textarea>`)}
            ${campo(t('pp_f_deliv'), `<textarea data-f="entregaveis" data-linhas rows="4" ${dis}>${esc((i.entregaveis || []).join('\n'))}</textarea>`)}
            ${campo(t('pp_f_note'), `<input type="text" data-f="nota" maxlength="200" value="${esc(i.nota)}" ${dis}>`)}</div>`;
    }

    // painel de estado: emitir, reabrir, anexar o assinado
    function estadoHtml() {
        if (!ed.id) return '';
        const e = ed;
        const info = [e.enviado_em ? sub(t('cl_sent_on'), { d: dataCurta(e.enviado_em) }) : null, e.assinado_em ? sub(t('cl_signed_on'), { d: dataCurta(e.assinado_em) }) : null].filter(Boolean).join(' · ');
        const hoje = new Date(); const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        return `<section class="card"><div class="card-head"><h2>${esc(t('cl_status'))}</h2>${chipEstadoEd()}</div><div class="card-body">
            <p class="nota">${esc(t('cl_st_help'))}${info ? ' · ' + esc(info) : ''}</p>
            ${e.estado !== 'rascunho' ? `<p class="nota">${esc(t('cl_locked'))}</p>` : ''}
            <div class="cl-contrato-btns">
                ${podeEditar && e.estado === 'rascunho' ? `<button type="button" class="btn" data-enviar>${esc(t('cl_c_sent'))}</button>` : ''}
                ${podeEditar && e.estado === 'enviado' ? `<button type="button" class="btn btn-secundario" data-reabrir>${esc(t('cl_c_reopen'))}</button>` : ''}
                ${e.tem_ficheiro ? `<button type="button" class="btn btn-secundario" data-ver-assinado>${esc(t('cl_c_view_signed'))}${e.ficheiro_nome ? ` · ${esc(e.ficheiro_nome)}` : ''}</button>` : ''}
                ${podeEditar && e.tem_ficheiro ? `<button type="button" class="btn-link pp-apagar" data-remover-assinado>${esc(t('cl_c_remove_signed'))}</button>` : ''}
                ${podeEditar ? `<button type="button" class="btn-link pp-apagar" data-apagar>${esc(t('cl_c_delete'))}</button>` : ''}</div>
            ${podeEditar && e.estado !== 'rascunho' ? `<div class="cl-anexo g-form"><h3>${esc(t('cl_c_attach'))}</h3><div class="g-linha">${campo(t('cl_file'), '<input type="file" id="cl-ficheiro" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg">')}
                ${campo(t('cl_signed_date'), `<input type="date" id="cl-data-ass" max="${hojeIso}" value="${esc(e.assinado_em || hojeIso)}">`)}</div>
                <button type="button" class="btn" data-anexar>${esc(t('cl_c_attach'))}</button></div>` : ''}</div></section>`;
    }
    const chipEstadoEd = () => chipEstado(ed.estado);

    function formularioHtml() {
        const d = ed.dados, ro = trava();
        const catOpcoes = SERVICOS.map((s) => `<option value="${s}">${esc(catalogo.servicos[s][d.idioma].nome)}</option>`).join('') + `<option value="outro">${esc(t('pp_f_custom'))}</option>`;
        const tipo = Contrato.tipoContrato(paraServidor());
        return `<div class="pp-form">
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_provider'))}</h2></div><div class="card-body g-form">${parteHtml('prestador')}</div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_client'))}</h2></div><div class="card-body g-form">${clienteHtml()}</div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_services'))}</h2></div><div class="card-body g-form">
                <div class="g-linha">${inp('titulo', t('cl_f_title'), { max: 120 })}
                    ${campo(t('cl_f_lang'), `<select data-k="idioma" id="cl-idioma" ${ro}>${opt(IDIOMAS, d.idioma, (l) => t('pp_lang_' + l))}</select>`)}</div>
                <div class="g-linha3">${campo(t('cl_f_currency'), `<select data-k="moeda" ${ro}>${opt(MOEDAS, d.moeda, (m) => m)}</select>`)}
                    ${campo(t('cl_f_vat'), `<select data-k="iva" ${ro}>${opt(IVAS, d.iva, (v) => t('pp_vat_' + v))}</select>`)}
                    ${inp('desconto_pct', t('cl_f_discount'), { max: 6 })}</div>
                <div id="cl-itens">${d.itens.map((i, n) => itemHtml(i, n, d.itens.length)).join('')}</div>
                <div class="pp-add"><select id="cl-add-serv" ${ro}>${catOpcoes}</select><button type="button" class="btn btn-secundario" id="cl-add" ${ro}>${esc(t('cl_f_service_add'))}</button></div></div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_terms'))}</h2></div><div class="card-body g-form">
                <div class="g-linha3">${inp('inicio', t('cl_f_start'), { tipo: 'date' })}${inp('duracao_meses', t('cl_f_duration'), { max: 3 })}${inp('fim', t('cl_f_end'), { tipo: 'date' })}</div>
                <p class="nota" id="cl-calc"></p>
                <div class="g-linha3">${campo(t('cl_f_renewal'), `<select data-k="renovacao" ${ro}>${opt(['nenhuma', 'automatica'], d.renovacao || 'nenhuma', (v) => t('cl_ren_' + v))}</select>`)}
                    ${inp('aviso_dias', t('cl_f_notice'), { max: 3 })}${inp('revisoes', t('cl_f_revisions'), { max: 2 })}</div>
                <div class="g-linha">${inp('prazo_aprovacao_dias', t('cl_f_approval'), { max: 2 })}${inp('confidencialidade_anos', t('cl_f_conf'), { max: 2 })}</div></div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_payment'))}</h2></div><div class="card-body g-form">
                <div class="g-linha">${campo(t('cl_f_plan'), `<select data-k="pagamento.plano" id="cl-plano" ${ro}>${opt(PLANOS, d.pagamento.plano || (tipo === 'projeto' ? 'entrada_saldo' : 'mensal_antecipado'), (p) => t('cl_plan_' + p))}</select>`)}
                    ${(d.pagamento.plano || (tipo === 'projeto' ? 'entrada_saldo' : '')) === 'entrada_saldo' ? inp('pagamento.entrada_pct', t('cl_f_deposit'), { max: 2 }) : ''}</div>
                <div class="g-linha3">${inp('pagamento.metodo', t('cl_f_method'), { max: 80 })}${inp('pagamento.iban', t('cl_f_iban'), { max: 40 })}${inp('pagamento.prazo_dias', t('cl_f_paydays'), { max: 2 })}</div></div></section>
            <section class="card"><div class="card-head"><h2>${esc(t('cl_s_extra'))}</h2></div><div class="card-body g-form">
                <label class="tk-concluir"><input type="checkbox" data-k="dados_pessoais" ${d.dados_pessoais !== false ? 'checked' : ''} ${ro}> ${esc(t('cl_f_gdpr'))}</label>
                ${campo(t('cl_f_extra'), `<textarea data-k="clausulas_extra" data-linhas rows="4" ${ro}>${esc((d.clausulas_extra || []).join('\n'))}</textarea>`)}
                <div class="g-linha3">${inp('foro', t('cl_f_venue'), { max: 60 })}${inp('local', t('cl_f_place'), { max: 60 })}${inp('proposta_numero', t('cl_f_prop_no'), { max: 40 })}</div></div></section>
            ${estadoHtml()}</div>`;
    }

    function desenharEditor() {
        const el = $('cl-editor');
        el.innerHTML = `<div class="pp-barra"><div><button type="button" class="btn btn-secundario" id="cl-ed-voltar">${esc(t('cl_back'))}</button> <b class="cl-ed-nome">${esc(ed.empresa?.nome || '')} · ${esc(ed.numero || t('cl_e_new'))}</b></div>
            <div class="pp-barra-btns">${podeEditar && ed.estado === 'rascunho' ? `<button type="button" class="btn" id="cl-guardar">${esc(t('cl_save'))}</button>` : ''}<button type="button" class="btn btn-secundario" id="cl-pdf">${esc(t('cl_c_pdf'))}</button></div></div>
            <div id="cl-ed-erro"></div>
            <div class="pp-editor">${formularioHtml()}<div class="pp-previa"><h2>${esc(t('cl_preview'))}</h2><div class="ct-papel" id="cl-previa"></div></div></div>`;
        previa();
    }
    function previa() {
        const caixa = $('cl-previa'); if (!caixa || !ed) return;
        const x = paraServidor();
        caixa.innerHTML = Contrato.render({ numero: ed.numero, criado_em: ed.criado_em, dados: x, empresa: ed.empresa }, marca());
        const tot = Contrato.totais(x), fim = Contrato.fimPrevisto(x);
        const calc = $('cl-calc');
        if (calc) calc.textContent = [fim ? sub(t('cl_end_calc'), { d: dataCurta(fim) }) : '', tot.total_contrato != null ? sub(t('cl_total_calc'), { v: dinheiro(tot.total_contrato, x.moeda) }) : (tot.mensal ? sub(t('cl_per_month'), { v: dinheiro(tot.mensal_liquido, x.moeda) }) : '')].filter(Boolean).join(' · ');
    }
    const erroEd = (txt) => { const c = $('cl-ed-erro'); if (c) c.innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };

    // Alterar o idioma troca os textos por defeito que ainda não foram editados (os já editados mantêm-se)
    function mudarIdioma(novo) {
        const antigo = ed.dados.idioma; if (antigo === novo) return;
        ed.dados.itens = ed.dados.itens.map((i) => {
            if (i.servico === 'outro') return i;
            const a = padraoItem(i.servico, antigo), n = padraoItem(i.servico, novo);
            return { ...i, nome: i.nome === a.nome ? n.nome : i.nome, descricao: i.descricao === a.descricao ? n.descricao : i.descricao, entregaveis: mesmoTexto(i.entregaveis, a.entregaveis) ? n.entregaveis : i.entregaveis };
        });
        if (ed.dados.pagamento.metodo === METODO[antigo]) ed.dados.pagamento.metodo = METODO[novo];
        ed.dados.idioma = novo;
    }

    function pendentesTexto(faltam) {
        const nomes = { nome: 'cl_f_name', nif: 'cl_f_taxid', morada: 'cl_f_address', representante: 'cl_f_rep', inicio: 'cl_f_start' };
        const fiscalDe = (quem) => (quem === 'cliente' ? rotuloFiscalCliente() : t('cl_f_taxid'));
        return faltam.map((f) => { const [quem, campoNome] = f.split('.'); return campoNome ? `${t(quem === 'prestador' ? 'cl_s_provider' : 'cl_s_client')} – ${campoNome === 'nif' ? fiscalDe(quem) : t(nomes[campoNome])}` : t(nomes[quem]); }).join('; ');
    }

    async function guardar({ silencioso = false } = {}) {
        if (!ed.dados.itens.length) { erroEd(t('cl_need_service')); return null; }
        erroEd('');
        try {
            const corpo = JSON.stringify(paraServidor());
            const r = ed.id ? await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}`, { method: 'PUT', body: corpo })
                : await api(`/api/clientes/${encodeURIComponent(ed.leadId)}/contratos`, { method: 'POST', body: corpo });
            const novo = !ed.id;
            ed.id = r.id; ed.numero = r.numero; ed.criado_em = r.criado_em; ed.estado = r.estado;
            if (!silencioso) { aviso(t(novo ? 'cl_created' : 'cl_saved')); if (novo) desenharEditor(); else previa(); }
            return r;
        } catch (e) { erroEd(mensagemErro(e, t('cl_err'))); return null; }
    }

    // ---------- eventos do editor ----------
    const definir = (caminho, valor) => { const ks = caminho.split('.'); let o = ed.dados; ks.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; }); o[ks.at(-1)] = valor; };
    let adiar = null;
    $('cl-editor').addEventListener('input', (ev) => {
        if (!ed) return;
        const el = ev.target;
        if (el.dataset.k && el.type !== 'checkbox' && el.tagName !== 'SELECT') definir(el.dataset.k, el.dataset.linhas !== undefined ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value);
        else if (el.dataset.f && el.closest('[data-i]')) { const i = ed.dados.itens[Number(el.closest('[data-i]').dataset.i)]; i[el.dataset.f] = el.dataset.linhas !== undefined ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value; }
        else return;
        if (el.id === 'cl-pais') { const rot = document.querySelector('.cl-fiscal > span'); if (rot) rot.textContent = rotuloFiscalCliente(); }
        clearTimeout(adiar); adiar = setTimeout(previa, 180);
    });
    $('cl-editor').addEventListener('change', (ev) => {
        if (!ed) return;
        const el = ev.target;
        if (el.id === 'cl-idioma') { mudarIdioma(el.value); desenharEditor(); }
        else if (el.type === 'checkbox' && el.dataset.k) { definir(el.dataset.k, el.checked); previa(); }
        else if (el.dataset.k && el.tagName === 'SELECT') { definir(el.dataset.k, el.value); desenharEditor(); }
        else if (el.dataset.f === 'modelo' && el.closest('[data-i]')) { ed.dados.itens[Number(el.closest('[data-i]').dataset.i)].modelo = el.value; desenharEditor(); }
    });
    $('cl-editor').addEventListener('click', async (ev) => {
        if (!ed) return;
        const a = ev.target;
        try {
            if (a.closest('#cl-ed-voltar')) { fecharEditor(); return; }
            if (a.closest('#cl-guardar')) { await guardar(); return; }
            if (a.closest('#cl-pdf')) {
                if (ed.estado === 'rascunho' && podeEditar && !(await guardar({ silencioso: true }))) return;   // o PDF sai do que ficou guardado (e já com o n.º do contrato)
                Contrato.imprimir({ numero: ed.numero, criado_em: ed.criado_em, dados: paraServidor(), empresa: ed.empresa }, marca()); return;
            }
            if (a.closest('#cl-add')) { ed.dados.itens.push(padraoItem($('cl-add-serv').value, ed.dados.idioma)); desenharEditor(); return; }
            const item = a.closest('[data-i]');
            if (item && a.closest('[data-remover]')) { ed.dados.itens.splice(Number(item.dataset.i), 1); desenharEditor(); return; }
            if (item && a.closest('[data-mover]')) { const n = Number(item.dataset.i), m = n + Number(a.closest('[data-mover]').dataset.mover), l = ed.dados.itens; if (m >= 0 && m < l.length) { [l[n], l[m]] = [l[m], l[n]]; desenharEditor(); } return; }
            if (a.closest('[data-enviar]')) {
                if (!window.confirm(sub(t('cl_confirm_sent'), { n: ed.dados.titulo }))) return;
                const r = await guardar({ silencioso: true }); if (!r) return;
                try { const c = await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}/enviado`, { method: 'POST' }); atualizarEstado(c); aviso(t('cl_sent_ok')); desenharEditor(); }
                catch (e) { erroEd(e?.codigo === 'INVALIDO' && e.faltam ? sub(t('cl_missing'), { l: pendentesTexto(e.faltam) }) : mensagemErro(e, t('cl_err'))); }
                return;
            }
            if (a.closest('[data-reabrir]')) { atualizarEstado(await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}/reabrir`, { method: 'POST' })); aviso(t('cl_reopened')); desenharEditor(); return; }
            if (a.closest('[data-apagar]')) {
                if (!window.confirm(sub(t('cl_confirm_delete'), { n: ed.numero }))) return;
                await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}`, { method: 'DELETE' }); aviso(t('cl_deleted')); fecharEditor(); return;
            }
            if (a.closest('[data-ver-assinado]')) { await verAssinado(ed.id); return; }
            if (a.closest('[data-remover-assinado]')) { if (!window.confirm(t('cl_confirm_remove'))) return; atualizarEstado(await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}/assinado`, { method: 'DELETE' })); aviso(t('cl_removed_signed')); desenharEditor(); return; }
            if (a.closest('[data-anexar]')) { await anexar(); }
        } catch (e) { erroEd(mensagemErro(e, t('cl_err'))); }
    });
    function atualizarEstado(c) { ed.estado = c.estado; ed.enviado_em = c.enviado_em; ed.assinado_em = c.assinado_em; ed.tem_ficheiro = c.tem_ficheiro; ed.ficheiro_nome = c.ficheiro_nome; }

    async function anexar() {
        const f = $('cl-ficheiro')?.files?.[0];
        if (!f) { erroEd(t('cl_file_pick')); return; }
        if (f.size > 10 * 1024 * 1024) { erroEd(t('cl_file_big')); return; }
        const dadosB64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(f); });
        const c = await api(`/api/clientes/contratos/${encodeURIComponent(ed.id)}/assinado`, { method: 'POST', body: JSON.stringify({ nome: f.name, dados: dadosB64, data_assinatura: $('cl-data-ass').value || undefined }) });
        atualizarEstado(c); aviso(t('cl_attached')); desenharEditor();
    }

    // ======================= ANEXAR O CONTRATO ASSINADO (janela) =======================
    // Escolhe-se o contrato enviado (ou já vem escolhido), o ficheiro assinado pelas duas partes e a data de assinatura.
    function abrirAnexo({ contratoId = null, lead = null, rotulo = null }) {
        const enviados = dados.por_assinar || [];
        const hoje = new Date(); const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        const foco = document.activeElement;
        const fundo = document.createElement('div'); fundo.className = 'ng-fundo';
        const caixa = document.createElement('div'); caixa.className = 'ng-modal'; caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-modal', 'true'); caixa.setAttribute('aria-labelledby', 'anx-t'); caixa.tabIndex = -1;
        const nada = !contratoId && !enviados.length;
        const escolha = contratoId
            ? `<p class="ng-empresa"><b>${esc(rotulo || enviados.find((x) => x.id === contratoId) ? (rotulo || `${enviados.find((x) => x.id === contratoId).empresa || ''} · ${enviados.find((x) => x.id === contratoId).numero}`) : t('cl_contracts'))}</b></p>`
            : `<label class="campo"><span>${esc(t('cl_attach_pick'))}</span><select id="anx-contrato">${enviados.map((x) => `<option value="${esc(x.id)}" data-lead="${esc(x.lead_id)}">${esc(x.empresa || '–')} · ${esc(x.numero)} · ${esc(x.titulo)}</option>`).join('')}</select></label>`;
        caixa.innerHTML = `<form class="g-form" novalidate><header class="ng-cab"><h2 id="anx-t">${esc(t('cl_c_attach'))}</h2><button type="button" class="contact-x" data-fechar aria-label="${esc(t('cl_cancel'))}">×</button></header>
            <div id="anx-erro"></div>${nada ? `<p class="nota">${esc(t('cl_attach_none'))}</p>` : `${escolha}
            <div class="g-linha"><label class="campo"><span>${esc(t('cl_file'))}</span><input type="file" id="anx-ficheiro" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label>
            <label class="campo"><span>${esc(t('cl_signed_date'))}</span><input type="date" id="anx-data" max="${hojeIso}" value="${hojeIso}"></label></div>`}
            <div class="ng-botoes">${nada ? '' : `<button type="submit" class="btn">${esc(t('cl_c_attach'))}</button>`}<button type="button" class="btn btn-secundario" data-fechar>${esc(t('cl_cancel'))}</button></div></form>`;
        document.body.append(fundo, caixa); document.body.classList.add('modal-aberto');
        const fechar = () => { document.removeEventListener('keydown', tecla, true); fundo.remove(); caixa.remove(); document.body.classList.remove('modal-aberto'); if (foco && document.contains(foco)) foco.focus(); };
        const tecla = (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); fechar(); } };
        document.addEventListener('keydown', tecla, true);
        fundo.addEventListener('click', fechar);
        caixa.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });
        const erroAnx = (txt) => { caixa.querySelector('#anx-erro').innerHTML = txt ? `<div class="erro-ui" role="alert">${esc(txt)}</div>` : ''; };
        caixa.querySelector('form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const sel = caixa.querySelector('#anx-contrato');
            const id = contratoId || sel?.value, leadDe = lead || sel?.selectedOptions?.[0]?.dataset.lead;
            const f = caixa.querySelector('#anx-ficheiro')?.files?.[0];
            if (!id) return;
            if (!f) { erroAnx(t('cl_file_pick')); return; }
            if (f.size > 10 * 1024 * 1024) { erroAnx(t('cl_file_big')); return; }
            const botao = caixa.querySelector('[type="submit"]'); botao.disabled = true;
            try {
                const b64 = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(f); });
                await api(`/api/clientes/contratos/${encodeURIComponent(id)}/assinado`, { method: 'POST', body: JSON.stringify({ nome: f.name, dados: b64, data_assinatura: caixa.querySelector('#anx-data').value || undefined }) });
                fechar(); aviso(t('cl_attached'));
                if (ficha) await abrirFicha(ficha.lead_id, { silencioso: true }); else await carregar();
                void leadDe;
            } catch (e) { botao.disabled = false; erroAnx(mensagemErro(e, t('cl_err'))); }
        });
        (caixa.querySelector('#anx-ficheiro') || caixa.querySelector('[data-fechar]')).focus();
    }

    // ---------- idioma da aplicação, endereço e arranque ----------
    I18N.aoMudar(() => {
        if (ed) { const y = window.scrollY; desenharEditor(); window.scrollTo({ top: y }); }
        else if (ficha) desenharFicha();
        else { montarBarra(); desenharLista(); }
    });
    async function abrirDoEndereco() {
        const m = /^#cliente=([0-9a-f-]{36})$/i.exec(location.hash);
        if (m) await abrirFicha(m[1], { silencioso: true });
    }
    carregar().then(abrirDoEndereco);
})();

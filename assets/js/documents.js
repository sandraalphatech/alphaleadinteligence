/* documents.js: propostas comerciais.
   Lista de propostas e editor: a Alpha Tech escolhe um cliente que já está em reunião agendada, preenche serviços, preços e condições,
   pede (se quiser) os textos à IA, vê a proposta ao vivo e descarrega o PDF. Os preços são sempre os do formulário. */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);

    let catalogo = null, elegiveis = [], propostas = [], falhou = false, semTabela = false, pedido = 0;
    let ed = null;                                         // a proposta aberta no editor
    const IDIOMAS = ['pt', 'en', 'es'];
    const MODELOS = ['mensal', 'pontual', 'sucesso'];
    const MOEDAS = ['EUR', 'USD', 'GBP', 'BRL'];
    const IVAS = ['mais_iva', 'incluido', 'isento'];
    const SERVICOS = ['sistemas', 'website', 'marketing_digital', 'redes_sociais', 'automacao_ia', 'design_grafico'];

    const marca = () => ({ nome: catalogo.empresa.nome, marca: catalogo.empresa.marca, lema: catalogo.empresa.lema, email: catalogo.empresa.email });
    const num = (v) => { const n = typeof v === 'string' ? Number(v.replace(',', '.').trim()) : Number(v); return Number.isFinite(n) ? n : 0; };
    const linhas = (txt) => String(txt || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const dataCurta = (iso) => new Date(iso).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const nomePais = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
    const dinheiro = (v, moeda) => new Intl.NumberFormat(I18N.locale(), { style: 'currency', currency: moeda || 'EUR', maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);

    // ---------- avisos ----------
    let temporizador = null;
    function aviso(texto, erro = false) {
        $('doc-aviso').innerHTML = texto ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(texto)}</div>` : '';
        clearTimeout(temporizador);
        if (texto) temporizador = setTimeout(() => { $('doc-aviso').innerHTML = ''; }, 5000);
    }
    const mensagemErro = (e, padrao) => (e?.codigo === 'CONFIG' ? t('pp_err_sql') : e?.codigo === 'PROPOSTA_ESTADO' ? t('pp_err_state') : (e?.codigo === 'INVALIDO' || e?.codigo === 'VAZIO') && e.message ? e.message : padrao);

    // ---------- textos por defeito (do catálogo) ----------
    const padraoItem = (servico, idioma) => {
        const c = catalogo.servicos[servico];
        if (!c) return { servico: 'outro', nome: '', modelo: 'pontual', valor: '', descricao: '', entregaveis: [], nota: '' };
        const d = c[idioma];
        return { servico, nome: d.nome, modelo: c.modelo, valor: '', descricao: d.descricao, entregaveis: [...d.entregaveis], nota: '' };
    };
    const mesmoTexto = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // ---------- carregar ----------
    async function carregar() {
        const n = ++pedido;
        semTabela = false;
        try {
            if (!catalogo) catalogo = await api('/api/documentos/catalogo');
            const [el, pr] = await Promise.all([
                api('/api/documentos/elegiveis'),
                api('/api/documentos/propostas').catch((e) => { semTabela = e?.codigo === 'CONFIG'; return { propostas: [] }; })
            ]);
            if (n !== pedido) return;
            elegiveis = el.leads; propostas = pr.propostas; falhou = false;
        } catch { if (n !== pedido) return; falhou = true; }
        desenharLista();
    }

    // ---------- lista ----------
    const valorResumo = (p) => {
        const x = p.totais, partes = [];
        if (x.mensal_liquido) partes.push(`${dinheiro(x.mensal_liquido, p.moeda)}/${t('pp_unit_month')}`);
        if (x.pontual_liquido) partes.push(dinheiro(x.pontual_liquido, p.moeda));
        x.sucesso.forEach((s) => partes.push(`${s.pct}%`));
        return partes.join(' + ') || '–';
    };

    function desenharLista() {
        if (ed) return;
        const el = $('doc-lista');
        if (falhou) { el.innerHTML = `<div class="erro-ui" role="alert">${esc(t('pp_err_load'))}</div>`; return; }
        const linhasHtml = propostas.map((p) => `<tr data-id="${esc(p.id)}">
            <td><b>${esc(p.numero)}</b></td><td>${esc(p.empresa?.nome || '–')}<span class="lead-sub">${esc(p.destinatario || '')}</span></td><td>${esc(p.titulo)}</td>
            <td>${esc(valorResumo(p))}</td><td><span class="chip ${p.estado === 'enviada' ? 'chip-ok' : ''}">${esc(t('pp_st_' + p.estado))}</span></td><td>${esc(dataCurta(p.criado_em))}</td>
            <td class="pp-acoes"><button type="button" class="btn-link" data-abrir>${esc(t('pp_open'))}</button><button type="button" class="btn-link" data-pdf>${esc(t('pp_pdf'))}</button>
                ${podeEditar && p.estado !== 'enviada' ? `<button type="button" class="btn-link" data-enviada>${esc(t('pp_mark_sent'))}</button>` : ''}
                ${podeEditar ? `<button type="button" class="btn-link pp-apagar" data-apagar>${esc(t('pp_delete'))}</button>` : ''}</td></tr>`).join('');
        el.innerHTML = `<div class="card"><div class="card-head"><h2>${esc(t('pp_title_list'))}</h2>
                ${podeEditar ? `<button type="button" class="btn" id="pp-nova" ${elegiveis.length ? '' : 'disabled'}>${esc(t('pp_new'))}</button>` : ''}</div>
            <div class="card-body">${semTabela ? `<div class="erro-ui">${esc(t('pp_err_sql'))}</div>` : ''}
                <p class="nota">${esc(t('pp_eligible').replace('{n}', elegiveis.length))}</p>
                ${propostas.length ? `<div class="tabela-rolar"><table class="tabela pp-tabela"><thead><tr><th>${esc(t('pp_col_no'))}</th><th>${esc(t('pp_col_client'))}</th><th>${esc(t('pp_col_title'))}</th><th>${esc(t('pp_col_value'))}</th><th>${esc(t('pp_col_status'))}</th><th>${esc(t('pp_col_date'))}</th><th></th></tr></thead><tbody>${linhasHtml}</tbody></table></div>`
                    : `<div class="vazio"><b>${esc(t('pp_none_t'))}</b><span>${esc(t('pp_none_s'))}</span></div>`}</div></div>`;
    }

    $('doc-lista').addEventListener('click', async (ev) => {
        if (ev.target.closest('#pp-nova')) { abrirNova(); return; }
        const tr = ev.target.closest('tr[data-id]'); if (!tr) return;
        const id = tr.dataset.id, p = propostas.find((x) => x.id === id);
        try {
            if (ev.target.closest('[data-abrir]')) abrirExistente(await api(`/api/documentos/propostas/${encodeURIComponent(id)}`));
            else if (ev.target.closest('[data-pdf]')) { const c = await api(`/api/documentos/propostas/${encodeURIComponent(id)}`); Proposta.imprimir(c, marca()); }
            else if (ev.target.closest('[data-enviada]')) {
                if (!window.confirm(t('pp_confirm_sent').replace('{n}', p.numero))) return;
                const r = await api(`/api/documentos/propostas/${encodeURIComponent(id)}/enviada`, { method: 'POST' });
                aviso(t(!r.negocio ? 'pp_sent_ok' : r.negocio.criado ? 'pp_sent_deal_new' : r.negocio.moveu ? 'pp_sent_deal_upd' : 'pp_sent_deal_link')); await carregar();
            } else if (ev.target.closest('[data-apagar]')) {
                if (!window.confirm(t('pp_confirm_delete').replace('{n}', p.numero))) return;
                await api(`/api/documentos/propostas/${encodeURIComponent(id)}`, { method: 'DELETE' }); aviso(t('pp_deleted')); await carregar();
            }
        } catch (e) { aviso(mensagemErro(e, t('pp_err_save')), true); }
    });

    // ---------- editor: estado ----------
    function dadosVazios(idioma) {
        const p = catalogo.padroes[idioma];
        return { idioma, titulo: '', destinatario: { nome: '', cargo: '' }, resumo: '', objetivos: [], itens: [], moeda: 'EUR', iva: 'mais_iva', desconto_pct: '', validade_dias: 15, inicio: '', duracao_meses: 0,
            pagamento: p.pagamento, passos: p.passos.map((x) => ({ ...x })), termos: [...p.termos], porque: [...p.porque], notas_finais: '', assinante: { nome: utilizador?.nome || '' } };
    }
    function abrirNova() {
        ed = { id: null, numero: null, criado_em: null, leadId: '', empresa: {}, decisores: [], dados: dadosVazios('pt') };
        mostrarEditor();
    }
    function abrirExistente(p) {
        const lead = elegiveis.find((x) => x.lead_id === p.lead_id);
        ed = { id: p.id, numero: p.numero, criado_em: p.criado_em, leadId: p.lead_id, empresa: p.empresa || {}, decisores: lead?.decisores || [], dados: JSON.parse(JSON.stringify(p.dados)) };
        mostrarEditor();
    }
    function fecharEditor() { ed = null; $('doc-editor').hidden = true; $('doc-editor').innerHTML = ''; $('doc-lista').hidden = false; carregar(); }

    // Alterar o idioma troca os textos por defeito que ainda não foram editados (os já editados mantêm-se)
    function mudarIdioma(novo) {
        const antigo = ed.dados.idioma;
        if (antigo === novo) return;
        const pa = catalogo.padroes[antigo], pn = catalogo.padroes[novo];
        ed.dados.itens = ed.dados.itens.map((i) => {
            if (i.servico === 'outro') return i;
            const a = padraoItem(i.servico, antigo), n = padraoItem(i.servico, novo);
            return { ...i, nome: i.nome === a.nome ? n.nome : i.nome, descricao: i.descricao === a.descricao ? n.descricao : i.descricao, entregaveis: mesmoTexto(i.entregaveis, a.entregaveis) ? n.entregaveis : i.entregaveis };
        });
        if (ed.dados.pagamento === pa.pagamento) ed.dados.pagamento = pn.pagamento;
        if (mesmoTexto(ed.dados.passos, pa.passos)) ed.dados.passos = pn.passos.map((x) => ({ ...x }));
        if (mesmoTexto(ed.dados.termos, pa.termos)) ed.dados.termos = [...pn.termos];
        if (mesmoTexto(ed.dados.porque, pa.porque)) ed.dados.porque = [...pn.porque];
        ed.dados.idioma = novo;
    }

    // dados prontos para enviar ao servidor (listas em texto -> listas)
    const paraServidor = () => {
        const d = ed.dados;
        return { ...d, itens: d.itens.map((i) => ({ ...i, valor: num(i.valor) })), desconto_pct: num(d.desconto_pct), validade_dias: num(d.validade_dias) || 15, duracao_meses: num(d.duracao_meses), inicio: d.inicio || null };
    };

    // ---------- editor: desenho ----------
    const opt = (lista, atual, rotulo) => lista.map((v) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(rotulo(v))}</option>`).join('');
    const campo = (rotulo, corpo, extra = '') => `<label class="campo ${extra}"><span>${esc(rotulo)}</span>${corpo}</label>`;
    const passosTexto = (ps) => ps.map((p) => (p.texto ? `${p.titulo}: ${p.texto}` : p.titulo)).join('\n');

    function itemHtml(i, n, total) {
        const d = ed.dados, pct = i.modelo === 'sucesso';
        return `<div class="pp-item" data-i="${n}">
            <div class="pp-item-cab"><b>${esc(i.nome || t('pp_f_custom'))}</b><span class="pp-item-btns">
                <button type="button" class="btn-link" data-mover="-1" ${n === 0 ? 'disabled' : ''} aria-label="${esc(t('pp_up'))}">↑</button>
                <button type="button" class="btn-link" data-mover="1" ${n === total - 1 ? 'disabled' : ''} aria-label="${esc(t('pp_down'))}">↓</button>
                <button type="button" class="btn-link pp-apagar" data-remover>${esc(t('pp_remove'))}</button></span></div>
            <div class="g-linha3">${campo(t('pp_f_item_name'), `<input type="text" data-f="nome" maxlength="90" value="${esc(i.nome)}">`)}
                ${campo(t('pp_f_model'), `<select data-f="modelo">${opt(MODELOS, i.modelo, (m) => t('pp_m_' + m))}</select>`)}
                ${campo(pct ? t('pp_f_percent') : `${t('pp_f_amount')} (${d.moeda})`, `<input type="text" inputmode="decimal" data-f="valor" value="${esc(i.valor)}" placeholder="${pct ? '20' : '0'}">`)}</div>
            ${campo(t('pp_f_desc'), `<textarea data-f="descricao" rows="2" maxlength="400">${esc(i.descricao)}</textarea>`)}
            ${campo(t('pp_f_deliv'), `<textarea data-f="entregaveis" data-linhas rows="4">${esc((i.entregaveis || []).join('\n'))}</textarea>`)}
            ${campo(t('pp_f_note'), `<input type="text" data-f="nota" maxlength="200" value="${esc(i.nota)}">`)}</div>`;
    }

    function formularioHtml() {
        const d = ed.dados, novo = !ed.id;
        const leadOpcoes = elegiveis.map((l) => `<option value="${esc(l.lead_id)}" ${l.lead_id === ed.leadId ? 'selected' : ''}>${esc(l.empresa.nome || t('unnamed'))}${l.empresa.pais ? ` · ${esc(nomePais(l.empresa.pais))}` : ''}</option>`).join('');
        const pessoas = ed.decisores.map((p, n) => `<option value="${n}">${esc(p.nome)}${p.cargo ? ` · ${esc(p.cargo)}` : ''}</option>`).join('');
        const catOpcoes = SERVICOS.map((s) => `<option value="${s}">${esc(catalogo.servicos[s][d.idioma].nome)}</option>`).join('') + `<option value="outro">${esc(t('pp_f_custom'))}</option>`;
        return `<div class="pp-form">
            <section class="card"><div class="card-head"><h2>${esc(t('pp_s_client'))}</h2></div><div class="card-body g-form">
                ${novo ? campo(t('pp_f_lead'), `<select id="pp-lead"><option value="">${esc(t('pp_f_pick'))}</option>${leadOpcoes}</select>`)
                    : `<p><b>${esc(ed.empresa?.nome || '')}</b></p>`}
                ${ed.decisores.length ? campo(t('pp_f_contact_pick'), `<select id="pp-pessoa"><option value="">–</option>${pessoas}</select>`) : ''}
                <div class="g-linha">${campo(t('pp_f_name'), `<input type="text" data-d="destinatario.nome" maxlength="90" value="${esc(d.destinatario.nome)}">`)}
                    ${campo(t('pp_f_role'), `<input type="text" data-d="destinatario.cargo" maxlength="90" value="${esc(d.destinatario.cargo)}">`)}</div>
                <div class="g-linha">${campo(t('pp_f_lang'), `<select id="pp-idioma">${opt(IDIOMAS, d.idioma, (l) => t('pp_lang_' + l))}</select>`)}
                    ${campo(t('pp_f_title'), `<input type="text" data-d="titulo" maxlength="120" value="${esc(d.titulo)}">`)}</div></div></section>

            <section class="card"><div class="card-head"><h2>${esc(t('pp_s_services'))}</h2></div><div class="card-body g-form">
                <div id="pp-itens">${d.itens.map((i, n) => itemHtml(i, n, d.itens.length)).join('')}</div>
                <div class="pp-add"><select id="pp-add">${catOpcoes}</select><button type="button" class="btn btn-secundario" id="pp-add-btn" ${d.itens.length >= 8 ? 'disabled' : ''}>${esc(t('pp_add'))}</button></div></div></section>

            <section class="card"><div class="card-head"><h2>${esc(t('pp_s_terms'))}</h2></div><div class="card-body g-form">
                <div class="g-linha3">${campo(t('pp_f_currency'), `<select data-d="moeda">${opt(MOEDAS, d.moeda, (m) => m)}</select>`)}
                    ${campo(t('pp_f_vat'), `<select data-d="iva">${opt(IVAS, d.iva, (v) => t('pp_vat_' + v))}</select>`)}
                    ${campo(t('pp_f_discount'), `<input type="text" inputmode="decimal" data-d="desconto_pct" value="${esc(d.desconto_pct)}" placeholder="0">`)}</div>
                <div class="g-linha3">${campo(t('pp_f_validity'), `<input type="text" inputmode="numeric" data-d="validade_dias" value="${esc(d.validade_dias)}">`)}
                    ${campo(t('pp_f_start'), `<input type="date" data-d="inicio" value="${esc(d.inicio || '')}">`)}
                    ${campo(t('pp_f_term'), `<input type="text" inputmode="numeric" data-d="duracao_meses" value="${esc(d.duracao_meses)}">`)}</div>
                ${campo(t('pp_f_payment'), `<textarea data-d="pagamento" rows="3" maxlength="300">${esc(d.pagamento)}</textarea>`)}</div></section>

            <section class="card"><div class="card-head"><h2>${esc(t('pp_s_texts'))}</h2></div><div class="card-body g-form">
                <p class="nota">${esc(t('pp_ai_note'))}</p>
                <button type="button" class="btn btn-secundario" id="pp-ia">${esc(t('pp_ai'))}</button><div id="pp-erro"></div>
                ${campo(t('pp_f_summary'), `<textarea data-d="resumo" rows="7" maxlength="2500">${esc(d.resumo)}</textarea>`)}
                ${campo(t('pp_f_objectives'), `<textarea data-d="objetivos" data-linhas rows="5">${esc(d.objetivos.join('\n'))}</textarea>`)}
                ${campo(t('pp_f_steps'), `<textarea data-d="passos" data-passos rows="5">${esc(passosTexto(d.passos))}</textarea>`)}
                ${campo(t('pp_f_why'), `<textarea data-d="porque" data-linhas rows="4">${esc(d.porque.join('\n'))}</textarea>`)}
                ${campo(t('pp_f_terms_list'), `<textarea data-d="termos" data-linhas rows="6">${esc(d.termos.join('\n'))}</textarea>`)}
                ${campo(t('pp_f_closing'), `<textarea data-d="notas_finais" rows="3" maxlength="600">${esc(d.notas_finais)}</textarea>`)}</div></section></div>`;
    }

    function mostrarEditor() {
        $('doc-lista').hidden = true; $('doc-editor').hidden = false;
        desenharEditor();
        window.scrollTo({ top: 0 });
    }
    function desenharEditor() {
        if (!ed) return;
        $('doc-editor').innerHTML = `<div class="pp-barra"><button type="button" class="btn-link" id="pp-voltar">← ${esc(t('pp_back'))}</button>
                <span class="pp-barra-btns">${podeEditar ? `<button type="button" class="btn btn-secundario" id="pp-guardar">${esc(t('pp_save'))}</button>` : ''}
                <button type="button" class="btn" id="pp-pdf">${esc(t('pp_download'))}</button></span></div>
            <p class="nota pp-dica">${esc(t('pp_print_hint'))}</p><div id="pp-aviso-ed"></div>
            <div class="pp-editor">${formularioHtml()}<aside class="pp-previa"><h2>${esc(t('pp_preview'))}</h2><div class="prop-papel" id="pp-papel"></div></aside></div>`;
        previa();
    }

    // ---------- pré-visualização ----------
    let tPrevia = null;
    const proposta = () => ({ numero: ed.numero || '', criado_em: ed.criado_em || new Date().toISOString(), empresa: ed.empresa || {}, dados: paraServidor() });
    function previa() {
        const caixa = $('pp-papel'); if (!caixa || !ed) return;
        caixa.innerHTML = Proposta.render(proposta(), marca());
        const larg = caixa.clientWidth - 36;
        caixa.style.setProperty('--prop-zoom', String(Math.max(0.3, Math.min(1, larg / 794))));
    }
    const previaDepois = () => { clearTimeout(tPrevia); tPrevia = setTimeout(previa, 150); };
    window.addEventListener('resize', previaDepois);

    // ---------- editor: eventos ----------
    const definir = (obj, caminho, valor) => { const ps = caminho.split('.'); let o = obj; ps.slice(0, -1).forEach((p) => { o = o[p]; }); o[ps.at(-1)] = valor; };
    const lerPassos = (txt) => linhas(txt).map((l) => { const k = l.indexOf(':'); return k > 0 ? { titulo: l.slice(0, k).trim(), texto: l.slice(k + 1).trim() } : { titulo: l, texto: '' }; });
    const avisoEd = (txt, erro = false) => { const e = $('pp-aviso-ed'); if (e) e.innerHTML = txt ? `<div class="${erro ? 'erro-ui' : 'aviso-ok'}" role="${erro ? 'alert' : 'status'}">${esc(txt)}</div>` : ''; if (txt) { clearTimeout(temporizador); temporizador = setTimeout(() => { const x = $('pp-aviso-ed'); if (x) x.innerHTML = ''; }, 5000); } };

    $('doc-editor').addEventListener('input', (ev) => {
        if (!ed) return;
        const el = ev.target;
        const it = el.closest('[data-i]');
        if (it && el.dataset.f) {
            const item = ed.dados.itens[Number(it.dataset.i)];
            item[el.dataset.f] = el.hasAttribute('data-linhas') ? linhas(el.value) : el.value;
            if (el.dataset.f === 'nome') it.querySelector('.pp-item-cab b').textContent = el.value || t('pp_f_custom');
        } else if (el.dataset.d) {
            definir(ed.dados, el.dataset.d, el.hasAttribute('data-passos') ? lerPassos(el.value) : el.hasAttribute('data-linhas') ? linhas(el.value) : el.value);
        } else return;
        previaDepois();
    });

    $('doc-editor').addEventListener('change', (ev) => {
        if (!ed) return;
        const el = ev.target;
        if (el.id === 'pp-lead') {
            const l = elegiveis.find((x) => x.lead_id === el.value);
            ed.leadId = l ? l.lead_id : ''; ed.empresa = l ? l.empresa : {}; ed.decisores = l ? l.decisores : [];
            if (l) { mudarIdioma(l.idioma); if (l.servico_sugerido && !ed.dados.itens.length) ed.dados.itens.push(padraoItem(l.servico_sugerido, ed.dados.idioma)); }
            if (l && l.decisores.length === 1 && !ed.dados.destinatario.nome) ed.dados.destinatario = { nome: l.decisores[0].nome || '', cargo: l.decisores[0].cargo || '' };
            desenharEditor();
        } else if (el.id === 'pp-pessoa') {
            const p = ed.decisores[Number(el.value)];
            if (p) { ed.dados.destinatario = { nome: p.nome || '', cargo: p.cargo || '' }; desenharEditor(); }
        } else if (el.id === 'pp-idioma') { mudarIdioma(el.value); desenharEditor(); }
        else if (el.dataset.f === 'modelo' && el.closest('[data-i]')) { ed.dados.itens[Number(el.closest('[data-i]').dataset.i)].modelo = el.value; desenharEditor(); }
        else if (el.dataset.d === 'moeda') { ed.dados.moeda = el.value; desenharEditor(); }
        else if (el.dataset.d === 'iva') { ed.dados.iva = el.value; previa(); }
    });

    $('doc-editor').addEventListener('click', async (ev) => {
        if (!ed) return;
        const alvo = ev.target;
        if (alvo.closest('#pp-voltar')) { fecharEditor(); return; }
        if (alvo.closest('#pp-add-btn')) {
            ed.dados.itens.push(padraoItem($('pp-add').value, ed.dados.idioma)); desenharEditor(); return;
        }
        const it = alvo.closest('[data-i]');
        if (it && alvo.closest('[data-remover]')) { ed.dados.itens.splice(Number(it.dataset.i), 1); desenharEditor(); return; }
        if (it && alvo.closest('[data-mover]')) {
            const n = Number(it.dataset.i), m = n + Number(alvo.closest('[data-mover]').dataset.mover), l = ed.dados.itens;
            if (m >= 0 && m < l.length) { [l[n], l[m]] = [l[m], l[n]]; desenharEditor(); }
            return;
        }
        if (alvo.closest('#pp-ia')) { await sugerirIA(alvo.closest('#pp-ia')); return; }
        if (alvo.closest('#pp-guardar')) { await guardar(); return; }
        if (alvo.closest('#pp-pdf')) {
            const gravada = podeEditar ? await guardar({ silencioso: true }) : null;
            if (podeEditar && !gravada) return;
            Proposta.imprimir({ ...proposta(), dados: gravada ? gravada.dados : paraServidor() }, marca());
        }
    });

    async function sugerirIA(botao) {
        if (!ed.leadId) { avisoEd(t('pp_need_lead'), true); return; }
        if (!ed.dados.itens.length) { avisoEd(t('pp_need_service'), true); return; }
        if (ed.dados.resumo && !window.confirm(t('pp_ai_overwrite'))) return;
        const antes = botao.textContent; botao.disabled = true; botao.textContent = t('pp_ai_writing');
        try {
            const r = await api(`/api/documentos/leads/${encodeURIComponent(ed.leadId)}/sugestao`, { method: 'POST', body: JSON.stringify({ idioma: ed.dados.idioma, itens: ed.dados.itens.map((i) => ({ servico: i.servico, nome: i.nome })) }) });
            ed.dados.titulo = r.titulo; ed.dados.resumo = r.resumo; ed.dados.objetivos = r.objetivos;
            r.itens.forEach((x, n) => { if (ed.dados.itens[n]) { ed.dados.itens[n].descricao = x.descricao; ed.dados.itens[n].entregaveis = x.entregaveis; } });
            desenharEditor();
        } catch (e) { botao.disabled = false; botao.textContent = antes; const c = $('pp-erro'); if (c) c.innerHTML = `<div class="erro-ui" role="alert">${esc(mensagemErro(e, t('pp_err_ai')))}</div>`; }
    }

    // devolve a proposta guardada (ou null se falhou)
    async function guardar({ silencioso = false } = {}) {
        if (!ed.id && !ed.leadId) { avisoEd(t('pp_need_lead'), true); return null; }
        if (!ed.dados.itens.length) { avisoEd(t('pp_need_service'), true); return null; }
        try {
            const corpo = JSON.stringify(paraServidor());
            const r = ed.id ? await api(`/api/documentos/propostas/${encodeURIComponent(ed.id)}`, { method: 'PUT', body: corpo })
                : await api(`/api/documentos/leads/${encodeURIComponent(ed.leadId)}/propostas`, { method: 'POST', body: corpo });
            ed.id = r.id; ed.numero = r.numero; ed.criado_em = r.criado_em;
            ed.dados.assinante = r.dados.assinante;
            if (!silencioso) avisoEd(t('pp_saved'));
            previa();
            return r;
        } catch (e) { avisoEd(mensagemErro(e, t('pp_err_save')), true); return null; }
    }

    I18N.aoMudar(() => { if (ed) { const sy = window.scrollY; desenharEditor(); window.scrollTo({ top: sy }); } else desenharLista(); });
    // vindo de um negócio: /documents.html#proposta=<id> abre logo essa proposta
    async function abrirDoEndereco() {
        const m = /^#proposta=([0-9a-f-]{36})$/i.exec(location.hash);
        if (!m || ed) return;
        history.replaceState(null, '', location.pathname + location.search);
        try { abrirExistente(await api(`/api/documentos/propostas/${encodeURIComponent(m[1])}`)); } catch (e) { aviso(mensagemErro(e, t('pp_err_save')), true); }
    }
    // vindo da página Clientes: /documents.html#novo=<lead>&servicos=a,b prepara uma proposta nova para esse cliente, já com os serviços escolhidos
    async function abrirNovoDoEndereco() {
        const m = /^#novo=([0-9a-f-]{36})(?:&servicos=([a-z_,]*))?$/i.exec(location.hash);
        if (!m || ed || !podeEditar) return;
        history.replaceState(null, '', location.pathname + location.search);
        try {
            const l = (await api(`/api/documentos/elegiveis?cliente=${encodeURIComponent(m[1])}`)).leads.find((x) => x.lead_id === m[1]);
            if (!l) return;
            elegiveis = elegiveis.some((x) => x.lead_id === l.lead_id) ? elegiveis : [...elegiveis, l];
            abrirNova();
            ed.leadId = l.lead_id; ed.empresa = l.empresa; ed.decisores = l.decisores; mudarIdioma(l.idioma);
            const pedidos = (m[2] || '').split(',').filter((s) => SERVICOS.includes(s));
            (pedidos.length ? pedidos : (l.servico_sugerido ? [l.servico_sugerido] : [])).forEach((s) => ed.dados.itens.push(padraoItem(s, ed.dados.idioma)));
            if (l.decisores.length === 1) ed.dados.destinatario = { nome: l.decisores[0].nome || '', cargo: l.decisores[0].cargo || '' };
            desenharEditor();
        } catch (e) { aviso(mensagemErro(e, t('pp_err_save')), true); }
    }
    carregar().then(abrirDoEndereco).then(abrirNovoDoEndereco);
})();

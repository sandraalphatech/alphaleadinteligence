/* radar.js: pesquisa de empresas com filtros (textos vêm de i18n.js) */

(async () => {
    const { api, esc } = NS;
    const t = I18N.t;
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();

    let catalogo = null;                 // opções dos filtros (vêm da API)
    let resultado = null;                // última resposta da pesquisa
    let pagina = 1;
    let falhou = false;
    let pedido = 0;                      // evita que uma resposta antiga substitua uma mais recente

    // Quem só tem permissão de leitura não vê o botão "Contact"
    const podeContactar = !!utilizador && utilizador.papel !== 'leitura';

    // Os textos escritos pela IA estão em português; as versões em inglês e espanhol vêm em "traducoes".
    // Sem tradução (ainda não feita), mostra o original.
    const texto = (obj, campo) => {
        const idioma = I18N.idioma();
        return (idioma !== 'pt' && obj.traducoes?.[idioma]?.[campo]) || obj[campo];
    };

    // ---------- nomes traduzidos ----------
    const nomePais = (codigo) => {
        try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(codigo) || codigo; }
        catch { return codigo; }
    };
    const nomeIdioma = (codigo) => {
        try {
            const nome = new Intl.DisplayNames([I18N.locale()], { type: 'language' }).of(codigo) || codigo;
            return nome.charAt(0).toUpperCase() + nome.slice(1);
        } catch { return codigo; }
    };
    const traduzir = (prefixo, valor) => {
        const texto = t(prefixo + valor);
        return texto === prefixo + valor ? valor : texto;
    };

    // ---------- filtros ----------
    const CAMPOS = { regiao: 'f-regiao', pais: 'f-pais', idioma: 'f-idioma', sector: 'f-sector', servico: 'f-servico' };

    // Preenche um <select>, mantendo a escolha actual (importante ao mudar de idioma)
    function preencher(id, opcoes) {
        const select = $(id);
        const actual = select.value;
        select.innerHTML = `<option value="">${esc(t('f_all'))}</option>` +
            opcoes.map(([valor, texto]) => `<option value="${esc(valor)}">${esc(texto)}</option>`).join('');
        select.value = actual;
    }

    function desenharFiltros() {
        if (!catalogo) return;
        const regiaoEscolhida = $('f-regiao').value;

        preencher('f-regiao', catalogo.regioes.map((r) => [r.id, traduzir('regiao_', r.id)]));

        // Os países dependem da região escolhida (sem região: todos, por ordem alfabética)
        const paises = catalogo.regioes
            .filter((r) => !regiaoEscolhida || r.id === regiaoEscolhida)
            .flatMap((r) => r.paises)
            .map((c) => [c, nomePais(c)])
            .sort((a, b) => a[1].localeCompare(b[1], I18N.locale()));
        const paisActual = $('f-pais').value;
        preencher('f-pais', paises);
        if (!paises.some(([c]) => c === paisActual)) $('f-pais').value = '';

        preencher('f-idioma', catalogo.idiomas.map((i) => [i, nomeIdioma(i)]));
        preencher('f-sector', catalogo.sectores
            .map((s) => [s, traduzir('sector_', s)])
            .sort((a, b) => a[0] === 'outro' ? 1 : b[0] === 'outro' ? -1 : a[1].localeCompare(b[1], I18N.locale())));
        preencher('f-servico', catalogo.servicos.map((s) => [s, NS.servico(s)]));

        $('f-q').placeholder = t('f_search_ph');
    }

    // ---------- resultados ----------
    function etiquetaStartup(e) {
        // grandes empresas, projetos individuais e outros: não são alvo da Alpha Tech
        if (['grande_empresa', 'projeto_individual', 'outro'].includes(e.tipo_empresa)) return `<span class="badge frio">${t('tipo_' + e.tipo_empresa)}</span>`;
        if (e.tipo_empresa === 'pme') return `<span class="badge morno">${t('tipo_pme')}</span>`;
        // o tipo classificado manda: uma "startup" com 2 pilares continua startup (antes dizia "Other")
        // empresas adicionadas à mão nunca passaram pela avaliação dos 4 pilares: mostramos só "Startup", sem "0/4"
        if (e.e_startup || e.tipo_empresa === 'startup') return `<span class="badge quente">${t('badge_startup')}${e.pilares_cumpridos != null ? ` · ${e.pilares_cumpridos}/4` : ''}</span>`;
        return `<span class="badge frio">${t('badge_other')}</span>`;
    }

    function etiquetaPontos(p) {
        if (p === null || p === undefined) return `<span class="badge novo">${t('badge_new')}</span>`;
        if (p >= 70) return `<span class="badge quente">${t('badge_hot')} · ${p}</span>`;
        if (p >= 40) return `<span class="badge morno">${t('badge_warm')} · ${p}</span>`;
        return `<span class="badge frio">${t('badge_cold')} · ${p}</span>`;
    }

    function linha(e) {
        const detalhes = [
            e.sector ? traduzir('sector_', e.sector) : null,
            [e.cidade, e.pais ? nomePais(e.pais) : null].filter(Boolean).join(', ') || null,
            e.idioma ? nomeIdioma(e.idioma) : null
        ].filter(Boolean).join(' · ');

        // Só ligamos para endereços http(s) (evita links "javascript:" vindos de fontes externas)
        const seguro = (url) => (/^https?:\/\//i.test(url || '') ? url : null);
        const site = seguro(e.website)
            ? `<a class="link" href="${esc(seguro(e.website))}" target="_blank" rel="noopener noreferrer"${e.website_estado === 'verificado' ? '' : ` title="${esc(t('website_unverified'))}"`}>${esc(e.dominio || e.website)}${e.website_estado === 'verificado' ? ' ✓' : ' ?'}</a>`
            : '';
        const origem = seguro(e.origem_url)
            ? `<a class="link" href="${esc(seguro(e.origem_url))}" target="_blank" rel="noopener noreferrer">${esc(e.origem_titulo || t('source'))}</a>`
            : (e.origem_titulo ? esc(e.origem_titulo) : '');

        const aberta = abertos.has(e.id);
        return `
            <li class="item item-radar">
                <div class="item-logo">${esc((e.nome || '?').charAt(0).toUpperCase())}</div>
                <div class="item-info">
                    <b>${esc(e.nome)}</b>
                    <span>${esc(detalhes || '—')}</span>
                    ${site ? `<span class="origem">${site}</span>` : ''}
                    ${e.descricao ? `<p class="desc">${esc(texto(e, 'descricao'))}</p>` : ''}
                    ${origem ? `<span class="origem">${origem}</span>` : ''}
                    <button type="button" class="btn-link" data-detalhe="${esc(e.id)}" aria-expanded="${aberta}">${esc(t(aberta ? 'detail_hide' : 'detail_show'))}</button>
                </div>
                <div class="item-badges">${etiquetaStartup(e)}${etiquetaPontos(e.melhor_pontuacao)}${podeContactar ? `<button type="button" class="btn-contactar" data-contactar="${esc(e.id)}" aria-haspopup="menu">${esc(t('contact_btn'))} <span aria-hidden="true">▾</span></button>` : ''}</div>
                ${aberta ? `<div class="detalhe">${htmlFicha(e.id)}</div>` : ''}
            </li>`;
    }

    // ---------- ficha da empresa (decisores e contactos que o site dela publica) ----------
    const abertos = new Set();            // empresas com a ficha aberta
    const fichas = new Map();             // id -> dados já carregados (ou { erro: true })
    const REDES = { linkedin: 'LinkedIn', twitter: 'X', github: 'GitHub', instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook' };
    const httpSeguro = (url) => (/^https?:\/\//i.test(url || '') ? url : null);
    const ligacao = (url, texto) => (httpSeguro(url) ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(texto)}</a>` : '');

    function htmlFicha(id) {
        const f = fichas.get(id);
        if (!f) return `<p class="nota">${esc(t('loading'))}</p>`;
        if (f.erro) return `<div class="erro-ui">${esc(t('detail_error'))}</div>`;
        const pendente = f.enriquecida_em ? '' : `<p class="nota">${esc(t('detail_pending'))}</p>`;

        const campo = (rotulo, valor) => (valor ? `<div class="ficha-linha"><b>${esc(t(rotulo))}</b><span>${valor}</span></div>` : '');
        const redes = Object.entries(f.redes || {}).filter(([r]) => REDES[r]).map(([r, u]) => ligacao(u, REDES[r])).filter(Boolean).join(' · ');
        // o WhatsApp só se mostra se for um número internacional (+ e dígitos): é o que o enriquecimento guarda
        const whatsapp = /^\+\d{8,15}$/.test(f.redes?.whatsapp || '') ? `WhatsApp ${esc(f.redes.whatsapp)}` : '';
        const contactos = [f.email_geral ? esc(f.email_geral) : '', f.telefone ? esc(f.telefone) : '', whatsapp].filter(Boolean).join(' · ');

        const pessoas = f.decisores.length
            ? `<ul class="decisores">${f.decisores.map((d) => `
                <li>
                    <div><b>${esc(d.nome)}</b> <span class="nota">${esc(d.cargo || '')}</span> <span class="badge novo">${esc(t('cat_' + d.categoria))}</span>${d.nao_contactar ? ` <span class="badge frio">${esc(t('detail_dnc'))}</span>` : ''}</div>
                    <div class="nota">${[ligacao(d.linkedin_url, 'LinkedIn'), d.email ? esc(d.email) : '', d.fonte_url === 'manual' ? esc(t('detail_manual')) : ligacao(d.fonte_url, t('detail_source')), esc(new Date(d.recolhido_em).toLocaleDateString(I18N.locale()))].filter(Boolean).join(' · ')}</div>
                </li>`).join('')}</ul>`
            : `<p class="nota">${esc(t('detail_no_people'))}</p>`;

        return `${pendente}${htmlAnalise(f)}
                ${campo('detail_type', f.tipo_empresa ? `${esc(t('tipo_' + f.tipo_empresa))}${f.tipo_motivo ? ` <span class="nota">· ${esc(texto(f, 'tipo_motivo'))}</span>` : ''}` : '')}
                ${campo('detail_about', f.sobre ? esc(texto(f, 'sobre')) : '')}
                ${campo('detail_address', f.morada ? esc(f.morada) : '')}
                ${campo('detail_contacts', contactos)}
                ${campo('detail_socials', redes)}
                <div class="ficha-linha"><b>${esc(t('detail_people'))}</b></div>${pessoas}
                ${podeContactar ? htmlEditarContactos(f) : ''}
                ${htmlHistorico(f.historico || [])}`;
    }

    // ---------- acrescentar contatos à mão ----------
    function htmlEditarContactos(f) {
        const entrada = (nome, rotulo, valor = '', extra = '') =>
            `<label class="contacto-campo"><span>${esc(t(rotulo))}</span><input name="${nome}" value="${esc(valor)}" maxlength="200" autocomplete="off" ${extra}></label>`;
        const formulario = (tipo, titulo, campos) => `
            <details class="contacto-novo">
                <summary class="link">${esc(t(titulo))}</summary>
                <form data-form="${tipo}" data-empresa="${esc(f.id)}" novalidate>
                    <div class="contacto-grelha">${campos}</div>
                    <p class="erro-ui" role="alert" hidden></p>
                    <button type="submit" class="btn btn-primary">${esc(t('ct_save'))}</button>
                </form>
            </details>`;
        return formulario('contactos', 'ct_edit_company',
                entrada('email', 'ct_email', f.email_geral || '', 'type="email"') +
                entrada('telefone', 'ct_phone', f.telefone || '', 'type="tel" placeholder="+55 11 91234-5678"') +
                entrada('whatsapp', 'ct_whatsapp', f.redes?.whatsapp || '', 'type="tel" placeholder="+351 912 345 678"') +
                entrada('instagram', 'ct_instagram', f.redes?.instagram || '', 'placeholder="@empresa"') +
                entrada('linkedin', 'ct_linkedin', f.redes?.linkedin || '', 'placeholder="linkedin.com/company/…"'))
            + formulario('pessoas', 'ct_add_person',
                entrada('nome', 'ct_name') + entrada('cargo', 'ct_role') + entrada('email', 'ct_email', '', 'type="email"') +
                entrada('linkedin', 'ct_linkedin', '', 'placeholder="linkedin.com/in/…"'));
    }

    $('radar-lista').addEventListener('submit', async (ev) => {
        const form = ev.target.closest('form[data-form]');
        if (!form) return;
        ev.preventDefault();
        const { form: tipo, empresa: id } = form.dataset;
        const botao = form.querySelector('button[type="submit"]');
        const aviso = form.querySelector('[role="alert"]');
        botao.disabled = true;
        aviso.hidden = true;
        try {
            await api(`/api/radar/empresas/${encodeURIComponent(id)}/${tipo}`, {
                method: tipo === 'contactos' ? 'PUT' : 'POST',
                body: JSON.stringify(Object.fromEntries(new FormData(form)))
            });
        } catch (erro) {
            aviso.textContent = erro.message;
            aviso.hidden = false;
            botao.disabled = false;
            return;
        }
        try { fichas.set(id, await api('/api/radar/empresas/' + encodeURIComponent(id))); }
        catch { fichas.set(id, { erro: true }); }
        desenharResultados();
    });

    // ---------- análise da oportunidade (Etapa 6) ----------
    // Os textos da análise vêm como { pt, en, es }: mostramos o do idioma escolhido, ou o português.
    const idioma = (obj) => (obj ? (obj[I18N.idioma()] || obj.pt || '') : '');
    const CLASSE_FORCA = { alta: 'quente', media: 'morno', baixa: 'frio' };
    const CRITERIOS = ['intencao_compra', 'adequacao_servicos', 'qualidade_evidencias', 'potencial_comercial'];
    const PARCELAS = ['pontuacao', 'frescura', 'contactabilidade', 'servico'];

    function htmlAnalise(f) {
        const l = f.lead;
        if (!l) return '';
        const cabecalho = `<h4>${esc(t('an_title'))}</h4>`;
        const a = l.analise;
        if (!a) return `<div class="analise">${cabecalho}<p class="nota">${esc(t('an_none'))}</p></div>`;

        const lista = (itens) => (itens.length ? `<ul class="an-lista">${itens.join('')}</ul>` : '');
        const bloco = (chave, corpo) => (corpo ? `<div class="an-bloco"><b>${esc(t(chave))}</b>${corpo}</div>` : '');

        const criterios = CRITERIOS.map((c) => `<div class="crit"><span>${esc(t('crit_' + c))}</span><div class="barra"><i style="width:${Math.max(0, Math.min(100, l[c] ?? 0))}%"></i></div><b>${esc(l[c] ?? '–')}</b></div>`).join('');
        const prioridade = l.prioridade
            ? PARCELAS.map((p) => `${esc(t('pri_' + p))} <b>${esc(l.prioridade.componentes[p])}</b> <span class="nota">(${Math.round(l.prioridade.pesos[p] * 100)}%)</span>`).join(' · ')
            : '';

        const sinais = lista((a.sinais || []).map((s) => `<li><span class="badge ${CLASSE_FORCA[s.forca] || 'frio'}">${esc(traduzir('forca_', s.forca))}</span> <b>${esc(traduzir('sinal_', s.tipo))}</b>: ${esc(idioma(s.evidencia))} <span class="nota">· ${esc(traduzir('fonte_', s.fonte))}${s.data ? ' · ' + esc(s.data) : ''}</span></li>`));
        const necessidades = lista((a.necessidades || []).map((n) => `<li>${esc(idioma(n.necessidade))}${n.servico ? ` <span class="badge novo">${esc(NS.servico(n.servico))}</span>` : ''}<br><span class="nota">${esc(idioma(n.evidencia))}</span></li>`));
        const servicos = (a.servicos || []).length
            ? `<ol class="an-lista">${a.servicos.map((s) => `<li><b>${esc(NS.servico(s.servico))}</b>: ${esc(idioma(s.motivo))}</li>`).join('')}</ol>` : '';
        const contacto = a.contacto
            ? `<p><b>${esc(a.contacto.nome)}</b>${a.contacto.cargo ? `, ${esc(a.contacto.cargo)}` : ''} <span class="badge novo">${esc(traduzir('cat_', a.contacto.categoria))}</span><br><span class="nota">${esc(idioma(a.contacto.motivo))}</span></p>` : '';
        const duvidas = lista((a.duvidas || []).map((d) => `<li>${esc(idioma(d))}</li>`));
        const quando = l.analisada_em ? new Date(l.analisada_em).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        return `<div class="analise">
            ${cabecalho}
            <div class="an-cab">${etiquetaPontos(l.pontuacao)} ${l.prioridade ? `<span class="badge novo">${esc(t('an_priority'))} ${esc(l.prioridade.valor)}</span>` : ''}</div>
            <p class="an-resumo">${esc(idioma(a.resumo))}</p>
            <div class="criterios">${criterios}</div>
            ${prioridade ? `<p class="nota an-prio">${esc(t('an_priority'))}: ${prioridade}</p>` : ''}
            ${bloco('an_signals', sinais)}${bloco('an_needs', necessidades)}${bloco('an_services', servicos)}${bloco('an_contact', contacto)}
            ${bloco('an_approach', a.abordagem ? `<p>${esc(idioma(a.abordagem))}</p>` : '')}${bloco('an_doubts', duvidas)}
            <p class="nota">${esc(t('an_by').replace('{d}', quando).replace('{m}', (l.analise_modelo || '').replace('claude-', '')))}</p>
        </div>`;
    }

    // Histórico: cada alteração à empresa, aos decisores e ao lead (quem a fez, quando, de quê para quê)
    const valorCurto = (v) => (v === null || v === undefined || v === '' ? '—' : String(v).length > 60 ? String(v).slice(0, 59) + '…' : String(v));
    const nomeCampo = (c) => { const k = 'campo_' + c.replace(/[^\w]/g, ''); const txt = t(k); return txt === k ? c : txt; };
    const nomeOrigem = (o) => { const k = 'origem_' + o; const txt = t(k); return txt === k ? o : txt; };

    // Os valores guardados são códigos internos (startup, analisado, valido, PT, fintech...): traduzimos os que conhecemos.
    // Um valor desconhecido aparece tal como está.
    const TRADUZIR_VALOR = {
        tipo_empresa: (v) => traduzir('tipo_', v),
        categoria: (v) => traduzir('cat_', v),
        estado: (v) => NS.estado(v),
        servico_interesse: (v) => NS.servico(v),
        sector: (v) => traduzir('sector_', v),
        regiao: (v) => traduzir('regiao_', v),
        pais: (v) => nomePais(v),
        idioma: (v) => nomeIdioma(v),
        website_estado: (v) => traduzir('wsestado_', v),
        email_geral_estado: (v) => traduzir('emailestado_', v),
        email_estado: (v) => traduzir('emailestado_', v),
        e_startup: (v) => traduzir('val_', v),
        nao_contactar: (v) => traduzir('val_', v)
    };
    const valorHistorico = (campo, v) => (v === null || v === undefined || v === '' ? v : (TRADUZIR_VALOR[campo] ? TRADUZIR_VALOR[campo](String(v)) : v));

    function htmlHistorico(h) {
        if (!h.length) return '';
        const linhas = h.map((x) => {
            const campo = x.campo.startsWith('(') ? t('campo_' + x.campo.replace(/[()\s]/g, '')) : nomeCampo(x.campo);
            const quem = x.entidade === 'decisor' ? `${esc(t('detail_person'))} ${esc(x.rotulo || '')}: ` : x.entidade === 'lead' ? `${esc(t('detail_lead'))}: ` : '';
            const antigo = valorHistorico(x.campo, x.valor_antigo), novo = valorHistorico(x.campo, x.valor_novo);
            const mudanca = x.campo.startsWith('(') ? esc(valorCurto(x.valor_novo || x.valor_antigo)) : `${esc(valorCurto(antigo))} → ${esc(valorCurto(novo))}`;
            return `<li><span class="nota">${esc(new Date(x.criado_em).toLocaleString(I18N.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(nomeOrigem(x.origem))}</span><br>${quem}<b>${esc(campo)}</b>: ${mudanca}</li>`;
        }).join('');
        return `<details class="historico"><summary>${esc(t('hist_title'))} (${h.length})</summary><ul>${linhas}</ul></details>`;
    }

    function desenharResultados() {
        const titulo = $('radar-total');
        const lista = $('radar-lista');
        const paginas = $('radar-paginas');
        titulo.removeAttribute('data-i18n');

        if (falhou) {
            titulo.textContent = '';
            lista.innerHTML = `<div class="erro-ui">${esc(t('err_load'))}</div>`;
            paginas.hidden = true;
            return;
        }
        if (!resultado) return;

        titulo.textContent = t(resultado.total === 1 ? 'radar_one' : 'radar_many').replace('{n}', resultado.total);

        lista.innerHTML = resultado.empresas.length
            ? `<ul class="lista">${resultado.empresas.map(linha).join('')}</ul>`
            : `<div class="vazio"><b>${t('radar_empty_t')}</b><span>${t('radar_empty_s')}</span></div>`;

        const total = Math.max(1, Math.ceil(resultado.total / resultado.por_pagina));
        paginas.hidden = total <= 1;
        $('p-info').textContent = t('page_of').replace('{a}', resultado.pagina).replace('{b}', total);
        $('p-ant').disabled = resultado.pagina <= 1;
        $('p-seg').disabled = resultado.pagina >= total;
    }

    // ---------- pesquisar ----------
    async function pesquisar() {
        const n = ++pedido;
        const params = new URLSearchParams({ pagina });
        const q = $('f-q').value.trim();
        if (q) params.set('q', q);
        for (const [nome, id] of Object.entries(CAMPOS)) if ($(id).value) params.set(nome, $(id).value);
        if ($('f-startup').checked) params.set('startup', '1');
        if ($('f-alvo').checked) params.set('alvo', '1');

        try {
            const r = await api('/api/radar/empresas?' + params);
            if (n !== pedido) return;            // chegou uma pesquisa mais recente entretanto
            resultado = r;
            falhou = false;
        } catch {
            if (n !== pedido) return;
            falhou = true;
        }
        desenharResultados();
    }

    // Abrir/fechar a ficha de uma empresa (carrega os dados só na primeira vez)
    // Botão "Contact": abre o menu de canais (Email, LinkedIn, Instagram, WhatsApp)
    $('radar-lista').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-contactar]');
        if (!b) return;
        const empresa = resultado?.empresas.find((x) => x.id === b.dataset.contactar);
        if (empresa) Contact.menu(b, { id: empresa.id, nome: empresa.nome }, (id) => { fichas.delete(id); pesquisar(); });
    });

    $('radar-lista').addEventListener('click', async (ev) => {
        const botao = ev.target.closest('[data-detalhe]');
        if (!botao) return;
        const id = botao.dataset.detalhe;
        if (abertos.has(id)) abertos.delete(id); else abertos.add(id);
        desenharResultados();

        if (abertos.has(id) && !fichas.has(id)) {
            try { fichas.set(id, await api('/api/radar/empresas/' + encodeURIComponent(id))); }
            catch { fichas.set(id, { erro: true }); }
            desenharResultados();
        }
    });

    // Qualquer mudança de filtro volta à página 1
    const novaPesquisa = () => { pagina = 1; pesquisar(); };

    let atraso;
    $('f-q').addEventListener('input', () => { clearTimeout(atraso); atraso = setTimeout(novaPesquisa, 350); });
    ['f-idioma', 'f-sector', 'f-servico', 'f-pais', 'f-startup', 'f-alvo'].forEach((id) => $(id).addEventListener('change', novaPesquisa));
    $('f-regiao').addEventListener('change', () => { desenharFiltros(); novaPesquisa(); });
    $('form-radar').addEventListener('submit', (e) => { e.preventDefault(); novaPesquisa(); });

    $('f-limpar').addEventListener('click', () => {
        $('f-q').value = '';
        Object.values(CAMPOS).forEach((id) => { $(id).value = ''; });
        $('f-startup').checked = false;
        $('f-alvo').checked = true;                 // "só alvos" é o estado normal
        desenharFiltros();
        novaPesquisa();
    });

    $('p-ant').addEventListener('click', () => { pagina -= 1; pesquisar(); });
    $('p-seg').addEventListener('click', () => { pagina += 1; pesquisar(); });

    // ---------- recolha de novas oportunidades ----------
    // Guardamos a chave da mensagem (e não o texto) para a poder traduzir se o idioma mudar
    let execucao = null;          // última recolha conhecida
    let mensagemErro = null;      // chave de erro ao iniciar (ex.: 'collect_busy')
    let sondagem = null;

    const botao = $('btn-recolher');
    const dataHora = (iso) => new Date(iso).toLocaleString(I18N.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    function desenharRecolha() {
        const estado = $('recolha-estado');
        estado.className = '';
        const a = execucao;

        if (mensagemErro) { estado.className = 'erro'; estado.textContent = t(mensagemErro); }
        else if (!a) estado.textContent = t('collect_never');
        else if (a.estado === 'a_correr') {
            // depois da recolha, as empresas novas passam por identificação, enriquecimento e validação
            const fase = a.fase && a.fase !== 'recolha' ? t('collect_phase_' + a.fase) : null;
            estado.textContent = fase
                ? t('collect_running_phase').replace('{f}', fase).replace('{e}', a.empresas_criadas)
                : t('collect_running').replace('{a}', a.itens_analisados).replace('{e}', a.empresas_criadas);
        } else if (a.estado === 'falhou') {
            estado.className = 'erro'; estado.textContent = t('collect_failed');
        } else {
            estado.textContent = t('collect_done').replace('{d}', dataHora(a.concluida_em || a.iniciada_em))
                .replace('{e}', a.empresas_criadas).replace('{l}', a.leads_criados);
        }
        botao.disabled = !!a && a.estado === 'a_correr';
    }

    async function actualizarRecolha() {
        try {
            execucao = (await api('/api/radar/execucoes'))[0] || null;
        } catch { /* mantém o que já tínhamos */ }
        desenharRecolha();

        if (execucao && execucao.estado === 'a_correr') {
            clearTimeout(sondagem);
            sondagem = setTimeout(actualizarRecolha, 3000);        // volta a perguntar de 3 em 3 segundos
        } else if (sondagem) {
            sondagem = null;
            pesquisar();                                            // terminou: mostra as empresas novas
        }
    }

    botao.addEventListener('click', async () => {
        mensagemErro = null;
        botao.disabled = true;
        try {
            await api('/api/radar/recolher', { method: 'POST', body: JSON.stringify({}) });
            sondagem = true;
        } catch (e) {
            mensagemErro = e.status === 409 ? 'collect_busy' : e.status === 503 ? 'collect_nokey' : e.status === 403 ? 'collect_forbidden' : 'collect_error';
        }
        await actualizarRecolha();
    });

    I18N.aoMudar(() => { desenharFiltros(); desenharResultados(); desenharRecolha(); });

    // ---------- arranque ----------
    try {
        catalogo = await api('/api/radar/filtros');
        desenharFiltros();
    } catch { falhou = true; }

    // Quem só tem permissão de leitura não vê o botão de recolha
    if (utilizador && utilizador.papel !== 'leitura') {
        $('recolha').hidden = false;
        actualizarRecolha();
    }
    await pesquisar();
})();

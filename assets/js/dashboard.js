/* dashboard.js: painel "Hoje" (textos vêm de i18n.js) */

(async () => {
    const { api, esc } = NS;
    const t = I18N.t;
    const $ = (id) => document.getElementById(id);

    const utilizador = await NS.iniciar();

    // Dados carregados da API. Guardamos para redesenhar quando o idioma muda.
    let resumo = null;
    let hoje = null;
    let tarefas = null;          // tarefas por fazer (atrasadas e a vencer); null se a base de dados ainda não as tem
    let falhou = false;
    let contactar = null;        // /api/pipeline/hoje: o que contactar hoje, por canal, e as respostas à espera; null se falhar (usa a lista antiga)
    let separadorHoje = null;    // separador escolhido; por defeito o primeiro com trabalho
    const podeEditar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);
    const CANAIS_HOJE = ['email', 'linkedin', 'instagram', 'whatsapp'];

    // ---------- saudação e data ----------
    function cabecalho() {
        const hora = new Date().getHours();
        const saudacao = hora < 12 ? t('greet_morning') : hora < 20 ? t('greet_afternoon') : t('greet_evening');
        const primeiroNome = utilizador ? utilizador.nome.split(' ')[0] : '';
        const titulo = $('titulo');
        titulo.removeAttribute('data-i18n');
        titulo.textContent = saudacao + (primeiroNome ? ', ' + primeiroNome : '');
        $('data').textContent = new Date().toLocaleDateString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    // ---------- pontuação -> etiqueta ----------
    function etiqueta(pontos) {
        if (pontos === null || pontos === undefined) return `<span class="badge novo">${t('badge_new')}</span>`;
        if (pontos >= 70) return `<span class="badge quente">${t('badge_hot')} · ${pontos}</span>`;
        if (pontos >= 40) return `<span class="badge morno">${t('badge_warm')} · ${pontos}</span>`;
        return `<span class="badge frio">${t('badge_cold')} · ${pontos}</span>`;
    }

    const diasTexto = (iso) => {
        const n = Math.floor((Date.now() - new Date(iso)) / 86400000);
        return n === 1 ? t('day_one') : t('days').replace('{n}', n);
    };

    // ---------- uma linha da lista ----------
    function linha(lead, textoDireita) {
        const nome = lead.empresas?.nome || t('unnamed');
        // o país está guardado como código ISO (PT, ES...): mostramos o nome no idioma escolhido
        const nomePais = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
        const pais = lead.empresas?.pais ? nomePais(lead.empresas.pais) : null;
        const detalhes = [NS.servico(lead.servico_interesse), pais].filter(Boolean).join(' · ');
        return `
            <li class="item">
                <div class="item-logo">${esc(nome.charAt(0).toUpperCase())}</div>
                <div class="item-info"><b>${esc(nome)}</b><span>${esc(detalhes || NS.estado(lead.estado))}</span></div>
                ${textoDireita}
            </li>`;
    }

    function lista(elemento, leads, textoDireita, chaveTitulo, chaveSub) {
        elemento.innerHTML = leads.length
            ? `<ul class="lista">${leads.map((l) => linha(l, textoDireita(l))).join('')}</ul>`
            : `<div class="vazio"><b>${t(chaveTitulo)}</b><span>${t(chaveSub)}</span></div>`;
    }

    // ---------- prioridades por canal («Contactar hoje») ----------
    const nomePaisHoje = (c) => { try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c) || c; } catch { return c; } };
    const haHoje = (iso) => {
        const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        const f = new Intl.RelativeTimeFormat(I18N.locale(), { numeric: 'auto' });
        return min < 60 ? f.format(-min, 'minute') : min < 1440 ? f.format(-Math.round(min / 60), 'hour') : f.format(-Math.round(min / 1440), 'day');
    };
    const chipTarefa = (x) => (x.tarefa ? `<span class="chip ${x.tarefa.atrasada ? 'atrasada' : 'hoje'}">${esc((x.tarefa.atrasada ? t('ct_task_overdue') : t('ct_task_today')).replace('{t}', x.tarefa.titulo))}</span>` : '');

    function itemCanalHoje(canal, x) {
        const acao = t('ct_act_' + x.acao).replace('{n}', x.numero);
        const detalhe = [x.empresa.pais ? nomePaisHoje(x.empresa.pais) : null, x.destinatario].filter(Boolean).join(' · ');
        return `<li class="ct-item" data-lead="${esc(x.lead_id)}" data-empresa="${esc(x.empresa.id)}" data-nome="${esc(x.empresa.nome || '')}">
            <div class="ct-info"><b>${esc(x.empresa.nome || t('unnamed'))}</b><span class="nota">${esc(detalhe)}</span>
                <span class="ct-chips"><span class="chip">${esc(acao)}</span>${x.pontuacao != null ? `<span class="chip">${esc(String(x.pontuacao))}</span>` : ''}${chipTarefa(x)}</span></div>
            <div class="ct-acoes">${podeEditar ? `<button type="button" class="btn btn-secundario" data-contactar="${canal}">${esc(t('ct_btn_contact'))}</button>` : ''}
                <button type="button" class="btn-link" data-abrir>${esc(t('ct_btn_open'))}</button></div></li>`;
    }
    function itemRespostaHoje(x) {
        return `<li class="ct-item" data-lead="${esc(x.lead_id)}">
            <div class="ct-info"><b>${esc(x.empresa.nome || t('unnamed'))}</b><span class="nota">${esc(t('ch_' + x.canal))} · ${esc(haHoje(x.ocorrida_em))}</span>
                ${x.excerto ? `<span class="ct-excerto">“${esc(x.excerto)}”</span>` : ''}
                <span class="ct-chips">${x.janela_whatsapp ? `<span class="chip chip-ok">${esc(t('ct_wa_window'))}</span>` : ''}${chipTarefa(x)}</span></div>
            <div class="ct-acoes"><button type="button" class="btn btn-secundario" data-abrir>${esc(x.janela_whatsapp ? t('ct_btn_reply') : t('ct_btn_open'))}</button></div></li>`;
    }
    function prioridadesPorCanal() {
        const c = contactar;
        const contagens = { respostas: c.responder.length, ...Object.fromEntries(CANAIS_HOJE.map((k) => [k, c.canais[k].total])) };
        const ordem = ['respostas', ...CANAIS_HOJE];
        if (!separadorHoje || !ordem.includes(separadorHoje)) separadorHoje = ordem.find((k) => contagens[k] > 0) || 'respostas';
        const nome = (k) => (k === 'respostas' ? t('ct_tab_replies') : t('ch_' + k));
        const separadores = `<div class="ct-tabs" role="tablist">${ordem.map((k) => `<button type="button" role="tab" data-separador="${k}" aria-selected="${k === separadorHoje}" class="${k === separadorHoje ? 'on' : ''}">${esc(nome(k))} <b>${contagens[k]}</b></button>`).join('')}</div>`;
        let corpo, rodape = '';
        if (separadorHoje === 'respostas') {
            corpo = c.responder.length ? `<ul class="ct-lista">${c.responder.map(itemRespostaHoje).join('')}</ul>` : `<p class="nota">${esc(t('ct_reply_empty'))}</p>`;
        } else {
            const k = c.canais[separadorHoje];
            corpo = k.itens.length ? `<ul class="ct-lista">${k.itens.map((x) => itemCanalHoje(separadorHoje, x)).join('')}</ul>` : `<p class="nota">${esc(t('ct_channel_empty'))}</p>`;
            rodape = `<p class="nota ct-rodape">${esc(t('ct_left').replace('{n}', k.restante).replace('{l}', k.limite))}${k.total > k.itens.length ? ' · ' + esc(t('ct_more').replace('{n}', k.itens.length).replace('{t}', k.total)) : ''}</p>`;
        }
        $('prioridades').innerHTML = separadores + corpo + rodape;
    }

    // ---------- cartões e funil ----------
    function cartoes() {
        const n = (...estados) => estados.reduce((soma, e) => soma + (resumo.porEstado[e] || 0), 0);
        $('st-novos').textContent = n('novo');
        $('st-contactar').textContent = n('analisado');
        $('st-negociacao').textContent = n('respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada');
        $('st-ganhos').textContent = n('negocio_fechado');

        // funil: barras proporcionais ao estado com mais leads
        const funil = ['novo', 'analisado', 'contactado', 'respondeu', 'reuniao_agendada', 'enviar_proposta', 'proposta_enviada', 'negocio_fechado'];
        const maximo = Math.max(1, ...funil.map((e) => resumo.porEstado[e] || 0));
        $('funil').innerHTML = funil.map((e) => {
            const qtd = resumo.porEstado[e] || 0;
            return `<div class="pipe-row"><span>${NS.estado(e)}</span><b>${qtd}</b>
                    <div class="bar"><i style="width:${(qtd / maximo) * 100}%"></i></div></div>`;
        }).join('');
    }

    // ---------- desenha tudo (corre no arranque e sempre que o idioma muda) ----------
    function desenhar() {
        cabecalho();
        const erroAnterior = document.getElementById('erro-carregar');
        if (erroAnterior) erroAnterior.remove();

        if (falhou) {
            document.querySelector('.content').insertAdjacentHTML('afterbegin',
                `<div class="erro-ui" id="erro-carregar" style="margin-bottom:16px">${esc(t('err_load'))}</div>`);
            return;
        }
        if (!resumo || !hoje) return;   // ainda a carregar: os textos "A carregar…" já estão no HTML

        cartoes();
        // ordenadas pela prioridade (pontuação, atualidade, possibilidade de contacto e serviço); a etiqueta mostra a pontuação
        if (contactar) prioridadesPorCanal();
        else lista($('prioridades'), hoje.prioridades,
            (l) => `<span class="item-badges">${etiqueta(l.pontuacao)}${l.prioridade != null ? `<span class="badge novo" title="${esc(t('an_priority_how'))}">${esc(t('an_priority'))} ${esc(l.prioridade)}</span>` : ''}</span>`,
            'empty_prior_t', 'empty_prior_s');
        if (tarefas) {
            // tarefas com prazo (follow-ups, reuniões, propostas): as atrasadas primeiro
            $('followups-titulo').dataset.i18n = 'card_tasks'; $('followups-titulo').textContent = t('card_tasks');
            $('followups').innerHTML = tarefas.length
                ? `<ul class="lista">${tarefas.map(linhaTarefa).join('')}</ul>`
                : `<div class="vazio"><b>${t('empty_tasks_t')}</b><span>${t('empty_tasks_s')}</span></div>`;
        } else {
            // sem tarefas (base de dados ainda sem a tabela): mantém a lista antiga de leads contactados há dias
            $('followups-titulo').dataset.i18n = 'card_follow'; $('followups-titulo').textContent = t('card_follow');
            lista($('followups'), hoje.followups,
                (l) => `<span class="badge morno">${diasTexto(l.actualizado_em)}</span>`, 'empty_follow_t', 'empty_follow_s');
        }
    }

    // ---------- uma tarefa por fazer ----------
    function linhaTarefa(x) {
        const nome = x.empresas?.nome || t('unnamed');
        const hojeIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
        const dias = Math.round((Date.parse(`${x.prazo}T12:00:00`) - Date.parse(`${hojeIso}T12:00:00`)) / 86400000);
        const prazo = dias < 0 ? [t('tk_overdue').replace('{n}', -dias), 'frio atrasada'] : dias === 0 ? [t('tk_today'), 'morno'] : dias === 1 ? [t('tk_tomorrow'), 'novo'] : [t('tk_in').replace('{n}', dias), 'novo'];
        return `
            <li class="item">
                <div class="item-logo">${esc(nome.charAt(0).toUpperCase())}</div>
                <div class="item-info"><b>${esc(x.titulo)}</b><span>${esc(nome)} · ${esc(t('tt_' + x.tipo))}</span></div>
                <span class="badge ${prazo[1]}">${esc(prazo[0])}</span>
            </li>`;
    }

    // cliques nas prioridades: separadores, abrir o lead (na página Leads) e contactar pelo canal
    $('prioridades').addEventListener('click', (ev) => {
        const sep = ev.target.closest('[data-separador]');
        if (sep) { separadorHoje = sep.dataset.separador; prioridadesPorCanal(); return; }
        const li = ev.target.closest('[data-lead]'); if (!li) return;
        if (ev.target.closest('[data-abrir]')) { location.href = `/assets/pages/leads.html#lead=${encodeURIComponent(li.dataset.lead)}`; return; }
        const b = ev.target.closest('[data-contactar]');
        if (b) Contact[b.dataset.contactar]({ id: li.dataset.empresa, nome: li.dataset.nome }, async () => { try { contactar = await api('/api/pipeline/hoje'); desenhar(); } catch { /* mantém a lista */ } });
    });

    I18N.aoMudar(desenhar);
    desenhar();

    // ---------- carregar dados ----------
    try {
        [resumo, hoje, tarefas, contactar] = await Promise.all([
            api('/api/leads/resumo'), api('/api/leads/hoje'),
            api('/api/pipeline/tarefas?dias=3').then((r) => r.tarefas).catch(() => null),    // se falhar, usa a lista antiga
            api('/api/pipeline/hoje').catch(() => null)                                      // se falhar, usa as prioridades antigas
        ]);
    } catch (e) {
        falhou = true;
    }
    desenhar();
})();

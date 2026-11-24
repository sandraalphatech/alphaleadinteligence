/* reports.js: página «Relatórios». Mostra, para um mês, a atividade, o funil e as conversões, os canais, as propostas, os serviços,
   as fontes e a equipa, sempre com o mês anterior ao lado. Os números vêm prontos de /api/relatorios (o servidor é que calcula). */

(async () => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const $ = (id) => document.getElementById(id);
    const utilizador = await NS.iniciar();
    const podeGerar = !!utilizador && ['admin', 'comercial'].includes(utilizador.papel);

    const agora = () => new Date().toISOString().slice(0, 7);
    let mes = /^\d{4}-\d{2}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : agora();
    let dados = null, falhou = false, pedido = 0;
    let analise = undefined, aGerar = false, erroAnalise = '';     // undefined = a carregar; null = ainda não há; objeto = a análise guardada

    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const nomeMes = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const mudarMes = (m, n) => { const [a, x] = m.split('-').map(Number); return new Date(Date.UTC(a, x - 1 + n, 1)).toISOString().slice(0, 7); };
    const numero = (v) => new Intl.NumberFormat(I18N.locale()).format(v);
    const percentagem = (v) => (v == null ? '–' : `${new Intl.NumberFormat(I18N.locale(), { maximumFractionDigits: 1 }).format(v)} %`);
    const dinheiro = (v, moeda) => new Intl.NumberFormat(I18N.locale(), { style: 'currency', currency: moeda || 'EUR', maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v);

    // variação em relação ao mês anterior: seta, diferença absoluta e, quando faz sentido, a relativa
    function variacao(v, ant, { pp = false } = {}) {
        if (v == null || ant == null) return '<span class="rp-var">–</span>';
        const dif = Math.round((v - ant) * 10) / 10;
        if (dif === 0) return '<span class="rp-var">=</span>';
        const rel = !pp && ant > 0 ? ` (${dif > 0 ? '+' : ''}${Math.round((dif / ant) * 100)} %)` : '';
        const txt = `${dif > 0 ? '▲ +' : '▼ '}${numero(dif)}${pp ? ' ' + t('rp_pp') : ''}${rel}`;
        return `<span class="rp-var ${dif > 0 ? 'sobe' : 'desce'}">${esc(txt)}</span>`;
    }

    // ---------- barra do mês ----------
    function desenharBarra() {
        $('rp-barra').innerHTML = `<div class="rp-meses"><button type="button" class="btn btn-secundario" id="rp-ant" aria-label="${esc(t('rp_prev'))}">‹</button>
            <label class="campo rp-mes"><span class="rp-so-leitor">${esc(t('rp_month'))}</span><input type="month" id="rp-mes" value="${esc(mes)}" min="2020-01" max="${esc(agora())}"></label>
            <button type="button" class="btn btn-secundario" id="rp-seg" aria-label="${esc(t('rp_next'))}" ${mes >= agora() ? 'disabled' : ''}>›</button></div>
            <span class="nota">${esc(sub(t('rp_vs'), { m: nomeMes(mudarMes(mes, -1)) }))}</span>
            <button type="button" class="btn btn-secundario rp-exportar" id="rp-csv" ${dados && !dados.vazio ? '' : 'disabled'}>${esc(t('rp_export'))}</button>`;
    }

    // ---------- carregar ----------
    async function carregar() {
        const n = ++pedido;
        dados = null; falhou = false; desenhar();
        analise = undefined; erroAnalise = '';
        try { const r = await api(`/api/relatorios?mes=${encodeURIComponent(mes)}`); if (n !== pedido) return; dados = r; }
        catch { if (n !== pedido) return; falhou = true; }
        desenharBarra(); desenhar();
        if (!falhou && !dados.vazio) await carregarAnalise(n);
    }
    async function carregarAnalise(n) {
        try { const r = await api(`/api/relatorios/analise?mes=${encodeURIComponent(mes)}&idioma=${I18N.idioma()}`); if (n !== undefined && n !== pedido) return; analise = r.item; }
        catch (e) { if (n !== undefined && n !== pedido) return; analise = null; erroAnalise = e.codigo === 'CONFIG' ? t('ai_err_sql') : ''; }
        desenhar();
    }
    async function gerarAnalise(forcar) {
        if (forcar && !window.confirm(sub(t('ai_confirm_regen'), { m: nomeMes(mes) }))) return;
        aGerar = true; erroAnalise = ''; desenhar();
        try { analise = await api('/api/relatorios/analise', { method: 'POST', body: JSON.stringify({ mes, idioma: I18N.idioma(), forcar }) }); }
        catch (e) { erroAnalise = e.codigo === 'CONFIG' ? t('ai_err_sql') : e.codigo === 'LIMITE' ? t('ai_err_limit') : e.codigo === 'IA' ? t('ai_err_ia') : (e.codigo === 'VAZIO' && e.message) || t('ai_err'); }
        aGerar = false; desenhar();
    }

    // ---------- blocos ----------
    const kpi = (rotulo, par, { pp = false, dica = '', formato = numero } = {}) =>
        `<div class="rp-kpi" ${dica ? `title="${esc(dica)}"` : ''}><span>${esc(rotulo)}</span><b>${esc(par.v == null ? '–' : formato(par.v))}</b>${variacao(par.v, par.ant, { pp })}</div>`;

    function kpisHtml(r) {
        const a = r.atividade;
        return `<div class="rp-kpis">${kpi(t('rp_k_leads'), a.leads_novos)}${kpi(t('rp_k_contacts'), a.contactos)}${kpi(t('rp_k_replies'), a.respostas)}
            ${kpi(t('rp_k_rate'), a.taxa_resposta, { pp: true, formato: percentagem, dica: t('rp_k_rate_hint') })}${kpi(t('rp_k_proposals'), r.propostas.enviadas)}${kpi(t('rp_k_tasks'), a.tarefas_concluidas)}</div>
            <p class="nota rp-sub">${esc(t('rp_k_companies'))}: <b>${numero(a.empresas_novas.v)}</b> · ${esc(t('rp_k_first'))}: <b>${numero(a.primeiros.v)}</b> · ${esc(t('rp_k_follow'))}: <b>${numero(a.followups.v)}</b>
                ${a.tarefas_atrasadas != null ? ` · ${esc(t('rp_k_overdue'))}: <b>${numero(a.tarefas_atrasadas)}</b>` : ''}</p>`;
    }

    function funilHtml(r) {
        const ativos = r.funil.filter((f) => !['proposta_recusada', 'oportunidade_perdida'].includes(f.estado));
        const max = Math.max(1, ...ativos.map((f) => Math.max(f.v, f.ant)));
        const linhas = ativos.map((f) => `<tr><td>${esc(NS.estado(f.estado))}</td><td class="rp-barra-cel"><i style="width:${(f.v / max) * 100}%"></i></td><td class="num"><b>${numero(f.v)}</b></td><td class="num">${numero(f.ant)}</td><td>${variacao(f.v, f.ant)}</td></tr>`).join('');
        const perdidos = r.funil.filter((f) => ['proposta_recusada', 'oportunidade_perdida'].includes(f.estado));
        const conv = r.conversoes.map((c) => `<tr><td>${esc(NS.estado(c.de))} → ${esc(NS.estado(c.para))}</td><td class="num"><b>${esc(percentagem(c.pct))}</b> <small>(${numero(c.para_n)}/${numero(c.de_n)})</small></td><td class="num">${esc(percentagem(c.ant))}</td><td>${variacao(c.pct, c.ant, { pp: true })}</td></tr>`).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('rp_s_funnel'))}</h2></div><div class="card-body">
            <div class="tabela-rolar"><table class="tabela rp-tabela"><thead><tr><th>${esc(t('rp_th_stage'))}</th><th></th><th class="num">${esc(t('rp_th_month'))}</th><th class="num">${esc(t('rp_th_prev'))}</th><th>${esc(t('rp_th_change'))}</th></tr></thead><tbody>${linhas}</tbody></table></div>
            <p class="nota">${esc(t('rp_lost'))}: ${perdidos.map((f) => `${esc(NS.estado(f.estado))} <b>${numero(f.v)}</b>`).join(' · ')}</p>
            <div class="tabela-rolar"><table class="tabela rp-tabela"><thead><tr><th>${esc(t('rp_th_conv'))}</th><th class="num">${esc(t('rp_th_month'))}</th><th class="num">${esc(t('rp_th_prev'))}</th><th>${esc(t('rp_th_change'))}</th></tr></thead><tbody>${conv}</tbody></table></div>
            <p class="nota">${esc(t('rp_conv_note'))}</p></div></section>`;
    }

    function canaisHtml(r) {
        const a = r.atividade;
        const linhas = a.contactos_por_canal.map((c, n) => { const resp = a.respostas_por_canal[n]; return `<tr><td>${esc(t('ch_' + c.canal))}</td><td class="num"><b>${numero(c.v)}</b></td><td class="num">${numero(c.ant)}</td><td>${variacao(c.v, c.ant)}</td><td class="num"><b>${numero(resp.v)}</b></td><td class="num">${numero(resp.ant)}</td></tr>`; }).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('rp_s_channels'))}</h2></div><div class="card-body"><div class="tabela-rolar"><table class="tabela rp-tabela"><thead><tr><th></th>
            <th class="num">${esc(t('rp_th_sent'))}</th><th class="num">${esc(t('rp_th_prev'))}</th><th>${esc(t('rp_th_change'))}</th><th class="num">${esc(t('rp_th_replies'))}</th><th class="num">${esc(t('rp_th_prev'))}</th></tr></thead><tbody>${linhas}</tbody></table></div></div></section>`;
    }

    function propostasHtml(r) {
        const p = r.propostas, moeda = p.moedas[0] || 'EUR';
        const linha = (rot, par, fmt = numero) => `<tr><td>${esc(rot)}</td><td class="num"><b>${esc(fmt(par.v))}</b></td><td class="num">${esc(fmt(par.ant))}</td><td>${variacao(par.v, par.ant)}</td></tr>`;
        return `<section class="card"><div class="card-head"><h2>${esc(t('rp_s_proposals'))}</h2></div><div class="card-body"><div class="tabela-rolar"><table class="tabela rp-tabela"><thead><tr><th></th><th class="num">${esc(t('rp_th_month'))}</th><th class="num">${esc(t('rp_th_prev'))}</th><th>${esc(t('rp_th_change'))}</th></tr></thead><tbody>
            ${linha(t('rp_p_created'), p.criadas)}${linha(t('rp_p_sent'), p.enviadas)}${linha(t('rp_p_monthly'), p.valor_mensal, (v) => dinheiro(v, moeda))}${linha(t('rp_p_oneoff'), p.valor_pontual, (v) => dinheiro(v, moeda))}${linha(t('rp_p_success'), p.com_sucesso)}</tbody></table></div>
            ${p.moedas.length > 1 ? `<div class="erro-ui">${esc(t('rp_p_currencies'))}</div>` : ''}</div></section>`;
    }

    function tabelaSimples(titulo, cabecalhos, linhas) {
        return `<section class="card"><div class="card-head"><h2>${esc(titulo)}</h2></div><div class="card-body">${linhas.length
            ? `<div class="tabela-rolar"><table class="tabela rp-tabela"><thead><tr>${cabecalhos.map((c, n) => `<th${n ? ' class="num"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : `<p class="nota">${esc(t('rp_none'))}</p>`}</div></section>`;
    }

    function graficoHtml(r) {
        const max = Math.max(1, ...r.serie.map((d) => Math.max(d.saida, d.entrada)));
        const barras = r.serie.map((d) => `<div class="rp-dia" title="${esc(`${d.dia}: ${t('rp_daily_sent')} ${d.saida}, ${t('rp_daily_received')} ${d.entrada}`)}"><i class="s" style="height:${(d.saida / max) * 100}%"></i><i class="e" style="height:${(d.entrada / max) * 100}%"></i></div>`).join('');
        return `<section class="card"><div class="card-head"><h2>${esc(t('rp_s_daily'))}</h2><span class="nota"><i class="rp-leg s"></i>${esc(t('rp_daily_sent'))} <i class="rp-leg e"></i>${esc(t('rp_daily_received'))}</span></div>
            <div class="card-body"><div class="rp-grafico" role="img" aria-label="${esc(t('rp_s_daily'))}">${barras}</div></div></section>`;
    }

    function analiseHtml() {
        const cab = (extra = '') => `<div class="card-head"><h2>${esc(t('ai_title'))}</h2>${extra}</div>`;
        const erro = erroAnalise ? `<div class="erro-ui" role="alert">${esc(erroAnalise)}</div>` : '';
        if (analise === undefined) return `<section class="card ai">${cab()}<div class="card-body"><p class="nota">${esc(t('loading'))}</p>${erro}</div></section>`;
        if (analise === null) {
            return `<section class="card ai">${cab()}<div class="card-body">${erro}<p>${esc(sub(t('ai_none'), { m: nomeMes(mes) }))}</p><p class="nota">${esc(t('ai_privacy'))}</p>
                ${podeGerar ? `<button type="button" class="btn" id="ai-gerar" ${aGerar ? 'disabled' : ''}>${esc(aGerar ? t('ai_working') : t('ai_generate'))}</button>` : `<p class="nota">${esc(t('ai_view_only'))}</p>`}</div></section>`;
        }
        const a = analise.analise;
        const data = new Date(analise.criado_em).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
        const problemas = a.problemas.length ? `<div><h3>${esc(t('ai_h_problems'))}</h3><ul class="ai-lista">${a.problemas.map((p) => `<li><b>${esc(p.titulo)}</b>${p.evidencia ? ` <span>${esc(p.evidencia)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
        const destaques = a.destaques.length ? `<div><h3>${esc(t('ai_h_highlights'))}</h3><ul class="ai-lista">${a.destaques.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
        const acoes = a.acoes.map((x) => `<li class="ai-acao"><span class="ai-n">${x.prioridade}</span><div><b>${esc(x.titulo)}</b>
            ${x.porque ? `<p><i>${esc(t('ai_why'))}:</i> ${esc(x.porque)}</p>` : ''}<p><i>${esc(t('ai_how'))}:</i> ${esc(x.como)}</p>${x.indicador ? `<p class="ai-medir"><i>${esc(t('ai_measure'))}:</i> ${esc(x.indicador)}</p>` : ''}</div></li>`).join('');
        return `<section class="card ai">${cab(podeGerar ? `<button type="button" class="btn btn-secundario" id="ai-regerar" ${aGerar ? 'disabled' : ''}>${esc(aGerar ? t('ai_working') : t('ai_regenerate'))}</button>` : '')}<div class="card-body">${erro}
            <p class="ai-resumo">${esc(a.resumo)}</p>
            <div class="ai-colunas">${destaques}${problemas}</div>
            <h3>${esc(t('ai_h_plan'))}</h3><ol class="ai-acoes">${acoes}</ol>
            ${a.limitacoes ? `<p class="nota ai-limites"><b>${esc(t('ai_limits'))}:</b> ${esc(a.limitacoes)}</p>` : ''}
            ${analise.parcial && mes < agora() ? `<div class="aviso-ok">${esc(t('ai_partial'))}</div>` : ''}
            <p class="nota">${esc(sub(t('ai_generated'), { d: data, mo: analise.modelo || 'IA' }))} · ${esc(t('ai_privacy'))}</p></div></section>`;
    }

    function desenhar() {
        const corpo = $('rp-corpo');
        if (falhou) { corpo.innerHTML = `<div class="erro-ui" role="alert">${esc(t('rp_err'))}</div>`; return; }
        if (!dados) { corpo.innerHTML = `<p class="nota">${esc(t('loading'))}</p>`; return; }
        const r = dados;
        if (r.vazio) { corpo.innerHTML = `<div class="card"><div class="card-body"><div class="vazio"><b>${esc(t('rp_empty_t'))}</b><span>${esc(t('rp_empty_s'))}</span></div></div></div>`; return; }
        const n = (v) => numero(v);
        corpo.innerHTML = kpisHtml(r) + analiseHtml() + `<div class="rp-grelha">${funilHtml(r)}<div class="rp-coluna">${canaisHtml(r)}${propostasHtml(r)}</div></div>` + graficoHtml(r)
            + `<div class="rp-grelha3">${tabelaSimples(t('rp_s_services'), [t('rp_th_service'), t('rp_th_newleads'), t('rp_th_replies'), t('rp_th_closed')],
                r.por_servico.map((s) => `<tr><td>${esc(s.servico ? NS.servico(s.servico) : t('rp_none_service'))}</td><td class="num">${n(s.leads_novos)}</td><td class="num">${n(s.respostas)}</td><td class="num">${n(s.fechados)}</td></tr>`))}
            ${tabelaSimples(t('rp_s_sources'), [t('rp_th_source'), t('rp_th_newcompanies'), t('rp_th_replies')], r.por_fonte.map((f) => `<tr><td>${esc(f.fonte || t('rp_none_source'))}</td><td class="num">${n(f.empresas_novas)}</td><td class="num">${n(f.respostas)}</td></tr>`))}
            ${tabelaSimples(t('rp_s_team'), [t('rp_th_person'), t('rp_th_messages')], r.por_utilizador.map((u) => `<tr><td>${esc(u.nome || t('rp_none_person'))}</td><td class="num">${n(u.contactos)}</td></tr>`))}</div>`;
    }

    // ---------- CSV do relatório (no browser; as células que o Excel executaria como fórmula levam um apóstrofo) ----------
    const celula = (v) => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    function exportarCsv() {
        const r = dados, a = r.atividade, linhas = [[t('rp_csv_section'), t('rp_csv_item'), `${t('rp_csv_now')} ${r.mes}`, `${t('rp_th_prev')} ${r.anterior}`]];
        const add = (sec, item, par) => linhas.push([sec, item, par.v ?? '', par.ant ?? '']);
        [['rp_k_leads', a.leads_novos], ['rp_k_companies', a.empresas_novas], ['rp_k_contacts', a.contactos], ['rp_k_first', a.primeiros], ['rp_k_follow', a.followups], ['rp_k_replies', a.respostas], ['rp_k_rate', a.taxa_resposta], ['rp_k_tasks', a.tarefas_concluidas]].forEach(([k, p]) => add(t('relatorios_sub').split(',')[0], t(k), p));
        a.contactos_por_canal.forEach((c, n) => { add(t('rp_s_channels'), `${t('ch_' + c.canal)} · ${t('rp_th_sent')}`, c); add(t('rp_s_channels'), `${t('ch_' + c.canal)} · ${t('rp_th_replies')}`, a.respostas_por_canal[n]); });
        r.funil.forEach((f) => add(t('rp_s_funnel'), NS.estado(f.estado), f));
        r.conversoes.forEach((c) => linhas.push([t('rp_s_funnel'), `${NS.estado(c.de)} → ${NS.estado(c.para)} (%)`, c.pct ?? '', c.ant ?? '']));
        const p = r.propostas;
        add(t('rp_s_proposals'), t('rp_p_created'), p.criadas); add(t('rp_s_proposals'), t('rp_p_sent'), p.enviadas); add(t('rp_s_proposals'), t('rp_p_monthly'), p.valor_mensal); add(t('rp_s_proposals'), t('rp_p_oneoff'), p.valor_pontual);
        r.por_servico.forEach((s) => { const nome = s.servico ? NS.servico(s.servico) : t('rp_none_service'); linhas.push([t('rp_s_services'), `${nome} · ${t('rp_th_newleads')}`, s.leads_novos, '']); linhas.push([t('rp_s_services'), `${nome} · ${t('rp_th_closed')}`, s.fechados, '']); });
        r.por_fonte.forEach((f) => linhas.push([t('rp_s_sources'), f.fonte || t('rp_none_source'), f.empresas_novas, '']));
        r.por_utilizador.forEach((u) => linhas.push([t('rp_s_team'), u.nome || t('rp_none_person'), u.contactos, '']));
        const texto = '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n') + '\r\n';
        const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' })), a2 = document.createElement('a');
        a2.href = url; a2.download = `relatorio-${r.mes}.csv`; document.body.appendChild(a2); a2.click(); a2.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---------- eventos ----------
    const ir = (m) => { if (!/^\d{4}-\d{2}$/.test(m) || m > agora() || m < '2020-01') return; mes = m; history.replaceState(null, '', `#${m}`); carregar(); };
    $('rp-barra').addEventListener('click', (ev) => {
        if (ev.target.closest('#rp-ant')) ir(mudarMes(mes, -1));
        else if (ev.target.closest('#rp-seg')) ir(mudarMes(mes, 1));
        else if (ev.target.closest('#rp-csv') && dados) exportarCsv();
    });
    $('rp-corpo').addEventListener('click', (ev) => {
        if (ev.target.closest('#ai-gerar')) gerarAnalise(false);
        else if (ev.target.closest('#ai-regerar')) gerarAnalise(true);
    });
    $('rp-barra').addEventListener('change', (ev) => { if (ev.target.id === 'rp-mes') ir(ev.target.value); });
    I18N.aoMudar(() => { desenharBarra(); desenhar(); if (dados && !dados.vazio) { analise = undefined; desenhar(); carregarAnalise(); } });   // a análise guarda-se por idioma
    desenharBarra();
    carregar();
})();

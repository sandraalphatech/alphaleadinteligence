/* proposal-render.js: desenha a proposta comercial (HTML em formato A4) a partir dos dados guardados.
   O idioma do DOCUMENTO é o da proposta (pt, en ou es) e é independente do idioma da aplicação, por isso os rótulos vivem aqui.
   A mesma função serve a pré-visualização no ecrã e o PDF (a impressão do browser, "Guardar como PDF"). */

const Proposta = (() => {
    const L = {
        pt: {
            locale: 'pt-BR', prepared: 'Preparada para', proposal: 'Proposta', date: 'Data', valid: 'Válida até', objectives: 'O que vamos alcançar',
            scope: 'O que propomos', investment: 'Investimento', service: 'Serviço', model: 'Modelo', amount: 'Valor',
            m_mensal: 'Mensal', m_pontual: 'Pontual', m_sucesso: 'Sobre resultados', per_month: 'por mês', month: 'mês', one_off: 'valor único', of_closed: 'do valor do que for fechado',
            total_monthly: 'Total mensal', total_oneoff: 'Total pontual', after_discount: 'Total com desconto',
            contract_total: 'Valor total do contrato ({n} meses)', schedule: 'Calendário de pagamentos', pay_first: 'Início da prestação do serviço', pay_month: 'Início do mês {n}', pay_last: 'Início do último mês', pay_oneoff: 'Valor pontual (na adesão)', pay_prepaid: 'Pagamento antecipado: cada mensalidade é paga no início do respetivo mês de serviço.', pay_due: 'Vencimento',
            vat_mais_iva: 'Valores sem IVA. O IVA é acrescentado à taxa legal em vigor.', vat_incluido: 'Valores com IVA incluído.', vat_isento: 'Valores isentos de IVA.',
            success_note: 'A percentagem sobre resultados só se aplica ao que for efetivamente fechado. Sem negócio fechado, não há pagamento.',
            payment: 'Pagamento', start: 'Início', term: 'Duração', month_to_month: 'Mês a mês', months: '{n} meses', validity: 'Validade', days: '{n} dias',
            how: 'Como funciona', why: 'Porquê a {empresa}', terms: 'Condições', next: 'Próximos passos',
            next_text: 'Para avançar, basta responder a esta proposta ou assinar abaixo. Depois da confirmação, marcamos a reunião de arranque.',
            accept: 'Aceitação', for_company: 'Pela {empresa}', for_client: 'Pelo cliente', name: 'Nome', signature: 'Assinatura', sign_date: 'Data', untitled: 'Cliente',
            included: 'Incluído', notes: 'Notas'
        },
        en: {
            locale: 'en-GB', prepared: 'Prepared for', proposal: 'Proposal', date: 'Date', valid: 'Valid until', objectives: 'What we will achieve',
            scope: 'What we propose', investment: 'Investment', service: 'Service', model: 'Model', amount: 'Amount',
            m_mensal: 'Monthly', m_pontual: 'One-off', m_sucesso: 'Success-based', per_month: 'per month', month: 'month', one_off: 'one-off fee', of_closed: 'of the value of what closes',
            total_monthly: 'Monthly total', total_oneoff: 'One-off total', after_discount: 'Total after discount',
            contract_total: 'Total contract value ({n} months)', schedule: 'Payment schedule', pay_first: 'Start of the service', pay_month: 'Start of month {n}', pay_last: 'Start of the last month', pay_oneoff: 'One-off fee (on sign-up)', pay_prepaid: 'Paid in advance: each monthly fee is paid at the start of its service month.', pay_due: 'Due',
            vat_mais_iva: 'Fees exclude VAT. VAT is added at the rate in force.', vat_incluido: 'Fees include VAT.', vat_isento: 'Fees are exempt from VAT.',
            success_note: 'The success-based percentage applies only to what actually closes. If nothing closes, nothing is owed.',
            payment: 'Payment', start: 'Start', term: 'Term', month_to_month: 'Month-to-month', months: '{n} months', validity: 'Validity', days: '{n} days',
            how: 'How it works', why: 'Why {empresa}', terms: 'Terms', next: 'Next steps',
            next_text: 'To go ahead, simply reply to this proposal or sign below. Once confirmed, we schedule the kickoff call.',
            accept: 'Acceptance', for_company: 'For {empresa}', for_client: 'For the client', name: 'Name', signature: 'Signature', sign_date: 'Date', untitled: 'Client',
            included: 'Included', notes: 'Notes'
        },
        es: {
            locale: 'es-ES', prepared: 'Preparada para', proposal: 'Propuesta', date: 'Fecha', valid: 'Válida hasta', objectives: 'Qué vamos a lograr',
            scope: 'Qué proponemos', investment: 'Inversión', service: 'Servicio', model: 'Modelo', amount: 'Importe',
            m_mensal: 'Mensual', m_pontual: 'Puntual', m_sucesso: 'Sobre resultados', per_month: 'al mes', month: 'mes', one_off: 'importe único', of_closed: 'del valor de lo que se cierre',
            total_monthly: 'Total mensual', total_oneoff: 'Total puntual', after_discount: 'Total con descuento',
            contract_total: 'Valor total del contrato ({n} meses)', schedule: 'Calendario de pagos', pay_first: 'Inicio de la prestación del servicio', pay_month: 'Inicio del mes {n}', pay_last: 'Inicio del último mes', pay_oneoff: 'Importe puntual (al contratar)', pay_prepaid: 'Pago anticipado: cada mensualidad se paga al inicio de su mes de servicio.', pay_due: 'Vencimiento',
            vat_mais_iva: 'Importes sin IVA. El IVA se añade al tipo legal vigente.', vat_incluido: 'Importes con IVA incluido.', vat_isento: 'Importes exentos de IVA.',
            success_note: 'El porcentaje sobre resultados solo se aplica a lo que realmente se cierre. Si no se cierra nada, no hay pago.',
            payment: 'Pago', start: 'Inicio', term: 'Duración', month_to_month: 'Mes a mes', months: '{n} meses', validity: 'Validez', days: '{n} días',
            how: 'Cómo funciona', why: 'Por qué {empresa}', terms: 'Condiciones', next: 'Próximos pasos',
            next_text: 'Para avanzar, basta con responder a esta propuesta o firmar abajo. Tras la confirmación, fijamos la reunión de arranque.',
            accept: 'Aceptación', for_company: 'Por {empresa}', for_client: 'Por el cliente', name: 'Nombre', signature: 'Firma', sign_date: 'Fecha', untitled: 'Cliente',
            included: 'Incluido', notes: 'Notas'
        }
    };

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sub = (txt, vars) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), txt);
    const paragrafos = (txt) => String(txt || '').split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');

    // total calculado igual ao do servidor (o servidor é quem manda; isto só serve à pré-visualização antes de guardar)
    function totais(d) {
        const soma = (m) => Math.round(d.itens.filter((i) => i.modelo === m).reduce((s, i) => s + (Number(i.valor) || 0), 0) * 100) / 100;
        const desc = (v) => Math.round(v * (1 - (Number(d.desconto_pct) || 0) / 100) * 100) / 100;
        const mensal = soma('mensal'), pontual = soma('pontual');
        return { mensal, pontual, mensal_liquido: desc(mensal), pontual_liquido: desc(pontual), desconto_pct: Number(d.desconto_pct) || 0, sucesso: d.itens.filter((i) => i.modelo === 'sucesso') };
    }

    // proposta = { numero, criado_em, dados, empresa: { nome, website } }; marca = { marca, lema, email, nome }
    function render(proposta, marca) {
        const d = proposta.dados, l = L[d.idioma] || L.pt;
        const dinheiro = (v) => new Intl.NumberFormat(l.locale, { style: 'currency', currency: d.moeda || 'EUR', minimumFractionDigits: Number.isInteger(Number(v)) ? 0 : 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
        const data = (iso) => new Date(iso).toLocaleDateString(l.locale, { day: 'numeric', month: 'long', year: 'numeric' });
        const criado = proposta.criado_em ? new Date(proposta.criado_em) : new Date();
        const validoAte = new Date(criado.getTime() + (Number(d.validade_dias) || 15) * 86400000);
        const t = totais(d);
        const empresa = proposta.empresa || {};
        const nomeCliente = empresa.nome || l.untitled;
        const site = empresa.website ? String(empresa.website).replace(/^https?:\/\//i, '').replace(/\/$/, '') : '';
        const quem = d.destinatario?.nome ? `<b>${esc(d.destinatario.nome)}</b>${d.destinatario.cargo ? `, ${esc(d.destinatario.cargo)}` : ''} · <b>${esc(nomeCliente)}</b>` : `<b>${esc(nomeCliente)}</b>`;
        const preco = (i) => (i.modelo === 'sucesso'
            ? `<b>${esc(String(Number(i.valor)))}%</b><small>${esc(l.of_closed)}</small>`
            : `<b>${esc(dinheiro(i.valor))}</b><small>${esc(i.modelo === 'mensal' ? l.per_month : l.one_off)}</small>`);
        const nomeModelo = (m) => l['m_' + m];

        const objetivos = d.objetivos?.length ? `<section class="prop-sec"><h2>${esc(l.objectives)}</h2><ul class="prop-checks">${d.objetivos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';

        const cartao = (i) => `<article class="prop-card">
            <header><h3>${esc(i.nome)}</h3><div class="prop-preco">${preco(i)}</div></header>
            ${i.descricao ? `<p class="prop-desc">${esc(i.descricao)}</p>` : ''}
            ${i.entregaveis?.length ? `<ul>${i.entregaveis.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${i.nota ? `<p class="prop-nota">${esc(i.nota)}</p>` : ''}</article>`;
        // os cartões vão em linhas de dois; o título fica agarrado à primeira linha (senão ficava sozinho no fim da página)
        const linhasCartoes = [];
        for (let n = 0; n < d.itens.length; n += 2) linhasCartoes.push(`<div class="prop-linha ${d.itens.length === 1 ? 'unica' : ''}">${d.itens.slice(n, n + 2).map(cartao).join('')}</div>`);

        const linhas = d.itens.map((i) => `<tr><td>${esc(i.nome)}</td><td>${esc(nomeModelo(i.modelo))}</td><td class="num">${i.modelo === 'sucesso' ? `${esc(String(Number(i.valor)))}%` : esc(dinheiro(i.valor))}${i.modelo === 'mensal' ? ` <small>/ ${esc(l.month)}</small>` : ''}</td></tr>`).join('');
        const totalLinhas = [];
        if (t.mensal) totalLinhas.push(`<tr class="tot"><td colspan="2">${esc(l.total_monthly)}</td><td class="num">${esc(dinheiro(t.mensal))}</td></tr>`);
        if (t.pontual) totalLinhas.push(`<tr class="tot"><td colspan="2">${esc(l.total_oneoff)}</td><td class="num">${esc(dinheiro(t.pontual))}</td></tr>`);
        if (t.desconto_pct > 0 && (t.mensal || t.pontual)) {
            const rot = (m) => `${l.after_discount} (−${t.desconto_pct}%) · ${l['m_' + m].toLowerCase()}`;
            if (t.mensal) totalLinhas.push(`<tr class="liq"><td colspan="2">${esc(rot('mensal'))}</td><td class="num">${esc(dinheiro(t.mensal_liquido))}</td></tr>`);
            if (t.pontual) totalLinhas.push(`<tr class="liq"><td colspan="2">${esc(rot('pontual'))}</td><td class="num">${esc(dinheiro(t.pontual_liquido))}</td></tr>`);
        }
        // Contrato com duração (ex.: 3 meses de 300 €): mostra o valor final e o calendário de pagamentos antecipados (uma mensalidade no início de cada mês).
        const meses = Number(d.duracao_meses) > 0 ? Number(d.duracao_meses) : 0;
        const somarMeses = (iso, n) => { const x = new Date(`${iso}T12:00:00`); const dia = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(dia, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x; };
        let calendario = '';
        if (meses >= 1 && t.mensal) {
            const total = Math.round((t.pontual_liquido + t.mensal_liquido * meses) * 100) / 100;
            totalLinhas.push(`<tr class="tot final"><td colspan="2">${esc(sub(l.contract_total, { n: meses }))}</td><td class="num">${esc(dinheiro(total))}</td></tr>`);
            const linhaPag = (rot, valor, iso) => `<tr><td>${esc(rot)}</td><td>${iso ? esc(data(somarMeses(d.inicio, iso.n))) : ''}</td><td class="num">${esc(dinheiro(valor))}</td></tr>`;
            const parcelas = [];
            if (t.pontual_liquido) parcelas.push(linhaPag(l.pay_oneoff, t.pontual_liquido, null));
            for (let n = 0; n < meses; n++) parcelas.push(linhaPag(n === 0 ? l.pay_first : n === meses - 1 && meses > 2 ? l.pay_last : sub(l.pay_month, { n: n + 1 }), t.mensal_liquido, d.inicio ? { n } : null));
            if (meses >= 2) calendario = `<h3 class="prop-sub">${esc(l.schedule)}</h3><table class="prop-tabela prop-parcelas"><thead><tr><th>${esc(l.schedule)}</th><th>${esc(l.pay_due)}</th><th class="num">${esc(l.amount)}</th></tr></thead><tbody>${parcelas.join('')}<tr class="tot"><td colspan="2">${esc(sub(l.contract_total, { n: meses }))}</td><td class="num">${esc(dinheiro(total))}</td></tr></tbody></table><p class="prop-iva">${esc(l.pay_prepaid)}</p>`;
        }
        const condicoes = [
            [l.payment, d.pagamento],
            d.inicio ? [l.start, data(`${d.inicio}T12:00:00`)] : null,
            [l.term, Number(d.duracao_meses) > 0 ? sub(l.months, { n: d.duracao_meses }) : l.month_to_month],
            [l.validity, `${sub(l.days, { n: d.validade_dias })} · ${l.valid.toLowerCase()} ${data(validoAte)}`]
        ].filter((x) => x && x[1]).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');

        const passos = d.passos?.length ? `<section class="prop-sec"><h2>${esc(l.how)}</h2><ol class="prop-passos">${d.passos.map((p, n) => `<li><span class="n">${n + 1}</span><b>${esc(p.titulo)}</b>${p.texto ? `<p>${esc(p.texto)}</p>` : ''}</li>`).join('')}</ol></section>` : '';
        const porque = d.porque?.length ? `<section class="prop-sec prop-porque"><h2>${esc(sub(l.why, { empresa: marca.nome }))}</h2><ul class="prop-checks">${d.porque.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
        const termos = d.termos?.length ? `<section class="prop-sec"><h2>${esc(l.terms)}</h2><ul class="prop-termos">${d.termos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';

        return `<div class="prop-doc">
            <header class="prop-cab">
                <div class="prop-marca"><img src="/assets/images/logo.png" alt=""><div><b>${esc(marca.marca)}</b><span>${esc(marca.lema)}</span></div></div>
                <div class="prop-meta"><span>${esc(l.proposal)} ${esc(proposta.numero || '')}</span><span>${esc(data(criado))}</span><span>${esc(marca.email)}</span></div>
            </header>
            <div class="prop-barra"></div>
            <h1>${esc(d.titulo)}</h1>
            <p class="prop-para">${esc(l.prepared)} ${quem}${site ? ` · ${esc(site)}` : ''}</p>
            ${d.resumo ? `<div class="prop-resumo">${paragrafos(d.resumo)}</div>` : ''}
            ${objetivos}
            <section class="prop-sec prop-escopo"><div class="prop-grupo"><h2>${esc(l.scope)}</h2>${linhasCartoes[0]}</div>${linhasCartoes.slice(1).join('')}</section>
            <section class="prop-sec prop-invest"><h2>${esc(l.investment)}</h2>
                <table class="prop-tabela"><thead><tr><th>${esc(l.service)}</th><th>${esc(l.model)}</th><th class="num">${esc(l.amount)}</th></tr></thead>
                    <tbody>${linhas}${totalLinhas.join('')}</tbody></table>
                <p class="prop-iva">${esc(l['vat_' + d.iva] || l.vat_mais_iva)}${t.sucesso.length ? ` ${esc(l.success_note)}` : ''}</p>
                ${calendario}
                <dl class="prop-cond">${condicoes}</dl></section>
            ${passos}${porque}${termos}
            ${d.notas_finais ? `<section class="prop-sec"><h2>${esc(l.notes)}</h2><div class="prop-texto">${paragrafos(d.notas_finais)}</div></section>` : ''}
            <section class="prop-sec prop-fim"><h2>${esc(l.next)}</h2><p>${esc(l.next_text)}</p>
                <div class="prop-assina"><div><span>${esc(sub(l.for_company, { empresa: marca.nome }))}</span><i></i><small>${esc(d.assinante?.nome || '')}</small></div>
                    <div><span>${esc(l.for_client)}</span><i></i><small>${esc(l.name)} / ${esc(l.signature)} / ${esc(l.sign_date)}</small></div></div></section>
            <footer class="prop-rodape"><b>${esc(marca.nome)}</b><span>${esc(marca.email)}</span></footer>
        </div>`;
    }

    // Imprime só a proposta (o browser abre o diálogo; escolher «Guardar como PDF»). O título do documento passa a ser o nome do ficheiro.
    function imprimir(proposta, marca) {
        const caixa = document.createElement('div');
        caixa.id = 'prop-impressao';
        caixa.innerHTML = render(proposta, marca);
        document.body.appendChild(caixa);
        document.body.classList.add('imprimir-proposta');
        const tituloAntes = document.title;
        const limpo = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
        document.title = limpo(`${marca.nome} - ${proposta.numero || (L[proposta.dados.idioma] || L.pt).proposal} - ${proposta.empresa?.nome || ''}`);
        const fim = () => { document.body.classList.remove('imprimir-proposta'); caixa.remove(); document.title = tituloAntes; window.removeEventListener('afterprint', fim); };
        window.addEventListener('afterprint', fim);
        const img = caixa.querySelector('img');
        const imprimirAgora = () => setTimeout(() => window.print(), 50);
        if (img && !img.complete) { img.addEventListener('load', imprimirAgora, { once: true }); img.addEventListener('error', imprimirAgora, { once: true }); } else imprimirAgora();
    }

    return { render, imprimir, totais, rotulos: L };
})();

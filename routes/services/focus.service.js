// Antes de a IA escrever, a pessoa escolhe o que propor primeiro (serviço) e por onde começar (sinal).
// As opções vêm da análise que o lead já tem: não há nova chamada à IA.
const { SERVICOS } = require('./radar.catalog');

const FORCA_ORDEM = { alta: 0, media: 1, baixa: 2 };
const textoPt = (v) => (v && (v.pt || (typeof v === 'string' ? v : ''))) || '';

// Opções para a janela de escolha. Os serviços vêm pela ordem de prioridade da análise (o primeiro é o mais forte).
function opcoesDeFoco(ctx) {
    const a = ctx.lead?.analise || null;
    const dores = (servico) => (a?.necessidades || []).filter((n) => n.servico === servico)
        .map((n) => ({ necessidade: textoPt(n.necessidade), evidencia: textoPt(n.evidencia) }));

    const servicos = [...new Set([
        ...(a?.servicos || []).map((s) => s.servico),
        ...(a?.necessidades || []).map((n) => n.servico)
    ])].filter((s) => SERVICOS.includes(s));

    return {
        analisada: !!a,
        opcoes: servicos.map((servico, posicao) => ({
            servico, posicao,
            motivo: textoPt(a.servicos?.find((s) => s.servico === servico)?.motivo),
            dores: dores(servico)
        })),
        outros: SERVICOS.filter((s) => !servicos.includes(s)),
        // "indice" é a posição na análise: é o que o browser devolve na escolha
        sinais: (a?.sinais || []).map((s, indice) => ({ indice, tipo: s.tipo, forca: s.forca, data: s.data || null, evidencia: textoPt(s.evidencia) }))
            .filter((s) => s.evidencia)
            .sort((x, y) => (FORCA_ORDEM[x.forca] ?? 3) - (FORCA_ORDEM[y.forca] ?? 3)),
        necessidades_gerais: (a?.necessidades || []).filter((n) => !n.servico).map((n) => textoPt(n.necessidade)).filter(Boolean),
        abordagem: textoPt(a?.abordagem)
    };
}

// Devolve uma cópia do contexto em que a análise está reordenada segundo a escolha. Não altera nada na base de dados.
// Sem escolha válida, devolve o contexto tal como estava.
function aplicarFoco(ctx, foco) {
    if (!ctx || !foco || typeof foco !== 'object') return ctx;
    const a = ctx.lead?.analise || {};
    const servico = SERVICOS.includes(foco.servico) ? foco.servico : null;
    const sinal = Number.isInteger(foco.sinal) ? a.sinais?.[foco.sinal] || null : null;
    if (!servico && !sinal) return ctx;

    const analise = { ...a };
    if (servico) {
        const recomendado = a.servicos?.[0]?.servico;
        analise.servicos = [a.servicos?.find((s) => s.servico === servico) || { servico, motivo: { pt: '' } }];
        analise.necessidades = (a.necessidades || []).filter((n) => !n.servico || n.servico === servico)
            .sort((x, y) => (x.servico === servico ? 0 : 1) - (y.servico === servico ? 0 : 1));
        // o resumo e o ângulo sugeridos falam do serviço recomendado: se a pessoa escolheu outro, deixam de servir
        if (servico !== recomendado) { delete analise.abordagem; delete analise.resumo; }
    }
    if (sinal) analise.sinais = [sinal];

    const lead = { ...(ctx.lead || {}), analise, ...(servico ? { servico_interesse: servico } : {}) };
    return { ...ctx, lead, foco: { servico, sinal } };
}

module.exports = { opcoesDeFoco, aplicarFoco };

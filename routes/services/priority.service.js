// Prioridade de um lead: o que a equipa comercial deve contactar primeiro.
//
//   prioridade = 60% pontuação  +  15% atualidade do sinal  +  15% possibilidade de contacto  +  10% serviço recomendado
//
// A pontuação diz "quão boa é a oportunidade". A prioridade acrescenta "quão agora" e "quão fácil":
// um lead excelente mas antigo, ou sem ninguém para contactar, desce na lista.
// A fórmula é pública e cada parcela fica guardada à vista (ver a ficha da empresa), para ser fácil de ajustar e explicar.

const PESOS = { pontuacao: 0.60, frescura: 0.15, contactabilidade: 0.15, servico: 0.10 };
const DIAS_FRESCO = 7;            // até 7 dias: atualidade máxima
const DIAS_ANTIGO = 45;           // a partir de 45 dias: atualidade zero
const CATEGORIAS_CHAVE = ['marketing', 'fundador', 'ceo', 'comercial'];   // quem decide sobre marca e marketing

// Faixas definidas pela Alpha Tech: Hot 70+, Warm 40 a 69, Cold abaixo de 40 (a base de dados calcula o mesmo)
const classificar = (pontuacao) => (pontuacao === null || pontuacao === undefined ? null : pontuacao >= 70 ? 'hot' : pontuacao >= 40 ? 'warm' : 'cold');

// 100 se o sinal é de há 7 dias ou menos, 0 se é de há 45 ou mais, e desce em linha reta entre os dois.
function frescura(lead, agora = Date.now()) {
    // a data da notícia (quando se sabe) vale mais do que a data em que a encontrámos
    const datas = [lead.origem_data || lead.criado_em, ...(lead.analise?.sinais || []).map((s) => s.data)]
        .map((d) => new Date(d).getTime())
        .filter((t) => Number.isFinite(t) && t <= agora);
    if (!datas.length) return 50;                                   // sem datas: neutro
    const dias = (agora - Math.max(...datas)) / 86400000;
    if (dias <= DIAS_FRESCO) return 100;
    if (dias >= DIAS_ANTIGO) return 0;
    return Math.round(100 * (DIAS_ANTIGO - dias) / (DIAS_ANTIGO - DIAS_FRESCO));
}

// Há alguém para contactar? Um decisor de marketing, fundador, CEO ou comercial com LinkedIn ou email vale 100.
function contactabilidade(empresa) {
    if (!empresa || empresa.nao_contactar) return 0;
    const decisores = (empresa.decisores || []).filter((d) => !d.nao_contactar);
    const comVia = (d) => !!(d.linkedin_url || d.email);
    const chave = decisores.filter((d) => CATEGORIAS_CHAVE.includes(d.categoria));
    if (chave.some(comVia)) return 100;
    if (chave.length) return 75;
    if (decisores.some(comVia)) return 60;
    if (empresa.email_geral || empresa.telefone) return 40;
    return 0;
}

// Tem um serviço da Alpha Tech recomendado?
const servico = (lead) => ((lead.analise?.servicos || []).length || lead.servico_interesse ? 100 : 30);

// lead: { pontuacao, criado_em, analise, servico_interesse }; empresa: { decisores, email_geral, telefone, nao_contactar }
function calcularPrioridade(lead, empresa, agora = Date.now()) {
    const componentes = {
        pontuacao: lead.pontuacao ?? 0,
        frescura: frescura({ ...lead, origem_data: lead.origem_data ?? empresa?.origem_data }, agora),
        contactabilidade: contactabilidade(empresa),
        servico: servico(lead)
    };
    const prioridade = Math.round(Object.entries(PESOS).reduce((soma, [k, peso]) => soma + peso * componentes[k], 0));
    return { prioridade, componentes, pesos: PESOS, classificacao: classificar(lead.pontuacao) };
}

module.exports = { calcularPrioridade, classificar, frescura, contactabilidade, PESOS, CATEGORIAS_CHAVE };

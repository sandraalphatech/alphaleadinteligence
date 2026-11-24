// Submete à Meta, para aprovação, os modelos de mensagem de config/whatsapp-templates.json (um "genérico" e um por serviço,
// em pt, pt_BR, en e es), em vez de os criares à mão no painel. Só cria os que ainda não existem na conta.
//
// Uso:
//   node scripts/create-whatsapp-templates.js                            (mostra o que submeteria: NÃO envia nada)
//   node scripts/create-whatsapp-templates.js --idioma=pt_BR             (só os de português do Brasil)
//   node scripts/create-whatsapp-templates.js --idioma=pt_BR --servico=generico,sistemas
//   node scripts/create-whatsapp-templates.js --idioma=pt_BR --confirmar (SUBMETE à Meta)
//
// Precisa de WHATSAPP_TOKEN e WHATSAPP_WABA_ID no .env. O token tem de ter a permissão «whatsapp_business_management»
// (criar modelos); se só tiver a de enviar mensagens, a Meta recusa e o script diz-to.
// Começa por poucos (por exemplo --idioma=pt_BR): a aprovação demora de minutos a horas e a Meta limita os pedidos por hora.
require('dotenv').config();

const { carregarModelos, ambiente, versao } = require('../routes/services/whatsapp.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=')[1];
const lista = (nome) => (arg(nome) || '').split(',').map((x) => x.trim()).filter(Boolean);
const confirmar = process.argv.includes('--confirmar');
const idiomas = lista('idioma'), servicos = lista('servico');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(caminho, opcoes = {}) {
    const r = await fetch(`https://graph.facebook.com/${versao()}/${caminho}`, { ...opcoes, headers: { Authorization: `Bearer ${ambiente.token()}`, 'Content-Type': 'application/json' } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, j } : { ok: false, codigo: j.error?.code, subcodigo: j.error?.error_subcode, msg: String(j.error?.error_user_msg || j.error?.message || r.status).slice(0, 220) };
}

(async () => {
    const config = carregarModelos();
    const todos = Object.entries(config.modelos).flatMap(([servico, porIdioma]) => Object.entries(porIdioma).map(([idioma, m]) => ({ servico, idioma, ...m })))
        .filter((m) => (!idiomas.length || idiomas.includes(m.idioma)) && (!servicos.length || servicos.includes(m.servico)) && m.ativo !== false);
    if (!todos.length) { console.log('Nenhum modelo corresponde aos filtros. Idiomas: pt, pt_BR, en, es. Serviços: generico, sistemas, website, marketing_digital, redes_sociais, automacao_ia, design_grafico.'); return; }
    if (!ambiente.token() || !ambiente.wabaId()) { console.error('Faltam WHATSAPP_TOKEN e WHATSAPP_WABA_ID no .env (ver docs/whatsapp-setup.md).'); process.exit(1); }

    // o que já existe na conta (para não duplicar)
    const existentes = new Map();
    let proximo = `${encodeURIComponent(ambiente.wabaId())}/message_templates?fields=name,language,status&limit=200`;
    for (let pagina = 0; proximo && pagina < 5; pagina++) {
        const r = await graph(proximo);
        if (!r.ok) { console.error(`Não consegui ler os modelos da conta: ${r.msg}${r.codigo ? ` (código ${r.codigo})` : ''}`); process.exit(1); }
        for (const m of r.j.data || []) existentes.set(`${m.name}|${m.language}`, m.status);
        const seguinte = r.j.paging?.next;
        proximo = seguinte && seguinte.startsWith('https://graph.facebook.com/') ? seguinte.replace(/^https:\/\/graph\.facebook\.com\/[^/]+\//, '') : null;
    }

    console.log(`${confirmar ? 'A SUBMETER à Meta' : 'Só a mostrar (nada é enviado)'} | ${todos.length} modelo(s) nos filtros\n`);
    let submetidos = 0, jaExistem = 0, erros = 0, errosSeguidos = 0;
    for (const m of todos) {
        const chave = `${m.name}|${m.language}`;
        const rotulo = `${m.name} (${m.language})`.padEnd(46);
        if (existentes.has(chave)) { jaExistem++; console.log(`${rotulo} já existe: ${existentes.get(chave)}`); continue; }
        if (!confirmar) { console.log(`${rotulo} seria submetido (categoria MARKETING)`); continue; }
        // texto fixo (sem variáveis) não leva exemplo; os botões de resposta rápida (ex.: «Sim, mais informações») vão como BUTTONS
        const temVariaveis = /\{\{\d\}\}/.test(m.corpo);
        const componentes = [{ type: 'BODY', text: m.corpo, ...(temVariaveis ? { example: { body_text: [config.exemplos[m.idioma]] } } : {}) }];
        if (Array.isArray(m.botoes) && m.botoes.length) componentes.push({ type: 'BUTTONS', buttons: m.botoes.map((texto) => ({ type: 'QUICK_REPLY', text: texto })) });
        const corpo = { name: m.name, language: m.language, category: 'MARKETING', components: componentes };
        const r = await graph(`${encodeURIComponent(ambiente.wabaId())}/message_templates`, { method: 'POST', body: JSON.stringify(corpo) });
        if (r.ok) { submetidos++; errosSeguidos = 0; console.log(`${rotulo} submetido: ${r.j.status || 'PENDING'}${r.j.category && r.j.category !== 'MARKETING' ? ` | a Meta classificou como ${r.j.category}` : ''}`); }
        else {
            erros++; errosSeguidos++;
            console.log(`${rotulo} ERRO: ${r.msg}${r.codigo ? ` (código ${r.codigo}${r.subcodigo ? '/' + r.subcodigo : ''})` : ''}`);
            if ([10, 200, 3].includes(r.codigo) || /permission/i.test(r.msg)) console.log('   → O token não tem permissão para criar modelos: precisa de «whatsapp_business_management». Gera um token com essa permissão (ou cria os modelos no painel).');
            if (errosSeguidos >= 3) { console.log('\n3 erros seguidos: paro aqui para não insistir.'); break; }
        }
        await esperar(1500);                                       // devagar: a Meta limita os pedidos
    }
    console.log(`\n${confirmar ? `Submetidos: ${submetidos} | já existiam: ${jaExistem} | erros: ${erros}` : `Já existiam: ${jaExistem}. Nada foi enviado: para submeter, acrescenta --confirmar.`}`);
    if (confirmar && submetidos) console.log('A aprovação demora de minutos a horas. Vê o estado com: node scripts/check-whatsapp.js');
})().catch((e) => { console.error('Falhou:', String(e.message).slice(0, 200)); process.exit(1); });

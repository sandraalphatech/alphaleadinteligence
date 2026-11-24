// Envia UMA mensagem de teste, pela API da Meta, para o TEU número de teste. Não usa nenhuma empresa nem grava nada na base de dados.
//
// Uso:
//   node scripts/send-whatsapp-test.js +351912345678 --hello              (mostra o que enviaria: não envia)
//   node scripts/send-whatsapp-test.js +351912345678 --hello --confirmar   (envia o modelo de exemplo da Meta, "hello_world")
//   node scripts/send-whatsapp-test.js +351912345678 pt --confirmar        (envia o NOSSO modelo genérico em português, com variáveis de exemplo)
//   node scripts/send-whatsapp-test.js +351912345678 pt --servico=sistemas --confirmar   (o modelo do serviço indicado)
//
// Idiomas dos nossos modelos: pt, pt_BR, en, es. Serviços: generico (por defeito), branding, website, marketing_digital, redes_sociais,
// automacao_ia, design_grafico. O nosso modelo só funciona depois de aprovado pela Meta.
// No modo de teste, o número tem de estar verificado na lista de destinatários do painel da Meta.
// Sem --confirmar NÃO se envia nada.
require('dotenv').config();

const { parsePhoneNumberFromString } = require('libphonenumber-js');
const wa = require('../routes/services/whatsapp.service');

const args = process.argv.slice(2);
const confirmar = args.includes('--confirmar');
const hello = args.includes('--hello');
const numeroBruto = args.find((a) => /^\+?\d[\d\s]{6,}$/.test(a));
const chave = args.find((a) => ['pt', 'pt_BR', 'en', 'es'].includes(a)) || 'pt';
const servico = (args.find((a) => a.startsWith('--servico=')) || '--servico=generico').split('=')[1];

(async () => {
    const p = parsePhoneNumberFromString(numeroBruto || '');
    if (!p || !p.isValid()) { console.error('Indica o teu número com o prefixo internacional, por exemplo: +351912345678'); process.exit(1); }
    if (!wa.configurado()) { console.error('Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env (corre primeiro: node scripts/check-whatsapp.js).'); process.exit(1); }

    let template, texto;
    if (hello) { template = { name: 'hello_world', language: { code: 'en_US' } }; texto = '(modelo de exemplo da Meta: "Hello World")'; }
    else {
        const m = wa.carregarModelos().modelos[servico]?.[chave];
        if (!m) { console.error(`Não existe o modelo "${servico}" em ${chave}. Serviços: ${Object.keys(wa.carregarModelos().modelos).join(', ')}.`); process.exit(1); }
        const variaveis = wa.validarVariaveis({ 1: 'Teste Alpha Tech', 2: 'este teste de envio', 3: 'isto é só um ensaio da ligação ao WhatsApp' });
        template = { name: m.name, language: { code: m.language }, components: [{ type: 'body', parameters: [1, 2, 3].map((n) => ({ type: 'text', text: variaveis[n] })) }] };
        texto = wa.renderizar(m.corpo, variaveis);
    }
    const corpo = { messaging_product: 'whatsapp', recipient_type: 'individual', to: p.number.replace(/^\+/, ''), type: 'template', template };

    console.log(`\nPara: ${p.formatInternational()}\nModelo: ${template.name} (${template.language.code})\nTexto:\n${texto}\n`);
    if (!confirmar) { console.log('Não foi enviado nada. Para enviar de verdade, acrescenta --confirmar.\n'); return; }
    try {
        const id = await wa.chamarApi(corpo, fetch);
        console.log(`Enviado. Identificador da Meta: ${id}\nSe não chegar, confere se o número está verificado no painel da Meta (modo de teste) e se o modelo está aprovado.\n`);
    } catch (e) {
        console.error(`A Meta não aceitou: ${e.message} (${e.codigo})`);
        if (e.codigo === 'WA_TESTE') console.error('→ Adiciona e verifica este número na lista de destinatários do painel da Meta (WhatsApp → Configuração da API).');
        if (e.codigo === 'WA_MODELO') console.error('→ Confere se o modelo existe com este nome e idioma e se está aprovado (node scripts/check-whatsapp.js).');
        if (e.codigo === 'WA_CONFIG') console.error('→ Token errado ou caducado: gera outro no painel da Meta.');
        process.exit(1);
    }
})().catch((e) => { console.error('Falhou:', String(e.message).slice(0, 200)); process.exit(1); });

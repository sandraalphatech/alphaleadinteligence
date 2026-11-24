// Verifica a configuração do WhatsApp (API da Meta) SEM enviar nenhuma mensagem. Só faz leituras.
// Uso:   node scripts/check-whatsapp.js
//
// Mostra o que está preenchido no .env (nunca imprime os valores), se o token e o número de envio funcionam,
// se os teus modelos existem e estão APROVADOS na Meta (precisa de WHATSAPP_WABA_ID) e se a base de dados tem a migração.
require('dotenv').config();

const { carregarModelos, ambiente } = require('../routes/services/whatsapp.service');
const { supabaseAdmin } = require('../routes/services/supabase.service');

const versao = process.env.WHATSAPP_API_VERSION || 'v23.0';
const LIMPOS = { WHATSAPP_TOKEN: ambiente.token, WHATSAPP_PHONE_NUMBER_ID: ambiente.numeroId, WHATSAPP_WABA_ID: ambiente.wabaId, WHATSAPP_APP_SECRET: ambiente.segredo, WHATSAPP_VERIFY_TOKEN: ambiente.verificacao };
const tem = (nome) => !!(LIMPOS[nome] ? LIMPOS[nome]() : (process.env[nome] || '').trim());
// o painel da Meta mete caracteres invisíveis ao copiar: o código ignora-os, mas avisa-se para o .env ficar limpo
const sujo = (nome) => !!process.env[nome] && !!LIMPOS[nome] && LIMPOS[nome]() !== process.env[nome];
const linha = (estado, texto) => console.log(`${{ ok: 'OK    ', falta: 'FALTA ', aviso: 'AVISO ', info: '      ' }[estado]}${texto}`);

async function graph(caminho) {
    const controlo = new AbortController();
    const t = setTimeout(() => controlo.abort(), 15000);
    try {
        const r = await fetch(`https://graph.facebook.com/${versao}/${caminho}`, { headers: { Authorization: `Bearer ${ambiente.token()}` }, signal: controlo.signal });
        const j = await r.json().catch(() => ({}));
        return r.ok ? { ok: true, dados: j } : { ok: false, codigo: j.error?.code, mensagem: String(j.error?.message || r.status).slice(0, 200) };
    } catch (e) { return { ok: false, mensagem: 'sem ligação à Meta (' + String(e.message).slice(0, 80) + ')' }; }
    finally { clearTimeout(t); }
}

(async () => {
    console.log(`\nVerificação do WhatsApp (API ${versao})\n`);

    console.log('1. Variáveis no .env');
    for (const [nome, nota] of [
        ['WHATSAPP_TOKEN', 'token de acesso'], ['WHATSAPP_PHONE_NUMBER_ID', 'ID do número de envio'],
        ['WHATSAPP_APP_SECRET', 'segredo da app (para o webhook)'], ['WHATSAPP_VERIFY_TOKEN', 'frase de verificação do webhook'],
        ['WHATSAPP_WABA_ID', 'ID da conta WhatsApp Business (para ver o estado dos modelos)']
    ]) {
        linha(tem(nome) ? 'ok' : (nome === 'WHATSAPP_WABA_ID' ? 'aviso' : 'falta'), `${nome.padEnd(26)} ${tem(nome) ? 'preenchido' : 'vazio'}  (${nota})`);
        if (sujo(nome)) linha('aviso', `${''.padEnd(26)} tem espaços ou caracteres invisíveis (copiados do painel): já são ignorados, mas podes apagar e voltar a escrever o valor.`);
    }

    console.log('\n2. Token e número de envio');
    if (!tem('WHATSAPP_TOKEN') || !tem('WHATSAPP_PHONE_NUMBER_ID')) linha('falta', 'Sem WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID não dá para ligar à Meta.');
    else {
        const r = await graph(`${encodeURIComponent(ambiente.numeroId())}?fields=display_phone_number,verified_name,quality_rating`);
        if (r.ok) {
            linha('ok', `Ligação à Meta funciona. Número de envio: ${r.dados.display_phone_number || '?'} | nome verificado: ${r.dados.verified_name || '(ainda sem)'} | qualidade: ${r.dados.quality_rating || '?'}`);
        } else {
            linha('falta', `A Meta recusou: ${r.mensagem}${r.codigo ? ` (código ${r.codigo})` : ''}`);
            if ([190, 102].includes(r.codigo)) linha('info', '→ O token está errado ou caducou. O token temporário do painel dura poucas horas: gera outro (ou um permanente).');
            if (r.codigo === 100) linha('info', '→ O ID do número parece errado: usa o «Phone number ID» (não o número de telefone nem o ID da conta).');
        }
    }

    console.log('\n3. Modelos de mensagem (têm de existir e estar APROVADOS na Meta)');
    const { modelos } = carregarModelos();
    // um modelo "generico" (reserva) e um por serviço, em cada idioma
    const todosOsModelos = Object.entries(modelos).flatMap(([servico, porIdioma]) => Object.entries(porIdioma).map(([idioma, m]) => ({ servico, idioma, ...m })));
    if (!tem('WHATSAPP_TOKEN') || !tem('WHATSAPP_WABA_ID')) {
        linha('aviso', 'Sem WHATSAPP_WABA_ID não consigo ver o estado dos modelos. Está no painel da Meta, em WhatsApp → Configuração da API (ID da conta do WhatsApp Business).');
        linha('info', `Há ${todosOsModelos.length} modelos definidos em config/whatsapp-templates.json. Para os submeter à Meta: node scripts/create-whatsapp-templates.js`);
    } else {
        const r = await graph(`${encodeURIComponent(ambiente.wabaId())}/message_templates?fields=name,language,status,category&limit=200`);
        if (!r.ok) linha('falta', `Não consegui ler os modelos: ${r.mensagem}${r.codigo ? ` (código ${r.codigo})` : ''}`);
        else {
            const lista = r.dados.data || [];
            const faltam = {};
            for (const m of todosOsModelos) {
                const achado = lista.find((x) => x.name === m.name && x.language === m.language);
                if (!achado) { (faltam[m.idioma] ||= []).push(m.servico); continue; }
                linha(achado.status === 'APPROVED' ? 'ok' : 'aviso', `${m.name} (${m.language}): ${achado.status}${achado.category && achado.category !== 'MARKETING' ? ` | categoria ${achado.category} (devia ser MARKETING)` : ''}`);
            }
            const total = Object.values(faltam).reduce((n, l) => n + l.length, 0);
            if (total) {
                linha('aviso', `${total} modelo(s) ainda NÃO existem na Meta: ${Object.entries(faltam).map(([id, l]) => `${id} (${l.length})`).join(', ')}`);
                linha('info', 'Para os submeter: node scripts/create-whatsapp-templates.js --idioma=pt_BR   (vê o que seria enviado) e depois com --confirmar');
            }
            const aprovados = todosOsModelos.filter((m) => lista.some((x) => x.name === m.name && x.language === m.language && x.status === 'APPROVED'));
            linha(aprovados.length ? 'ok' : 'aviso', `${aprovados.length} modelo(s) aprovado(s) e utilizáveis pela plataforma. A plataforma só usa modelos aprovados; se o do serviço não estiver, usa o genérico.`);
            const hello = lista.find((x) => x.name === 'hello_world');
            if (hello) linha('info', `Modelo de exemplo da Meta disponível: hello_world (${hello.language}, ${hello.status}), serve para testar as credenciais.`);
        }
    }

    console.log('\n4. Base de dados');
    const { error } = await supabaseAdmin.from('interaccoes').select('externo_id').limit(1);
    linha(error ? 'falta' : 'ok', error ? 'A coluna externo_id não existe: corre database/whatsapp.sql no Supabase.' : 'Migração do WhatsApp corrida (database/whatsapp.sql).');
    const { data: comWa } = await supabaseAdmin.from('empresas').select('nome, redes');
    const n = (comWa || []).filter((e) => e.redes?.whatsapp).length;
    linha(n ? 'ok' : 'aviso', n ? `${n} empresa(s) com WhatsApp publicado e guardado.` : 'Nenhuma empresa com WhatsApp guardado (corre: node scripts/find-whatsapp.js --gravar).');

    console.log('\n5. Webhook (entregue, lida, respostas, PARAR)');
    linha(tem('WHATSAPP_APP_SECRET') && tem('WHATSAPP_VERIFY_TOKEN') ? 'ok' : 'falta', 'Segredo e frase de verificação ' + (tem('WHATSAPP_APP_SECRET') && tem('WHATSAPP_VERIFY_TOKEN') ? 'preenchidos.' : 'por preencher.'));
    linha('info', 'O endereço público (https) tem de ser configurado no painel da Meta. Em localhost só funciona com um túnel (ngrok / Cloudflare Tunnel).');
    console.log('\nNada foi enviado.\n');
})().catch((e) => { console.error('Falhou:', String(e.message).slice(0, 200)); process.exit(1); });

// Corre uma recolha do Radar a partir do terminal (sem login nem browser).
// Uso:
//   node scripts/collect.js --limite=8 --sem-gravar     (só analisa e mostra: não grava nada)
//   node scripts/collect.js --limite=40                 (recolhe e grava empresas e leads)
//   node scripts/collect.js --fontes=hacker_news,product_hunt
require('dotenv').config();

const { executar } = require('../routes/services/radar.pipeline');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=')[1];
const gravar = !process.argv.includes('--sem-gravar');
const limite = arg('limite');
const ids = (arg('fontes') || '').split(',').filter(Boolean);

(async () => {
    console.log(`Recolha ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${limite || 'por defeito'}\n`);
    const r = await executar({ ids, limite, gravar });

    console.log('Fontes:');
    r.fontes.forEach((f) => console.log(`  ${f.ok ? 'OK  ' : 'ERRO'} ${f.nome}: ${f.itens} itens${f.erro ? ' - ' + f.erro : ''}`));

    console.log('\nContadores:', r.contadores);
    console.log(`Modelo: ${r.modelo} | tokens: ${r.tokens.entrada} entrada, ${r.tokens.saida} saída`);
    if (r.erro) console.log('Último erro:', r.erro);

    console.log('\nExemplos de empresas encontradas:');
    r.amostra.forEach(({ item, analise: a }) => {
        console.log(`\n- ${a.nome} [${a.pais || '?'} | ${a.sector} | ${a.pilares_cumpridos}/4 pilares${a.pilares_cumpridos >= 3 ? ' = STARTUP' : ''}]`);
        console.log(`  Notícia: ${item.slice(0, 100)}`);
        console.log(`  Serviço: ${a.servico_interesse || '-'} | pontuações:`, a.pontuacoes);
        console.log(`  ${a.justificacao || ''}`);
    });
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

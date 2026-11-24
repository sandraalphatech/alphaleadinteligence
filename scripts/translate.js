// Traduz para inglês e espanhol os textos das empresas (descrição, "sobre", motivo do tipo).
// Uso:
//   node scripts/translate.js --limite=40 --sem-gravar     (mostra o que traduziria, não grava)
//   node scripts/translate.js --limite=40                  (grava)
require('dotenv').config({ quiet: true });

const { traduzirPendentes, MODELO } = require('../routes/services/translation.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=').slice(1).join('=');
const gravar = !process.argv.includes('--sem-gravar');

(async () => {
    console.log(`Tradução ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${arg('limite') || 40} | modelo: ${MODELO}\n`);
    const r = await traduzirPendentes({ limite: arg('limite') || 40, gravar });
    r.detalhe.slice(0, Number(arg('mostrar')) || 3).forEach((d) => {
        if (d.erro) return console.log(`- ${d.nome}: ERRO ${d.erro}`);
        console.log(`- ${d.nome}`);
        for (const c of Object.keys(d.original).filter((k) => d.original[k])) {
            console.log(`    [${c}] PT: ${d.original[c]}\n          EN: ${d.traducoes.en?.[c]}\n          ES: ${d.traducoes.es?.[c]}`);
        }
    });
    const { detalhe, ...resto } = r;
    console.log('\nResumo:', resto);
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

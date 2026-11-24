// Valida, normaliza e classifica as empresas (e limpa decisores repetidos), a partir do terminal.
// Uso:
//   node scripts/quality.js --limite=40 --sem-gravar     (mostra o que faria, não grava)
//   node scripts/quality.js --limite=40                  (grava)
require('dotenv').config({ quiet: true });

const { qualificarPendentes } = require('../routes/services/quality.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=').slice(1).join('=');
const gravar = !process.argv.includes('--sem-gravar');

(async () => {
    console.log(`Qualidade ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${arg('limite') || 40}\n`);
    const r = await qualificarPendentes({ limite: arg('limite') || 40, gravar });
    r.detalhe.forEach((d) => console.log(d.erro
        ? `- ${d.nome}: ERRO ${d.erro}`
        : `- ${d.nome}: ${d.tipo || 'sem tipo'}${d.fundida ? ' [FUNDIDA]' : ''}${d.telefone !== undefined ? ` | telefone: ${d.telefone}` : ''}\n    ${d.motivo || ''}`));
    const { detalhe, ...resto } = r;
    console.log('\nResumo:', resto);
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

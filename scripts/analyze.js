// Análise profunda dos leads (sinais de compra, necessidades, serviços recomendados, pontuação e prioridade).
// Uso:
//   node scripts/analyze.js --limite=20 --sem-gravar     (mostra o que faria, não grava)
//   node scripts/analyze.js --limite=20                  (analisa e grava)
//   node scripts/analyze.js --nome=Payhawk --forcar      (reanalisa uma empresa, mesmo que os dados não tenham mudado)
require('dotenv').config({ quiet: true });

const { analisarPendentes, MODELO_FORTE, MODELO_RAPIDO } = require('../routes/services/lead-analysis.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=').slice(1).join('=');
const gravar = !process.argv.includes('--sem-gravar');
const PRECO = { [MODELO_FORTE]: [2, 10], [MODELO_RAPIDO]: [0.1, 0.5], 'claude-haiku-5-5 (traduções)': [0.1, 0.5] };   // USD por milhão de tokens (entrada, saída)

(async () => {
    console.log(`Análise profunda ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${arg('limite') || 20} | Sonnet para pontuação >= 40: ${MODELO_FORTE}\n`);
    const r = await analisarPendentes({ limite: arg('limite') || 20, gravar, forcar: process.argv.includes('--forcar'), nome: arg('nome') || null });

    for (const d of r.detalhe) {
        if (d.erro) { console.log(`- ${d.empresa}: ERRO ${d.erro}`); continue; }
        console.log(`- ${d.empresa.padEnd(22)} ${String(d.antes ?? '-').padStart(3)} -> ${String(d.depois).padStart(3)} ${d.classificacao.toUpperCase().padEnd(4)} | prioridade ${String(d.prioridade).padStart(3)} | ${d.modelo.replace('claude-', '')} | ${d.servicos.join(', ') || 'sem serviço'} | contacto: ${d.contacto || '-'}`);
    }
    let custo = 0;
    for (const [m, u] of Object.entries(r.uso)) custo += (u.entrada * (PRECO[m]?.[0] ?? 0) + u.saida * (PRECO[m]?.[1] ?? 0)) / 1e6;
    const { detalhe, ...resto } = r;
    console.log('\nResumo:', JSON.stringify(resto), `\ncusto estimado ≈ $${custo.toFixed(3)} (preços de tabela, a confirmar no painel de uso)`);
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

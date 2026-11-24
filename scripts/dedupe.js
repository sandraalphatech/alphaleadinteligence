// Procura empresas duplicadas e, se pedires, funde-as.
// Uso:
//   node scripts/dedupe.js                 (só lista os duplicados)
//   node scripts/dedupe.js --aplicar       (funde cada grupo: fica a empresa com mais trabalho feito)
require('dotenv').config({ quiet: true });

const { supabaseAdmin } = require('../routes/services/supabase.service');
const { encontrarDuplicados, escolherMantida, fundirEmpresas } = require('../routes/services/dedup.service');

(async () => {
    const grupos = await encontrarDuplicados();
    if (!grupos.length) return console.log('Sem empresas duplicadas.');

    for (const g of grupos) {
        console.log(`\n${g.motivo}: ${g.empresas.map((e) => e.nome).join('  |  ')}`);
        if (!process.argv.includes('--aplicar')) continue;

        const completas = [];
        for (const e of g.empresas) completas.push((await supabaseAdmin.from('empresas').select('*').eq('id', e.id).single()).data);
        let [mantida, ...resto] = [completas[0]];
        for (const outra of completas.slice(1)) {
            const [fica, sai] = await escolherMantida(mantida, outra);
            const r = await fundirEmpresas(fica, sai);
            console.log(`  fundida "${sai.nome}" em "${fica.nome}":`, r);
            mantida = fica;
        }
    }
    if (!process.argv.includes('--aplicar')) console.log('\n(Para fundir: node scripts/dedupe.js --aplicar)');
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });

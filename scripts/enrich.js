// Enriquece empresas (decisores, morada, contactos publicados) a partir do terminal.
// Uso:
//   node scripts/enrich.js --nome="Payhawk" --url=https://payhawk.com    (testa um site, sem base de dados)
//   node scripts/enrich.js --limite=10 --sem-gravar                      (empresas pendentes: mostra, não grava)
//   node scripts/enrich.js --limite=20                                   (enriquece e grava)
require('dotenv').config({ quiet: true });

const { enriquecerEmpresa, enriquecerPendentes, MODELO } = require('../routes/services/enrichment.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=').slice(1).join('=');
const gravar = !process.argv.includes('--sem-gravar');

function mostrar(nome, r) {
    console.log(`\n=== ${nome}`);
    console.log('Páginas lidas:', r.paginas);
    if (r.saltadas?.length) console.log('Não lidas:', r.saltadas);
    if (r.vazio) return console.log('Sem dados:', r.motivo);
    const e = r.extraido;
    console.log('Sobre:', e.sobre);
    console.log('Sede:', [e.cidade, e.pais].filter(Boolean).join(', ') || '-', '| Morada:', e.morada || '-');
    console.log('Contactos gerais:', e.email_geral || '-', '|', e.telefone || '-');
    console.log('Redes (publicadas no site):', r.redes);
    console.log('Decisores:');
    e.decisores.forEach((d) => console.log(`  - ${d.nome} | ${d.cargo || '-'} | ${d.categoria}${d.linkedin_url ? ' | ' + d.linkedin_url : ''}${d.email ? ' | ' + d.email : ''}\n      fonte: ${d.fonte_url}`));
}

(async () => {
    const url = arg('url');
    if (url) {
        console.log(`Teste de um site | modelo: ${MODELO}`);
        const r = await enriquecerEmpresa({ nome: arg('nome') || url, website: url });
        mostrar(arg('nome') || url, r);
        console.log('\nUso:', r.uso);
        return;
    }

    console.log(`Enriquecimento ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${arg('limite') || 20}`);
    const r = await enriquecerPendentes({ limite: arg('limite') || 20, gravar });
    r.detalhe.forEach((d) => (d.erro ? console.log(`\n=== ${d.nome}\nERRO: ${d.erro}`) : mostrar(d.nome, { vazio: d.vazio, motivo: d.motivo, paginas: d.paginas, extraido: d.extraido, redes: d.redes })));
    const { detalhe, ...resto } = r;
    console.log('\nResumo:', resto);
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

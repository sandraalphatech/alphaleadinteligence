// Identifica empresas (website, país, cidade, sector) a partir do terminal.
// Uso:
//   node scripts/identify.js --nome="Payhawk" --pais=BG       (testa uma empresa, sem base de dados)
//   node scripts/identify.js --limite=10 --sem-gravar         (empresas pendentes: mostra, não grava)
//   node scripts/identify.js --limite=20                      (identifica e grava)
require('dotenv').config({ quiet: true });

const { identificarEmpresa, identificarPendentes, MODELO } = require('../routes/services/identification.service');

const arg = (nome) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || '').split('=').slice(1).join('=');
const gravar = !process.argv.includes('--sem-gravar');
const pesquisaPaga = !process.argv.includes('--sem-pesquisa-paga');     // só tenta o método grátis

(async () => {
    const nome = arg('nome');

    if (nome) {
        console.log(`Teste de uma empresa: ${nome} | modelo: ${MODELO}\n`);
        const r = await identificarEmpresa({ nome, pais: arg('pais') || null, sector: arg('sector') || null, descricao: arg('descricao') || null }, { pesquisaPaga });
        console.log('Método:', r.metodo || 'nenhum (não encontrado)');
        console.log('Confirmação grátis:', r.confirmacao);
        console.log('Pesquisa da Claude:', r.pesquisa);
        console.log('Verificação do site:', r.verificacao);
        console.log('A gravar na empresa:', r.alterar);
        console.log('Uso:', r.uso);
        return;
    }

    console.log(`Identificação ${gravar ? 'COM gravação' : 'de teste (sem gravar)'} | limite: ${arg('limite') || 20}\n`);
    const r = await identificarPendentes({ limite: arg('limite') || 20, gravar, pesquisaPaga });
    r.detalhe.forEach((d) => console.log(`- ${d.nome}: ${d.estado}${d.metodo ? ' [' + d.metodo + ']' : ''}${d.website ? ' -> ' + d.website : ''}\n    ${d.notas || ''}`));
    const { detalhe, ...resto } = r;
    console.log('\nResumo:', resto);
})().catch((e) => { console.error('\nFalhou:', e.message); process.exit(1); });

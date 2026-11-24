// Testa os conectores do Radar sem precisar da aplicação nem de login.
// Uso:  node scripts/test-connectors.js            (todos)
//       node scripts/test-connectors.js hacker_news product_hunt
// Não grava nada: só mostra o que cada fonte devolve.

const { recolher } = require('../routes/services/connectors');

(async () => {
    const ids = process.argv.slice(2);
    console.log(`A recolher${ids.length ? ' de: ' + ids.join(', ') : ' de todas as fontes'}...\n`);

    const relatorio = await recolher({ ids });
    let total = 0;

    for (const r of relatorio) {
        total += r.itens.length;
        console.log(`${r.ok ? 'OK  ' : 'ERRO'} ${r.nome}: ${r.itens.length} itens (${r.ms} ms)${r.erro ? ' - ' + r.erro : ''}`);
        r.itens.slice(0, 3).forEach((i) => {
            console.log(`       - [${i.idioma || '?'}/${i.regiao || '?'}] ${i.titulo.slice(0, 90)}`);
            console.log(`         ${i.url}`);
        });
    }
    console.log(`\nTotal: ${total} itens únicos.`);
})();

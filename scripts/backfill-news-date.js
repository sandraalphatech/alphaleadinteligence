// Preenche a data de publicação da notícia (origem_data) nas empresas que já existiam antes de esta coluna ser criada.
// Volta a ler as fontes e junta pela ligação da notícia. As notícias que já saíram dos feeds ficam sem data.
// Uso:  node scripts/backfill-news-date.js [--sem-gravar]
require('dotenv').config({ quiet: true });

const { supabaseAdmin } = require('../routes/services/supabase.service');
const { recolher } = require('../routes/services/connectors');

(async () => {
    const gravar = !process.argv.includes('--sem-gravar');
    const { data: empresas, error } = await supabaseAdmin.from('empresas').select('id, nome, origem_url').not('origem_url', 'is', null).is('origem_data', null);
    if (error) throw new Error('Não foi possível ler as empresas (já correste o analysis.sql?): ' + error.message);

    const relatorio = await recolher({ dias: 60 });
    const datas = new Map(relatorio.flatMap((r) => r.itens).map((i) => [i.url, i.publicado_em]));

    let feitas = 0;
    for (const e of empresas) {
        // 1.º a data que a fonte indica; 2.º o padrão /AAAA/MM/DD/ que alguns sites põem no endereço
        let data = datas.get(e.origem_url) || null;
        if (!data) { const m = e.origem_url.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//); if (m) data = `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`; }
        if (!data) { console.log(`- ${e.nome}: sem data (a notícia já não está nos feeds)`); continue; }
        console.log(`- ${e.nome}: ${String(data).slice(0, 10)}`);
        if (gravar) {
            const { error: erro } = await supabaseAdmin.from('empresas').update({ origem_data: data, ultima_origem: 'validacao' }).eq('id', e.id);
            if (erro) throw new Error(erro.message);
        }
        feitas++;
    }
    console.log(`\n${feitas} de ${empresas.length} empresas ${gravar ? 'atualizadas' : 'teriam data (teste, nada gravado)'}.`);
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });

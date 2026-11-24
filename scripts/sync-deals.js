// Põe os negócios em linha com o estado dos leads, para os dados que já existiam antes de a plataforma os sincronizar sozinha:
//   - lead em «negócio fechado» com negócio aberto  → o negócio passa a GANHO
//   - lead em «negócio fechado» sem nenhum negócio  → cria-se um negócio GANHO (com o valor da proposta mais recente, se houver)
//   - lead em «oportunidade perdida» / «proposta recusada» com negócio aberto → o negócio passa a PERDIDO
// Uso:
//   node scripts/sync-deals.js            (só mostra o que faria: não grava nada)
//   node scripts/sync-deals.js --gravar   (faz as alterações)
require('dotenv').config();
const { supabaseAdmin } = require('../routes/services/supabase.service');
const deals = require('../routes/services/deal.service');

(async () => {
    const gravar = process.argv.includes('--gravar');
    const { data: leads, error } = await supabaseAdmin.from('leads').select('id, estado, empresa_id, empresas(nome)').in('estado', ['negocio_fechado', 'oportunidade_perdida', 'proposta_recusada']);
    if (error) throw new Error(error.message);
    const acoes = [];
    for (const l of leads || []) {
        const { data: negocios, error: e2 } = await supabaseAdmin.from('negocios').select('id, estado').eq('lead_id', l.id);
        if (e2) throw new Error('A tabela dos negócios não existe? Corra database/deals.sql. (' + e2.message + ')');
        const abertos = (negocios || []).filter((n) => n.estado === 'aberto'), ganhos = (negocios || []).filter((n) => n.estado === 'ganho');
        if (l.estado === 'negocio_fechado') {
            if (abertos.length) acoes.push({ l, texto: 'fechar como GANHO o negócio aberto' });
            else if (!ganhos.length) acoes.push({ l, texto: 'criar um negócio GANHO' });
        } else if (abertos.length) acoes.push({ l, texto: 'fechar como PERDIDO o negócio aberto' });
    }
    if (!acoes.length) { console.log('Tudo em linha: os negócios já refletem o estado dos leads.'); return; }
    for (const a of acoes) {
        console.log(`- ${a.l.empresas?.nome || a.l.id} (${a.l.estado}): ${a.texto}`);
        if (gravar) { const r = await deals.sincronizarComLead({ id: a.l.id, empresa_id: a.l.empresa_id }, a.l.estado); console.log('    feito:', r ? JSON.stringify(r) : 'nada a fazer'); }
    }
    if (!gravar) console.log('\nNão se gravou nada. Para fazer estas alterações: node scripts/sync-deals.js --gravar');
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });

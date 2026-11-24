// Procura o WhatsApp que cada empresa PUBLICA no seu próprio site (botão "falar no WhatsApp": ligação wa.me/<número>
// ou api.whatsapp.com/send?phone=<número>) e guarda-o em redes.whatsapp. Serve para as empresas já recolhidas: as novas
// passam a ser verificadas pelo enriquecimento normal.
//
// Regras: só lê o site oficial da empresa (início + as páginas de contacto/equipa), respeita o robots.txt, não usa IA
// e nunca adivinha: só guarda números que estão escritos numa ligação do site e que são válidos.
//
// Uso:
//   node scripts/find-whatsapp.js              (só mostra o que encontraria: não grava nada)
//   node scripts/find-whatsapp.js --gravar     (guarda redes.whatsapp nas empresas onde encontrou)
require('dotenv').config();

const { supabaseAdmin } = require('../routes/services/supabase.service');
const { descarregar, normalizarDominio } = require('../routes/services/website.service');
const { podeLer } = require('../routes/services/robots.service');
const { escolherPaginas, numerosWhatsapp } = require('../routes/services/enrichment.service');
const { actualizarEmpresa } = require('../routes/services/dedup.service');

const gravar = process.argv.includes('--gravar');
const mesmoSite = (urlFinal, base) => { const d = normalizarDominio(urlFinal); return !!d && (d === base || d.endsWith('.' + base)); };

async function ler(url, base) {
    if (!(await podeLer(url))) return null;
    try {
        const p = await descarregar(url);
        return p.status >= 200 && p.status < 300 && mesmoSite(p.urlFinal, base) ? p : null;     // um redirecionamento para outro site não conta
    } catch { return null; }
}

(async () => {
    const { data: empresas, error } = await supabaseAdmin.from('empresas').select('id, nome, website, redes').not('website', 'is', null).order('nome');
    if (error) throw new Error(error.message);
    console.log(`${gravar ? 'COM gravação' : 'Só a mostrar (sem gravar)'} | ${empresas.length} empresas com website\n`);

    let encontradas = 0;
    for (const e of empresas) {
        const base = normalizarDominio(e.website);
        if (!base) continue;
        const inicio = await ler(e.website, base);
        if (!inicio) { console.log(`${e.nome.padEnd(26)} (site não lido)`); continue; }
        const paginas = [inicio];
        for (const url of escolherPaginas(inicio.html, inicio.urlFinal, base)) {
            const p = await ler(url, base);
            if (p && !paginas.some((x) => x.urlFinal === p.urlFinal)) paginas.push(p);
        }
        const numeros = [...new Set(paginas.flatMap((p) => numerosWhatsapp(p.html)))];
        if (!numeros.length) { console.log(`${e.nome.padEnd(26)} sem WhatsApp publicado (${paginas.length} página(s))`); continue; }
        encontradas++;
        console.log(`${e.nome.padEnd(26)} ${numeros.join(', ')}${numeros.length > 1 ? '  (vários: fica o primeiro)' : ''}`);
        if (gravar && e.redes?.whatsapp !== numeros[0]) await actualizarEmpresa(e.id, { redes: { ...(e.redes || {}), whatsapp: numeros[0] } }, 'enriquecimento');
    }
    console.log(`\n${encontradas} empresa(s) com WhatsApp publicado.${gravar ? ' Guardado.' : ' (Nada foi gravado: use --gravar.)'}`);
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });

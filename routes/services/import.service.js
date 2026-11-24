// Importar empresas de um ficheiro CSV (Etapa 8).
//
// FLUXO: 1) o utilizador carrega o ficheiro e vê uma PRÉ-VISUALIZAÇÃO (nada é gravado); 2) confirma e só então se grava.
// O servidor volta a analisar o ficheiro ao gravar: nunca confia no que o browser diz que foi pré-visualizado.
//
// REGRAS
//  - Só é obrigatório o nome da empresa. Tudo o resto é validado e, se estiver mal, é ignorado com um aviso (nunca se grava lixo).
//  - Não se alteram empresas que já existem: uma linha repetida (mesmo site, ou mesmo nome no mesmo país) é saltada.
//    Se a empresa já existe e está em «Não contactar», a linha fica marcada como tal.
//  - Cada empresa nova fica com um lead em «novo» (a análise e o enriquecimento fazem-se depois, pelo fluxo normal) e com a fonte «importação»,
//    para se saber sempre de onde veio. A pessoa de contacto, se vier no ficheiro, fica como decisor.
const { supabaseAdmin } = require('./supabase.service');
const { lerCsv } = require('./csv.service');
const { normalizarNome, normalizarNomePessoa, normalizarEmail, validarEmail, normalizarTelefone } = require('./normalization.service');
const { normalizarDominio } = require('./website.service');
const { regiaoDoPais, SECTORES } = require('./radar.catalog');
const linkedin = require('./linkedin.service');
const instagram = require('./instagram.service');
const whatsapp = require('./whatsapp.service');

const LOTE = 100;
const MAX_PREVIA = 200;
const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });

const chave = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const limpar = (v, max) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Nomes de colunas aceites (sem acentos, maiúsculas nem pontuação): o ficheiro pode vir em português, inglês ou espanhol.
const COLUNAS = {
    nome: ['nome', 'name', 'empresa', 'company', 'companyname', 'nomedaempresa', 'nombre', 'startup'],
    website: ['website', 'site', 'url', 'web', 'dominio', 'domain', 'sitio', 'sitioweb'],
    pais: ['pais', 'country', 'paiscodigo', 'countrycode'],
    idioma: ['idioma', 'language', 'lingua', 'lang'],
    setor: ['setor', 'sector', 'industria', 'industry'],
    cidade: ['cidade', 'city', 'ciudad'],
    descricao: ['descricao', 'description', 'sobre', 'about', 'descripcion'],
    email: ['email', 'emailgeral', 'emaildaempresa', 'companyemail', 'correo'],
    telefone: ['telefone', 'phone', 'tel', 'telefono'],
    linkedin: ['linkedin', 'linkedinempresa', 'companylinkedin'],
    instagram: ['instagram'],
    whatsapp: ['whatsapp'],
    contacto_nome: ['contactonome', 'contactname', 'nomecontacto', 'pessoa', 'person', 'fundador', 'founder', 'ceo', 'contacto', 'contact'],
    contacto_cargo: ['contactocargo', 'cargo', 'role', 'title', 'jobtitle', 'contactrole', 'puesto'],
    contacto_email: ['contactoemail', 'emailcontacto', 'contactemail', 'personemail', 'emailpessoa'],
    contacto_linkedin: ['contactolinkedin', 'linkedinpessoa', 'linkedincontacto', 'personlinkedin', 'contactlinkedin']
};
const CAMPOS_PT = { nome: 'nome', website: 'site', pais: 'país', idioma: 'idioma', setor: 'setor', cidade: 'cidade', descricao: 'descrição', email: 'email', telefone: 'telefone',
    linkedin: 'LinkedIn', instagram: 'Instagram', whatsapp: 'WhatsApp', contacto_nome: 'contacto (nome)', contacto_cargo: 'contacto (cargo)', contacto_email: 'contacto (email)', contacto_linkedin: 'contacto (LinkedIn)' };

function mapearColunas(cabecalho) {
    const mapa = {}, ignoradas = [];
    cabecalho.forEach((titulo, n) => {
        const k = chave(titulo);
        const campo = Object.keys(COLUNAS).find((c) => COLUNAS[c].includes(k) && !(c in mapa));
        if (campo) mapa[campo] = n; else if (titulo) ignoradas.push(titulo);
    });
    return { mapa, ignoradas };
}

// ---------- países e idiomas (aceita códigos e nomes em pt, en ou es) ----------
let paisesPorNome = null;
function tabelaPaises() {
    if (paisesPorNome) return paisesPorNome;
    paisesPorNome = new Map();
    const nomes = ['en', 'pt', 'es'].map((l) => new Intl.DisplayNames([l], { type: 'region' }));
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const c = String.fromCharCode(a, b);
        nomes.forEach((dn) => { try { const n = dn.of(c); if (n && n !== c && n.length > 2) paisesPorNome.set(chave(n), c); } catch { /* código que não existe */ } });
    }
    [['uk', 'GB'], ['reinounido', 'GB'], ['eua', 'US'], ['usa', 'US'], ['estadosunidos', 'US'], ['holanda', 'NL'], ['brasil', 'BR']].forEach(([n, c]) => paisesPorNome.set(n, c));
    return paisesPorNome;
}
function normalizarPais(v) {
    const t = limpar(v, 60);
    if (!t) return { valor: null };
    const k = chave(t), tab = tabelaPaises();
    if (/^uk$/i.test(t)) return { valor: 'GB' };
    if (/^[A-Za-z]{2}$/.test(t)) { const c = t.toUpperCase(); return new Intl.DisplayNames(['en'], { type: 'region' }).of(c) !== c ? { valor: c } : { valor: null, aviso: `país «${t}» desconhecido` }; }
    const c = tab.get(k);
    return c ? { valor: c } : { valor: null, aviso: `país «${t}» não reconhecido` };
}
const IDIOMAS_NOMES = { pt: ['pt', 'portugues', 'portuguese', 'ptpt', 'ptbr', 'portuguesbrasil'], en: ['en', 'ingles', 'english', 'enus', 'engb'], es: ['es', 'espanhol', 'espanol', 'spanish', 'castellano'] };
function normalizarIdioma(v) {
    const t = limpar(v, 30);
    if (!t) return { valor: null };
    const k = chave(t), l = Object.keys(IDIOMAS_NOMES).find((x) => IDIOMAS_NOMES[x].includes(k));
    return l ? { valor: l } : { valor: null, aviso: `idioma «${t}» não suportado (usa pt, en ou es)` };
}
function normalizarSetor(v) {
    const t = limpar(v, 60);
    if (!t) return { valor: null };
    const k = chave(t), s = SECTORES.find((x) => chave(x) === k);
    return s ? { valor: s } : { valor: null, aviso: `setor «${t}» não reconhecido (ficou em branco)` };
}
function categoriaDoCargo(cargo) {
    const c = chave(cargo);
    if (/founder|fundador|cofundador|cofounder|fundadora/.test(c)) return 'fundador';
    if (/^ceo|chiefexecutive|diretorgeral|directorgeneral|managingdirector|gerente|presidente/.test(c)) return 'ceo';
    if (/market|cmo|brand|marca|growth|comunica/.test(c)) return 'marketing';
    if (/sales|vendas|comercial|business|cro|ventas/.test(c)) return 'comercial';
    if (/tech|cto|engineer|engenh|tecnolog|product|produto/.test(c)) return 'tecnologia';
    return 'outro';
}

// ---------- uma linha -> dados normalizados + avisos (função pura) ----------
function normalizarLinha(celulas, mapa) {
    const v = (campo) => (campo in mapa ? String(celulas[mapa[campo]] ?? '') : '');
    const avisos = [];
    const nome = limpar(v('nome'), 200);
    if (!nome) return { invalida: 'falta o nome da empresa', avisos };

    let website = null, dominio = null;
    const bruto = limpar(v('website'), 300);
    if (bruto) {
        dominio = normalizarDominio(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
        if (dominio && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio) && dominio.length <= 120) website = `https://${dominio}`;
        else { dominio = null; avisos.push(`site «${bruto.slice(0, 40)}» não é válido (ficou em branco)`); }
    }
    const pais = normalizarPais(v('pais')); if (pais.aviso) avisos.push(pais.aviso);
    const idioma = normalizarIdioma(v('idioma')); if (idioma.aviso) avisos.push(idioma.aviso);
    const setor = normalizarSetor(v('setor')); if (setor.aviso) avisos.push(setor.aviso);

    let email = null;
    if (limpar(v('email'), 200)) { email = normalizarEmail(v('email')); if (!email) avisos.push(`email «${limpar(v('email'), 40)}» não é válido (ficou em branco)`); }
    let telefone = null;
    if (limpar(v('telefone'), 40)) { telefone = normalizarTelefone(v('telefone'), pais.valor); if (!telefone) avisos.push(`telefone «${limpar(v('telefone'), 25)}» não é válido (precisa do indicativo, ex.: +351…)`); }

    const redes = {};
    if (limpar(v('linkedin'), 300)) { const u = linkedin.urlPagina(limpar(v('linkedin'), 300)); if (u) redes.linkedin = u; else avisos.push('LinkedIn da empresa inválido (tem de ser linkedin.com/company/…)'); }
    if (limpar(v('instagram'), 300)) { const c = instagram.contaInstagram(limpar(v('instagram'), 300).replace(/^@/, 'https://www.instagram.com/')); if (c) redes.instagram = c.url; else avisos.push('Instagram inválido'); }
    if (limpar(v('whatsapp'), 40)) { const n = whatsapp.numeroWhatsapp(limpar(v('whatsapp'), 40)); if (n) redes.whatsapp = n.numero; else avisos.push('WhatsApp inválido (precisa do indicativo, ex.: +351…)'); }

    let contacto = null;
    const cn = limpar(v('contacto_nome'), 90);
    if (cn) {
        const ce = limpar(v('contacto_email'), 200) ? normalizarEmail(v('contacto_email')) : null;
        if (limpar(v('contacto_email'), 200) && !ce) avisos.push('email do contacto inválido (ficou em branco)');
        const cl = limpar(v('contacto_linkedin'), 300) ? linkedin.urlPerfil(limpar(v('contacto_linkedin'), 300)) : null;
        if (limpar(v('contacto_linkedin'), 300) && !cl) avisos.push('LinkedIn do contacto inválido (tem de ser linkedin.com/in/…)');
        const cargo = limpar(v('contacto_cargo'), 90) || null;
        contacto = { nome: cn, cargo, categoria: categoriaDoCargo(cargo), email: ce, linkedin_url: cl };
    } else if (limpar(v('contacto_email'), 200) || limpar(v('contacto_linkedin'), 200)) avisos.push('há dados de contacto sem o nome da pessoa (ignorados)');

    return {
        dados: { nome, nome_normalizado: normalizarNome(nome), website, dominio, pais: pais.valor, idioma: idioma.valor, sector: setor.valor, cidade: limpar(v('cidade'), 80) || null,
            descricao: limpar(v('descricao'), 600) || null, email_geral: email, telefone, redes: Object.keys(redes).length ? redes : null, contacto },
        avisos
    };
}

// ---------- analisar o ficheiro (com a base de dados, sem gravar) ----------
const emLotes = (lista) => { const r = []; for (let i = 0; i < lista.length; i += LOTE) r.push(lista.slice(i, i + LOTE)); return r; };
async function procurarExistentes(linhas) {
    const doms = [...new Set(linhas.map((l) => l.dados?.dominio).filter(Boolean))];
    const nomes = [...new Set(linhas.map((l) => l.dados?.nome_normalizado).filter(Boolean))];
    const achadas = new Map();
    const guardar = (lista) => (lista || []).forEach((e) => achadas.set(e.id, e));
    const campos = 'id, nome, nome_normalizado, pais, dominio, nao_contactar';
    for (const parte of emLotes(doms)) { const { data, error } = await supabaseAdmin.from('empresas').select(campos).in('dominio', parte); if (error) throw new Error(error.message); guardar(data); }
    for (const parte of emLotes(nomes)) { const { data, error } = await supabaseAdmin.from('empresas').select(campos).in('nome_normalizado', parte); if (error) throw new Error(error.message); guardar(data); }
    return [...achadas.values()];
}

// Devolve { colunas, ignoradas, total, resumo, linhas: [{ linha, estado, motivos, avisos, dados }] }. estado: nova | existente | repetida | nao_contactar | invalida
async function analisarCsv(texto) {
    const csv = lerCsv(texto);
    const { mapa, ignoradas } = mapearColunas(csv.cabecalho);
    if (!('nome' in mapa)) throw erro('INVALIDO', 'Não encontrei a coluna com o nome da empresa. Chama-lhe «nome», «name» ou «empresa».');
    const linhas = csv.linhas.map((c, n) => ({ linha: n + 2, ...normalizarLinha(c, mapa) }));
    const existentes = await procurarExistentes(linhas);
    const porDominio = new Map(existentes.filter((e) => e.dominio).map((e) => [e.dominio, e]));
    const porNome = new Map(existentes.map((e) => [`${e.nome_normalizado}|${e.pais || ''}`, e]));
    const vistos = new Map();
    const saida = linhas.map((l) => {
        if (l.invalida) return { linha: l.linha, estado: 'invalida', motivos: [l.invalida], avisos: [], dados: null };
        const d = l.dados;
        const chaveNome = `${d.nome_normalizado}|${d.pais || ''}`;
        const igual = (d.dominio && porDominio.get(d.dominio)) || porNome.get(chaveNome);
        if (igual) return { linha: l.linha, estado: igual.nao_contactar ? 'nao_contactar' : 'existente', motivos: [igual.nao_contactar ? `«${igual.nome}» já existe e está em «Não contactar»` : `já existe na plataforma («${igual.nome}»)`], avisos: l.avisos, dados: d };
        const antes = (d.dominio && vistos.get(`d:${d.dominio}`)) || vistos.get(`n:${chaveNome}`);
        if (antes) return { linha: l.linha, estado: 'repetida', motivos: [`repetida no ficheiro (linha ${antes})`], avisos: l.avisos, dados: d };
        if (d.dominio) vistos.set(`d:${d.dominio}`, l.linha);
        vistos.set(`n:${chaveNome}`, l.linha);
        return { linha: l.linha, estado: 'nova', motivos: [], avisos: l.avisos, dados: d };
    });
    const resumo = { nova: 0, existente: 0, repetida: 0, nao_contactar: 0, invalida: 0, com_avisos: 0 };
    saida.forEach((l) => { resumo[l.estado]++; if (l.avisos.length) resumo.com_avisos++; });
    return {
        colunas: Object.keys(mapa).map((c) => ({ campo: c, rotulo: CAMPOS_PT[c], coluna: csv.cabecalho[mapa[c]] })), ignoradas, separador: csv.separador,
        truncado: csv.truncado, total: saida.length, resumo, linhas: saida
    };
}

// A pré-visualização que o browser recebe: o resumo todo, mas só as primeiras linhas (e as que merecem atenção primeiro).
async function previsao(texto) {
    const a = await analisarCsv(texto);
    const peso = { invalida: 0, nao_contactar: 1, existente: 2, repetida: 3, nova: 4 };
    const mostrar = [...a.linhas].sort((x, y) => (peso[x.estado] - peso[y.estado]) || (y.avisos.length - x.avisos.length) || (x.linha - y.linha)).slice(0, MAX_PREVIA)
        .map(({ linha, estado, motivos, avisos, dados }) => ({ linha, estado, motivos, avisos, nome: dados?.nome || null, site: dados?.dominio || null, pais: dados?.pais || null, contacto: dados?.contacto?.nome || null }));
    return { colunas: a.colunas, ignoradas: a.ignoradas, truncado: a.truncado, total: a.total, resumo: a.resumo, linhas: mostrar, limite_previa: MAX_PREVIA };
}

// ---------- gravar ----------
async function validarEmailsEmParalelo(emails) {
    const unicos = [...new Set(emails.filter(Boolean))];
    const estados = new Map();
    let n = 0;
    await Promise.all(Array.from({ length: Math.min(15, unicos.length) }, async () => {
        while (n < unicos.length) { const e = unicos[n++]; estados.set(e, await validarEmail(e).catch(() => null)); }
    }));
    return estados;
}

async function importarCsv(texto, { nomeFicheiro, utilizador } = {}) {
    const a = await analisarCsv(texto);
    const novas = a.linhas.filter((l) => l.estado === 'nova');
    const resultado = { total: a.total, importadas: 0, contactos: 0, ...a.resumo, recusadas_pela_base: 0, erros: 0, fonte: null };
    if (!novas.length) return resultado;

    const ficheiro = limpar(nomeFicheiro, 80) || 'ficheiro.csv';
    const quando = new Date().toISOString().slice(0, 10);
    const { data: fonte, error: eFonte } = await supabaseAdmin.from('fontes').insert({ nome: `Importação: ${ficheiro} (${quando})`, tipo: 'importacao', activa: true }).select('id, nome').single();
    if (eFonte) throw new Error('Não foi possível registar a fonte da importação: ' + eFonte.message);
    resultado.fonte = fonte.nome;

    const estadosEmail = await validarEmailsEmParalelo(novas.flatMap((l) => [l.dados.email_geral, l.dados.contacto?.email]));
    for (const l of novas) {
        const d = l.dados;
        try {
            const { data: empresa, error } = await supabaseAdmin.from('empresas').insert({
                nome: d.nome, nome_normalizado: d.nome_normalizado, dominio: d.dominio, website: d.website, pais: d.pais, regiao: d.pais ? regiaoDoPais(d.pais) : null,
                idioma: d.idioma, sector: d.sector, cidade: d.cidade, descricao: d.descricao, email_geral: d.email_geral, email_geral_estado: d.email_geral ? (estadosEmail.get(d.email_geral) || null) : null,
                telefone: d.telefone, redes: d.redes, fonte_id: fonte.id, nao_contactar: false, ultima_origem: 'importacao'
            }).select('id').single();
            if (error) { if (error.code === '23505') resultado.recusadas_pela_base++; else resultado.erros++; continue; }
            const { error: eLead } = await supabaseAdmin.from('leads').insert({ empresa_id: empresa.id, estado: 'novo', ultima_origem: 'importacao' });
            if (eLead) { resultado.erros++; continue; }
            resultado.importadas++;
            if (d.contacto) {
                const c = d.contacto;
                const { error: eDec } = await supabaseAdmin.from('decisores').insert({
                    empresa_id: empresa.id, nome: c.nome, nome_normalizado: normalizarNomePessoa(c.nome) || null, cargo: c.cargo, categoria: c.categoria, email: c.email,
                    email_estado: c.email ? (estadosEmail.get(c.email) || null) : null, linkedin_url: c.linkedin_url, fonte_url: `importacao:${ficheiro}`, ultima_origem: 'importacao'
                });
                if (!eDec) resultado.contactos++;
            }
        } catch (e) { console.error('Importação, linha', l.linha, String(e.message).slice(0, 120)); resultado.erros++; }
    }
    resultado.nova = resultado.importadas;
    return resultado;
}

module.exports = { analisarCsv, previsao, importarCsv, normalizarLinha, mapearColunas, normalizarPais, normalizarIdioma, normalizarSetor, categoriaDoCargo, COLUNAS, MAX_PREVIA };

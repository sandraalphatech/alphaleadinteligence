// Normalização e validação de dados: nomes, emails e telefones.
// O objetivo é que "Acme, Inc.", "ACME" e "Acme Ltd" sejam reconhecidos como a mesma empresa,
// e que só fiquem guardados emails e telefones com formato e destino válidos.

const dns = require('dns').promises;
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const semAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Palavras que identificam o tipo jurídico e não a empresa
const JURIDICAS = new Set(['inc', 'incorporated', 'ltd', 'limited', 'llc', 'llp', 'plc', 'corp', 'corporation', 'co', 'company',
    'gmbh', 'ag', 'bv', 'nv', 'ab', 'oy', 'as', 'aps', 'sa', 'sl', 'sas', 'sarl', 'srl', 'spa', 'lda', 'unipessoal', 'ltda', 'eireli', 'me', 'epp',
    'the', 'group', 'holdings', 'holding']);

// Nome da empresa -> forma comparável. "Acme, Inc." e "ACME Ltd" dão ambos "acme".
function normalizarNome(nome) {
    const palavras = semAcentos(nome).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const sem = palavras.filter((p) => !JURIDICAS.has(p));
    return (sem.length ? sem : palavras).join(' ');
}

const TITULOS = new Set(['dr', 'dra', 'prof', 'professor', 'eng', 'engr', 'mr', 'mrs', 'ms', 'miss', 'sir', 'phd', 'md', 'mba', 'jr', 'sr', 'dipl', 'ing']);

// Pessoa -> forma comparável. "Dr. Thomas Sinn" e "Thomas Sinn" dão ambos "thomas sinn".
function normalizarNomePessoa(nome) {
    return semAcentos(nome).replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter((p) => p && !TITULOS.has(p)).join(' ');
}

// ---------- emails ----------
const FORMATO_EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

function normalizarEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return FORMATO_EMAIL.test(e) && e.length <= 120 ? e : null;
}

const comTempo = (promessa, ms) => Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error('tempo')), ms))]);
const cacheMx = new Map();

// 'valido' (formato certo e o domínio recebe correio) | 'sem_mx' (o domínio não recebe correio) | 'invalido' (formato errado)
async function validarEmail(email) {
    const e = normalizarEmail(email);
    if (!e) return 'invalido';
    const dominio = e.split('@')[1];
    if (!cacheMx.has(dominio)) {
        let tem = false;
        try { tem = (await comTempo(dns.resolveMx(dominio), 5000)).length > 0; } catch { tem = false; }
        cacheMx.set(dominio, tem);
    }
    return cacheMx.get(dominio) ? 'valido' : 'sem_mx';
}

// ---------- telefones ----------
// Devolve o número no formato internacional (E.164, ex.: +442045865402) ou null se não for válido.
// O país da empresa ajuda quando o número vem sem indicativo.
function normalizarTelefone(telefone, pais) {
    if (!telefone) return null;
    try {
        const n = parsePhoneNumberFromString(String(telefone).trim(), pais || undefined);
        return n && n.isValid() ? n.format('E.164') : null;
    } catch { return null; }
}

// Limpa e valida os contactos de uma empresa. Telefone inválido e email inválido são descartados
// (o valor antigo fica no histórico); o estado do email diz se o domínio recebe correio.
async function limparContactosEmpresa({ telefone, email_geral, pais }) {
    const email = email_geral ? normalizarEmail(email_geral) : null;
    const estado = email ? await validarEmail(email) : null;
    return {
        telefone: normalizarTelefone(telefone, pais),
        email_geral: estado === 'invalido' ? null : email,
        email_geral_estado: email ? estado : null
    };
}

module.exports = { normalizarNome, normalizarNomePessoa, normalizarEmail, validarEmail, normalizarTelefone, limparContactosEmpresa };

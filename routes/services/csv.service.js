// CSV: ler (importação) e escrever (exportação). Funções puras, sem base de dados.
//  - Lê ficheiros do Excel e do Google Sheets: separador «;» «,» ou tabulação (deteta sozinho), aspas, aspas dobradas, quebras de linha
//    dentro de aspas, BOM do UTF-8 e finais de linha do Windows.
//  - Escreve com BOM e «;» por defeito (é o que o Excel em português abre bem) e neutraliza «fórmulas»: uma célula que comece por
//    = + - @ passaria a ser executada pelo Excel (injeção de fórmulas), por isso leva um apóstrofo à frente.

const MAX_LINHAS = 5000;
const MAX_COLUNAS = 60;
const MAX_CELULA = 5000;
const SEPARADORES = [';', ',', '\t'];

function detetarSeparador(texto) {
    const primeira = texto.split(/\r\n|\n|\r/)[0] || '';
    let melhor = ';', max = 0;
    for (const s of SEPARADORES) {
        let n = 0, aspas = false;
        for (const c of primeira) { if (c === '"') aspas = !aspas; else if (c === s && !aspas) n++; }
        if (n > max) { max = n; melhor = s; }
    }
    return melhor;
}

// Devolve { separador, cabecalho: [..], linhas: [[..]], truncado }. Lança Error com mensagem para o utilizador se o ficheiro não servir.
function lerCsv(entrada) {
    let texto = String(entrada ?? '').replace(/^﻿/, '');
    if (!texto.trim()) throw Object.assign(new Error('O ficheiro está vazio.'), { codigo: 'VAZIO' });
    const sep = detetarSeparador(texto);
    const linhas = [];
    let campo = '', linha = [], aspas = false, i = 0;
    const fecharCampo = () => { linha.push(campo.slice(0, MAX_CELULA)); campo = ''; };
    const fecharLinha = () => { fecharCampo(); if (linha.some((c) => c.trim() !== '')) linhas.push(linha); linha = []; };
    for (; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
            else campo += c;
        } else if (c === '"' && campo === '') aspas = true;
        else if (c === sep) fecharCampo();
        else if (c === '\r') { if (texto[i + 1] === '\n') i++; fecharLinha(); }
        else if (c === '\n') fecharLinha();
        else campo += c;
        if (linhas.length > MAX_LINHAS + 1) break;
    }
    if (campo !== '' || linha.length) fecharLinha();
    if (aspas && !linhas.length) throw Object.assign(new Error('O ficheiro tem aspas por fechar.'), { codigo: 'INVALIDO' });
    if (linhas.length < 2) throw Object.assign(new Error('O ficheiro precisa de uma linha de cabeçalho e pelo menos uma linha de dados.'), { codigo: 'VAZIO' });
    const cabecalho = linhas[0].map((c) => c.trim());
    if (cabecalho.length > MAX_COLUNAS) throw Object.assign(new Error(`O ficheiro tem demasiadas colunas (máximo ${MAX_COLUNAS}).`), { codigo: 'INVALIDO' });
    const dados = linhas.slice(1, MAX_LINHAS + 1).map((l) => cabecalho.map((_, n) => String(l[n] ?? '').trim()));
    return { separador: sep, cabecalho, linhas: dados, truncado: linhas.length - 1 > MAX_LINHAS };
}

// Uma célula pronta a escrever. Texto que o Excel executaria como fórmula leva um apóstrofo; números e datas não são texto.
function celula(valor, sep = ';') {
    if (valor == null) return '';
    let s = valor instanceof Date ? valor.toISOString() : typeof valor === 'boolean' ? (valor ? 'sim' : 'não') : String(valor);
    if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    s = s.replace(/\u0000/g, '');
    return new RegExp(`["\\r\\n${sep === '\t' ? '\\t' : sep}]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// colunas: [{ chave, titulo }]; linhas: lista de objetos. Devolve o texto completo (com BOM e finais de linha do Windows).
function construirCsv(colunas, linhas, sep = ';') {
    const separador = SEPARADORES.includes(sep) ? sep : ';';
    const cab = colunas.map((c) => celula(c.titulo, separador)).join(separador);
    const corpo = linhas.map((l) => colunas.map((c) => celula(typeof c.valor === 'function' ? c.valor(l) : l[c.chave], separador)).join(separador));
    return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}

module.exports = { lerCsv, construirCsv, celula, detetarSeparador, MAX_LINHAS, MAX_COLUNAS };

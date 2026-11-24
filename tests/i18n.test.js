// Testes de consistência do i18n e das mensagens do servidor. Correr com: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');

function carregarTextos() {
    const src = fs.readFileSync(path.join(raiz, 'assets/js/i18n.js'), 'utf8').replace('return { t, mensagem', 'return { TEXTOS, t, mensagem');
    const guardar = { localStorage: global.localStorage, document: global.document };
    global.localStorage = { getItem() { return null; }, setItem() {} };
    global.document = { documentElement: {}, addEventListener() {}, querySelectorAll() { return []; }, body: { dataset: {} } };
    try { return (0, eval)(src + ';I18N').TEXTOS; }
    finally { global.localStorage = guardar.localStorage; global.document = guardar.document; }
}

test('en, pt e es têm exatamente as mesmas chaves e placeholders', () => {
    const T = carregarTextos();
    const todas = new Set(Object.values(T).flatMap((l) => Object.keys(l)));
    const ph = (s) => (s.match(/\{[a-zA-Z_]+\}/g) || []).sort().join('');
    for (const lang of Object.keys(T)) {
        const faltam = [...todas].filter((k) => !(k in T[lang]));
        assert.deepStrictEqual(faltam, [], `faltam em ${lang}: ${faltam.join(', ')}`);
    }
    for (const k of todas) assert.strictEqual(new Set(Object.keys(T).map((l) => ph(T[l][k]))).size, 1, `placeholders diferentes em ${k}`);
});

test('chaves usadas literalmente no HTML e no JS existem no dicionário', () => {
    const T = carregarTextos();
    const ficheiros = [];
    (function andar(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) andar(p); else if (/\.(js|html)$/.test(f.name) && f.name !== 'i18n.js') ficheiros.push(p); } })(path.join(raiz, 'assets'));
    const falta = [];
    for (const f of ficheiros) {
        const s = fs.readFileSync(f, 'utf8');
        for (const m of s.matchAll(/data-(?:i18n|i18n-aria|title)="([a-zA-Z0-9_]+)"/g)) if (!(m[1] in T.en)) falta.push(`${path.basename(f)}: ${m[1]}`);
        for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+)'\s*\)/g)) if (!(m[1] in T.en)) falta.push(`${path.basename(f)}: ${m[1]}`);
    }
    assert.deepStrictEqual(falta, []);
});

test('mensagens fixas dos serviços têm tradução (en e es)', () => {
    const { FIXAS } = require('../routes/services/messages.service');
    for (const [pt, en, es] of FIXAS) { assert.ok(pt && en && es, `tradução em falta: ${pt}`); }
});

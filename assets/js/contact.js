/* contact.js: botão "Contact", menu de canais e janela de email (usado pelo Radar).
   Canais: Email (ativo), LinkedIn, Instagram e WhatsApp (em breve: um canal de cada vez).
   Fluxo do email: escolher destinatário -> a IA escreve o rascunho -> o utilizador revê ->
   envia daqui (se o SMTP estiver ligado) ou abre no seu email / Gmail / copia -> confirma -> fica registado. */

const Contact = (() => {
    const { api, esc } = NS;
    const t = (k) => I18N.t(k);
    const CANAIS = [
        { id: 'email', nome: 'Email', ativo: true, icone: '<path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/>' },
        { id: 'linkedin', nome: 'LinkedIn', ativo: true, icone: '<path d="M6 9v10M6 5.5v.01M10 19v-6a3 3 0 0 1 6 0v6M10 12v7"/>' },
        { id: 'instagram', nome: 'Instagram', ativo: true, icone: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><path d="M17 7v.01"/>' },
        { id: 'whatsapp', nome: 'WhatsApp', ativo: true, icone: '<path d="M5 19l1.2-3.6A7.5 7.5 0 1 1 9 18z"/>' }
    ];
    const IDIOMAS = [['en', 'English'], ['pt', 'Português'], ['es', 'Español']];

    // ---------- editor com formatação ----------
    const BOTOES_FORMATO = [
        { id: 'bold', cmd: 'bold', rotulo: '<b>B</b>' }, { id: 'italic', cmd: 'italic', rotulo: '<i>I</i>' }, { id: 'underline', cmd: 'underline', rotulo: '<u>U</u>' },
        { id: 'ul', cmd: 'insertUnorderedList', rotulo: '• ≡' }, { id: 'ol', cmd: 'insertOrderedList', rotulo: '1. ≡' },
        { id: 'link', cmd: 'link', rotulo: '🔗' }, { id: 'clear', cmd: 'clear', rotulo: 'T<small>x</small>' }
    ];
    const escapar = (txt) => String(txt).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // O rascunho da IA é texto simples: vira parágrafos (linha em branco) e quebras de linha
    // Remove negrito, itálico, sublinhado e ligações só nos elementos tocados pela seleção (o removeFormat do browser mexe fora dela)
    function limparFormatacao(editor) {
        const sel = getSelection();
        if (!sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        if (!editor.contains(r.commonAncestorContainer)) return;
        editor.querySelectorAll('b,strong,i,em,u,a').forEach((el) => {
            if (!r.intersectsNode(el)) return;
            while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
            el.remove();
        });
    }
    const textoParaHtml = (txt) => String(txt).split(/\n{2,}/).map((p) => `<p>${escapar(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

    // Texto simples do que está no editor (para o email e o Gmail, que só aceitam texto): parágrafos, listas e ligações
    function paraTexto(no) {
        let s = '';
        no.childNodes.forEach((n) => {
            if (n.nodeType === 3) s += n.nodeValue;
            else if (n.nodeType === 1) {
                const tag = n.tagName;
                if (tag === 'BR') s += '\n';
                else if (tag === 'A') { const txt = paraTexto(n), href = n.getAttribute('href') || ''; s += !href || txt.includes(href.replace(/^mailto:/i, '')) ? txt : `${txt} (${href})`; }
                else if (tag === 'LI') s += `- ${paraTexto(n)}\n`;
                else if (tag === 'UL' || tag === 'OL') s += `${paraTexto(n)}\n`;
                else if (tag === 'P' || tag === 'DIV') s += `${paraTexto(n)}\n\n`;
                else if (tag === 'TD' || tag === 'TR') s += `${paraTexto(n)}\n`;
                else s += paraTexto(n);
            }
        });
        return s;
    }
    // ---------- imagens da assinatura ----------
    // A imagem é reduzida no browser (largura máxima 300 px) e guardada embutida; o servidor volta a validar tudo.
    const MAX_LARGURA = 300, MAX_ALTURA = 150, MAX_BASE64 = 150000;
    // Aceita qualquer imagem que o browser leia (PNG, JPG, WebP, GIF...), menos SVG; é sempre reconvertida para PNG ou JPEG, que são os formatos que o servidor aceita
    const TIPOS_IMAGEM = /^image\/(?!svg)/i;
    function reduzirImagem(ficheiro) {
        return new Promise((resolve, reject) => {
            if (!TIPOS_IMAGEM.test(ficheiro.type)) return reject(new Error('tipo'));
            const url = URL.createObjectURL(ficheiro), img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                let escala = Math.min(1, MAX_LARGURA / img.naturalWidth, MAX_ALTURA / img.naturalHeight);
                const png = /png|gif|webp|avif/i.test(ficheiro.type);            // estes podem ter transparência; JPEG fica mais leve
                for (let i = 0; i < 6; i++) {
                    const w = Math.max(1, Math.round(img.naturalWidth * escala)), h = Math.max(1, Math.round(img.naturalHeight * escala));
                    const c = document.createElement('canvas'); c.width = w; c.height = h;
                    const g = c.getContext('2d');
                    if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
                    g.drawImage(img, 0, 0, w, h);
                    const dados = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
                    if (dados.length <= MAX_BASE64) return resolve({ dados, w, h });
                    escala *= 0.7;                                                 // ainda grande: tenta mais pequena
                }
                reject(new Error('grande'));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('tipo')); };
            img.src = url;
        });
    }

    // Texto ao lado da imagem: uma tabela de duas células (esquerda a imagem, direita o resto), a forma que os programas de email aceitam.
    // "baixo" desfaz a tabela: imagem num parágrafo e o resto a seguir.
    function aplicarLayout(editor, lado) {
        const tabela = editor.querySelector('table');
        if (tabela) {
            const f = document.createDocumentFragment();
            tabela.querySelectorAll('td').forEach((td) => { while (td.firstChild) f.appendChild(td.firstChild); });
            tabela.replaceWith(f);
        }
        const img = editor.querySelector('img');
        if (!img) return;
        const pai = img.parentElement;
        img.remove();
        if (pai !== editor && !pai.textContent.trim()) pai.remove();                    // parágrafo que só tinha a imagem
        const resto = [...editor.childNodes].filter((n) => !(n.nodeType === 1 && n.tagName === 'P' && !n.textContent.trim() && !n.querySelector('img')));
        editor.innerHTML = '';
        if (lado) {
            const t = document.createElement('table'), tb = t.appendChild(document.createElement('tbody')), tr = tb.appendChild(document.createElement('tr'));
            t.setAttribute('border', '0'); t.setAttribute('cellpadding', '6'); t.setAttribute('cellspacing', '0');
            const a = tr.appendChild(document.createElement('td')), b = tr.appendChild(document.createElement('td'));
            a.setAttribute('valign', 'middle'); b.setAttribute('valign', 'middle');
            a.appendChild(img);
            resto.forEach((n) => b.appendChild(n));
            if (!b.firstChild) b.innerHTML = '<p><br></p>';
            editor.appendChild(t);
            editor.insertAdjacentHTML('beforeend', '<p><br></p>');                       // linha livre depois da tabela, para o cursor poder sair
        } else {
            const p = document.createElement('p'); p.appendChild(img);
            editor.appendChild(p);
            resto.forEach((n) => editor.appendChild(n));
        }
    }
    // largura em px mantendo a proporção da imagem
    function redimensionar(img, largura) {
        const prop = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : (parseInt(img.getAttribute('height'), 10) || 1) / (parseInt(img.getAttribute('width'), 10) || 1);
        img.setAttribute('width', String(largura)); img.setAttribute('height', String(Math.max(1, Math.round(largura * prop))));
    }

    // Barra de botões + colar, para qualquer editor (mensagem e assinatura).
    // Ao colar entra só o texto (sem cores nem tipos de letra de outras páginas); no editor da assinatura (opções.imagens) cola-se também uma imagem.
    function ligarEditor(barra, editor, aoMudar, opcoes = {}) {
        editor.addEventListener('input', aoMudar);
        let guardada = null;                                                    // posição do cursor, para inserir a imagem depois de escolher o ficheiro
        const lembrar = () => { const s = getSelection(); if (s.rangeCount && editor.contains(s.anchorNode)) guardada = s.getRangeAt(0).cloneRange(); };
        const inserirImagem = async (ficheiro, textoDepois = '') => {
            try {
                const { dados, w, h } = await reduzirImagem(ficheiro);
                editor.focus();
                if (guardada) { const s = getSelection(); s.removeAllRanges(); s.addRange(guardada); }
                document.execCommand('insertHTML', false, `<img src="${dados}" alt="" width="${w}" height="${h}">`);
                if (textoDepois.trim()) { document.execCommand('insertParagraph'); document.execCommand('insertText', false, textoDepois.trim()); }
                aoMudar();
            } catch (e) { opcoes.aoErro?.(e.message === 'grande' ? 'sig_img_big' : 'sig_img_type'); }
        };
        // Imagem que vem só como endereço (ao copiar de um site ou de um email): tenta lê-la; muitos sites não deixam
        const imagemPorEndereco = async (src, textoDepois) => {
            try {
                const r = await fetch(src);
                const blob = await r.blob();
                if (!TIPOS_IMAGEM.test(blob.type)) throw new Error('tipo');
                return inserirImagem(blob, textoDepois);
            } catch {
                if (textoDepois.trim()) {
                    const s = getSelection();
                    const dentro = s.anchorNode && editor.contains(s.anchorNode);
                    editor.focus();
                    if (!dentro && guardada) { s.removeAllRanges(); s.addRange(guardada); }
                    document.execCommand('insertText', false, textoDepois);
                }
                opcoes.aoErro?.('sig_img_ext');                              // depois do texto: inserir texto limpa o estado
            }
        };
        editor.addEventListener('paste', (ev) => {
            ev.preventDefault();
            const cb = ev.clipboardData || window.clipboardData;
            const texto = cb.getData('text/plain'), html = cb.getData('text/html');
            if (opcoes.imagens) {
                const imagem = [...(cb.files || [])].find((f) => TIPOS_IMAGEM.test(f.type));
                const temImgNoHtml = /<img\b/i.test(html);
                // imagem sozinha (print) ou texto com imagem (assinatura copiada de um email): a imagem entra e o texto segue-a.
                // Células copiadas (texto + imagem de pré-visualização, sem <img>) ficam só como texto.
                if (imagem && (!texto.trim() || temImgNoHtml)) { lembrar(); inserirImagem(imagem, texto); return; }
                if (!imagem && temImgNoHtml) {
                    const src = new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') || '';
                    if (/^(data:image\/|blob:|https?:\/\/)/i.test(src)) { lembrar(); imagemPorEndereco(src, texto); return; }
                }
            }
            document.execCommand('insertText', false, texto);
        });
        const ficheiroImagem = opcoes.imagens ? Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' }) : null;
        ficheiroImagem?.addEventListener('change', () => { const f = ficheiroImagem.files[0]; ficheiroImagem.value = ''; if (f) inserirImagem(f); });
        barra.addEventListener('mousedown', (ev) => { if (ev.target.closest('button')) ev.preventDefault(); });
        barra.addEventListener('click', (ev) => {
            const b = ev.target.closest('button[data-cmd]');
            if (!b) return;
            const noSel = getSelection().anchorNode;
            if (!noSel || !editor.contains(noSel)) editor.focus();
            if (b.dataset.cmd === 'image') { lembrar(); ficheiroImagem?.click(); return; }
            if (b.dataset.cmd === 'link') {
                const url = (prompt(t('fmt_link_prompt'), 'https://') || '').trim();
                if (/^(https?:\/\/|mailto:)\S+$/i.test(url)) document.execCommand('createLink', false, url);      // só ligações seguras
            } else if (b.dataset.cmd === 'clear') {
                limparFormatacao(editor);
            } else {
                document.execCommand(b.dataset.cmd);
            }
            aoMudar();
        });
    }
    const barraHtml = (comImagem) => `<div class="editor-barra" role="toolbar" aria-label="${esc(t('fmt_toolbar'))}">${(comImagem ? [...BOTOES_FORMATO.slice(0, -1), { id: 'image', cmd: 'image', rotulo: '🖼' }, BOTOES_FORMATO.at(-1)] : BOTOES_FORMATO).map((b) => `<button type="button" data-cmd="${b.cmd}" title="${esc(t('fmt_' + b.id))}" aria-label="${esc(t('fmt_' + b.id))}">${b.rotulo}</button>`).join('')}</div>`;
    // O bloco da assinatura é só uma marca para a podermos atualizar; ao enviar/copiar desfaz-se o bloco e fica o conteúdo
    function htmlFinal(editor) {
        const c = editor.cloneNode(true);
        c.querySelectorAll('[data-assinatura]').forEach((b) => { while (b.firstChild) b.parentNode.insertBefore(b.firstChild, b); b.remove(); });
        return c;
    }
    const lerTexto = (editor) => paraTexto(editor).replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    // ---------- menu de canais ----------
    let menu = null;
    function fecharMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('click', foraDoMenu, true); document.removeEventListener('keydown', teclaMenu); } }
    const foraDoMenu = (ev) => { if (menu && !menu.contains(ev.target)) fecharMenu(); };
    const teclaMenu = (ev) => { if (ev.key === 'Escape') fecharMenu(); };

    function abrirMenu(botao, empresa, aoRegistar) {
        fecharMenu();
        menu = document.createElement('div');
        menu.className = 'contact-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = CANAIS.map((c) => `<button type="button" role="menuitem" data-canal="${c.id}" ${c.ativo ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">${c.icone}</svg><span>${esc(c.nome)}</span>${c.ativo ? '' : `<small>${esc(t('contact_soon'))}</small>`}</button>`).join('');
        document.body.appendChild(menu);
        const r = botao.getBoundingClientRect();
        menu.style.top = `${r.bottom + 6}px`;
        menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;

        menu.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-canal]');
            if (!b || b.disabled) return;
            fecharMenu();
            const abrir = { email: abrirEmail, linkedin: abrirLinkedin, instagram: abrirInstagram, whatsapp: abrirWhatsapp }[b.dataset.canal];
            if (abrir) escolherFoco(empresa, (foco) => abrir({ ...empresa, foco }, aoRegistar));
        });
        setTimeout(() => { document.addEventListener('click', foraDoMenu, true); document.addEventListener('keydown', teclaMenu); }, 0);
        menu.querySelector('button:not([disabled])')?.focus();
    }

    // ---------- antes de escrever: o que propor primeiro e por onde começar ----------
    // Se as opções não puderem ser lidas, o canal abre como antes (a IA decide).
    async function escolherFoco(empresa, continuar) {
        const fundo = document.createElement('div');
        fundo.className = 'contact-fundo';
        const titulo = esc(t('focus_title').replace('{empresa}', empresa.nome));
        fundo.innerHTML = `<div class="contact-modal" role="dialog" aria-modal="true" aria-label="${titulo}" tabindex="-1">
            <div class="contact-cab"><h3>${titulo}</h3>
                <button type="button" class="contact-x" data-fechar aria-label="${esc(t('contact_close'))}">×</button></div>
            <div class="contact-corpo"><p class="nota">${esc(t('contact_loading'))}</p></div></div>`;
        document.body.appendChild(fundo);
        document.body.classList.add('modal-aberto');
        const corpo = fundo.querySelector('.contact-corpo');
        fundo.querySelector('.contact-modal').focus();

        let aberto = true;
        const fechar = () => { aberto = false; fundo.remove(); document.body.classList.remove('modal-aberto'); document.removeEventListener('keydown', tecla); };
        const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });   // clicar fora não fecha: perdia-se a mensagem em edição

        let r;
        try { r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/foco`); }
        catch { if (aberto) { fechar(); continuar(null); } return; }
        if (!aberto) return;

        const traduzido = (prefixo, valor) => { const s = t(prefixo + valor); return s === prefixo + valor ? valor : s; };
        const opcao = (nome, valor, marcada, conteudo) =>
            `<label class="foco-opcao"><input type="radio" name="${nome}" value="${esc(valor)}" ${marcada ? 'checked' : ''}><span>${conteudo}</span></label>`;
        const servicos = r.opcoes.map((o, i) => opcao('servico', o.servico, i === 0,
            `<b>${esc(NS.servico(o.servico))}</b> <span class="badge ${i === 0 ? 'quente' : 'morno'}">${esc(t(i === 0 ? 'focus_strongest' : 'focus_alternative'))}</span>`
            + (o.motivo ? `<span class="foco-texto">${esc(o.motivo)}</span>` : '')
            + o.dores.map((d) => `<span class="foco-texto"><em>${esc(t('focus_pain'))}:</em> ${esc(d.necessidade)}${d.evidencia ? ` <span class="nota">(${esc(d.evidencia)})</span>` : ''}</span>`).join('')
        )).join('');
        const outros = r.outros.map((s) => opcao('servico', s, false, `<b>${esc(NS.servico(s))}</b>`)).join('');
        const sinais = r.sinais.map((s) => opcao('sinal', s.indice, false,
            `<b>${esc(traduzido('sinal_', s.tipo))}</b> <span class="badge ${{ alta: 'quente', media: 'morno' }[s.forca] || 'frio'}">${esc(traduzido('forca_', s.forca))}</span>`
            + `<span class="foco-texto">${esc(s.evidencia)}</span>`)).join('');
        const gerais = r.necessidades_gerais.map((n) => `<li>${esc(n)}</li>`).join('');

        corpo.innerHTML = `<form>
            ${r.analisada ? '' : `<p class="nota">${esc(t('focus_no_analysis'))}</p>`}
            ${r.abordagem ? `<p class="nota"><b>${esc(t('focus_angle'))}:</b> ${esc(r.abordagem)}</p>` : ''}
            ${gerais ? `<p class="nota"><b>${esc(t('focus_general'))}:</b></p><ul class="nota foco-gerais">${gerais}</ul>` : ''}
            <fieldset class="foco-grupo"><legend>${esc(t('focus_service'))}</legend>
                ${servicos}
                ${r.opcoes.length ? `<details><summary class="link">${esc(t('focus_others'))}</summary>${outros}</details>` : opcao('servico', '', true, esc(t('focus_auto'))) + outros}
            </fieldset>
            ${sinais ? `<fieldset class="foco-grupo"><legend>${esc(t('focus_opening'))}</legend>${opcao('sinal', '', true, esc(t('focus_auto')))}${sinais}</fieldset>` : ''}
            <div class="contact-acoes"><button type="submit" class="btn btn-primary">${esc(t('focus_generate'))}</button></div>
        </form>`;

        corpo.querySelector('form').addEventListener('submit', (ev) => {
            ev.preventDefault();
            const dados = new FormData(ev.target);
            const servico = dados.get('servico') || null, sinal = dados.get('sinal');
            const foco = { servico, sinal: sinal ? Number(sinal) : null };
            fechar();
            continuar(foco.servico || foco.sinal !== null ? foco : null);
        });
    }

    // ---------- janela do email ----------
    const dataCurta = (iso) => new Date(iso).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' });

    function textoBloqueio(b) {
        const base = t('blk_' + b.codigo);
        return base.replace('{estado}', b.estado ? NS.estado(b.estado) : '').replace('{d}', b.ate ? dataCurta(b.ate) : '')
            .replace('{u}', b.usados ?? '').replace('{l}', b.limite ?? '').replace('{n}', b.enviadas ?? '');
    }

    async function abrirEmail(empresa, aoRegistar) {
        const fundo = document.createElement('div');
        fundo.className = 'contact-fundo';
        fundo.innerHTML = `<div class="contact-modal" role="dialog" aria-modal="true" aria-label="${esc(t('contact_email_title').replace('{empresa}', empresa.nome))}" tabindex="-1">
            <div class="contact-cab"><h3>${esc(t('contact_email_title').replace('{empresa}', empresa.nome))}</h3>
                <button type="button" class="contact-x" data-fechar aria-label="${esc(t('contact_close'))}">×</button></div>
            <div class="contact-corpo" id="contact-corpo"><p class="nota">${esc(t('contact_loading'))}</p></div></div>`;
        document.body.appendChild(fundo);
        document.body.classList.add('modal-aberto');
        const modal = fundo.querySelector('.contact-modal');
        const corpo = fundo.querySelector('#contact-corpo');
        modal.focus();

        const fechar = () => { fundo.remove(); document.body.classList.remove('modal-aberto'); document.removeEventListener('keydown', tecla); };
        const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });   // clicar fora não fecha: perdia-se a mensagem em edição

        const mostrarErro = (e) => { corpo.innerHTML = `<div class="erro-ui">${esc(e.codigo === 'IA' ? t('contact_err_ia') : t('contact_error'))}</div>`; };

        let estado;
        try { estado = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/email`); }
        catch (e) { return mostrarErro(e); }

        const utilizaveis = estado.destinatarios.filter((d) => d.utilizavel);
        const historico = estado.historico.length
            ? `<details class="contact-hist"><summary>${esc(t('contact_history'))} (${estado.historico.length})</summary><ul>${estado.historico.map((h) =>
                `<li><span class="nota">${esc(dataCurta(h.ocorrida_em))} · ${esc(h.destinatario || '')}</span><br>${esc(h.assunto || '')}</li>`).join('')}</ul></details>` : '';
        const bloqueios = estado.bloqueios.map((b) => `<div class="erro-ui">${esc(textoBloqueio(b))}</div>`).join('');

        // sem emails publicados: nunca se adivinham endereços
        if (!utilizaveis.length) {
            corpo.innerHTML = `${bloqueios}<p>${esc(t('contact_none'))}</p>${historico}<div class="contact-acoes"><button type="button" class="btn btn-secundario" data-fechar>${esc(t('contact_close'))}</button></div>`;
            return;
        }
        if (estado.bloqueios.length) {
            corpo.innerHTML = `${bloqueios}${historico}<div class="contact-acoes"><button type="button" class="btn btn-secundario" data-fechar>${esc(t('contact_close'))}</button></div>`;
            return;
        }

        // ----- formulário -----
        const etiquetaDest = (d) => d.tipo === 'geral'
            ? `${d.email} (${t('contact_generic')})`
            : `${d.nome}${d.cargo ? ' · ' + d.cargo : ''} <${d.email}>`;
        const tipoTxt = estado.tipo === 'follow_up' ? t('contact_type_follow').replace('{n}', estado.numero - 1) : t('contact_type_first');
        corpo.innerHTML = `
            <p class="nota contact-tipo">${esc(tipoTxt)} · ${esc(t('contact_quota').replace('{u}', estado.limite_diario.usados).replace('{l}', estado.limite_diario.limite))}</p>
            <label class="campo"><span>${esc(t('contact_to'))}</span><select id="ct-dest">${utilizaveis.map((d) => `<option value="${esc(d.id)}" ${d.id === estado.recomendado ? 'selected' : ''}>${esc(etiquetaDest(d))}</option>`).join('')}</select></label>
            <label class="campo"><span>${esc(t('contact_lang'))}</span><select id="ct-idioma">${IDIOMAS.map(([c, n]) => `<option value="${c}" ${c === estado.empresa.idioma ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="campo"><span>${esc(t('contact_subject'))}</span><input type="text" id="ct-assunto" maxlength="150" autocomplete="off"></label>
            <div class="editor-campo"><span id="ct-lbl-msg" class="editor-rotulo">${esc(t('contact_message'))}</span>
                ${barraHtml()}
                <div class="editor" id="ct-corpo" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="ct-lbl-msg" spellcheck="true"></div></div>
            <p class="nota" id="ct-nota"></p>
            <details class="contact-base" id="ct-base" hidden><summary>${esc(t('base_title'))}</summary><dl id="ct-base-lista"></dl></details>
            <p class="nota">${esc(t('contact_format_note'))}</p>
            <details class="contact-ass" id="ct-ass-det"><summary>${esc(t('sig_title'))}</summary>
                <div class="editor-campo"><span id="ct-lbl-ass" class="editor-rotulo">${esc(t('sig_hint'))}</span>
                    ${barraHtml(true)}
                    <div class="editor editor-ass" id="ct-ass" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="ct-lbl-ass" spellcheck="true"></div></div>
                <div class="img-barra" id="ct-img-barra" hidden>
                    <label>${esc(t('sig_img_size'))} <input type="range" id="ct-img-tam" min="40" max="400" step="5"><output id="ct-img-px"></output></label>
                    <fieldset><legend>${esc(t('sig_layout'))}</legend>
                        <label><input type="radio" name="ct-layout" value="baixo"> ${esc(t('sig_below'))}</label>
                        <label><input type="radio" name="ct-layout" value="lado"> ${esc(t('sig_beside'))}</label></fieldset>
                </div>
                <div class="contact-ass-acoes"><button type="button" class="btn btn-secundario" id="ct-ass-guardar">${esc(t('sig_save'))}</button><span class="nota" id="ct-ass-estado" role="status"></span></div>
            </details>
            <div id="ct-aviso"></div>
            <div class="contact-acoes" id="ct-acoes">
                ${estado.smtp ? `<button type="button" class="btn btn-primary" id="ct-enviar">${esc(t('contact_send'))}</button>` : ''}
                <button type="button" class="btn btn-secundario" id="ct-mailto">${esc(t('contact_mailto'))}</button>
                <button type="button" class="btn btn-secundario" id="ct-gmail">${esc(t('contact_gmail'))}</button>
                <button type="button" class="btn btn-secundario" id="ct-copiar">${esc(t('contact_copy'))}</button>
                <button type="button" class="btn-link" id="ct-reescrever">${esc(t('contact_rewrite'))}</button>
            </div>
            ${estado.smtp ? '' : `<p class="nota">${esc(t('contact_smtp_off'))}</p>`}${historico}`;

        const $ = (id) => corpo.querySelector('#' + id);
        const dest = () => utilizaveis.find((d) => d.id === $('ct-dest').value);
        let ia = { gerado: false, modelo: null };
        let editado = false;
        let ocupado = false;

        const aviso = (html) => { $('ct-aviso').innerHTML = html; };
        const botoes = (desligados) => corpo.querySelectorAll('#ct-acoes button').forEach((b) => { b.disabled = desligados; });

        async function escrever() {
            ocupado = true; botoes(true);
            $('ct-nota').textContent = t('contact_writing');
            aviso('');
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/email/rascunho`,
                    { method: 'POST', body: JSON.stringify({ destinatario: $('ct-dest').value, idioma: $('ct-idioma').value, foco: empresa.foco }) });
                $('ct-assunto').value = r.assunto;
                $('ct-corpo').innerHTML = r.html || textoParaHtml(r.corpo);
                ia = { gerado: true, modelo: r.modelo };
                // o que sustenta o email, para o utilizador conferir antes de enviar
                const b = r.base, linhas = b ? [['base_fact', b.facto], ['base_opp', b.oportunidade], ['base_hyp', b.hipotese]].filter(([, v]) => v) : [];
                $('ct-base').hidden = !linhas.length;
                $('ct-base-lista').innerHTML = linhas.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
                editado = false;
                $('ct-nota').textContent = t('contact_ai_note').replace('{m}', r.modelo.replace('claude-', ''));
            } catch (e) {
                $('ct-nota').textContent = '';
                aviso(`<div class="erro-ui">${esc(e.codigo === 'IA' ? t('contact_err_ia') : e.codigo === 'LIMITE' ? t('contact_err_limit') : t('contact_error'))}</div>`);
            }
            ocupado = false; botoes(false);
        }

        const mudou = () => { editado = true; };
        $('ct-assunto').addEventListener('input', mudou);
        // Ao colar entra só o texto (sem cores nem tipos de letra de outras páginas); a formatação faz-se com a barra
        const [barraMsg, barraAss] = corpo.querySelectorAll('.editor-barra');
        ligarEditor(barraMsg, $('ct-corpo'), mudou);

        // ----- assinatura própria: guarda-se por utilizador e entra em todos os rascunhos -----
        let assinatura = estado.assinatura_html || '';
        const editorAss = $('ct-ass');
        editorAss.innerHTML = assinatura;
        const estadoAss = (txt, erro) => { const e = $('ct-ass-estado'); e.textContent = txt; e.classList.toggle('erro-texto', !!erro); };
        // controlos da imagem: aparecem quando a assinatura tem uma imagem (a imagem escolhida é a última em que se clicou, ou a primeira)
        const barraImg = $('ct-img-barra'), tam = $('ct-img-tam');
        const alvo = () => editorAss.querySelector('img.sel') || editorAss.querySelector('img');
        function atualizarImagem() {
            const img = alvo();
            barraImg.hidden = !img;
            if (!img) return;
            const largura = parseInt(img.getAttribute('width'), 10) || img.naturalWidth || 150;
            tam.value = String(largura); $('ct-img-px').textContent = `${largura} px`;
            corpo.querySelector(`input[name=ct-layout][value=${editorAss.querySelector('table') ? 'lado' : 'baixo'}]`).checked = true;
        }
        const aoMudarAss = () => { estadoAss(''); atualizarImagem(); };
        ligarEditor(barraAss, editorAss, aoMudarAss, { imagens: true, aoErro: (k) => estadoAss(t(k), true) });
        editorAss.addEventListener('click', (ev) => {
            editorAss.querySelectorAll('img.sel').forEach((i) => i.classList.remove('sel'));
            if (ev.target.tagName === 'IMG') ev.target.classList.add('sel');
            atualizarImagem();
        });
        tam.addEventListener('input', () => { const img = alvo(); if (img) { redimensionar(img, +tam.value); $('ct-img-px').textContent = `${tam.value} px`; estadoAss(''); } });
        corpo.querySelectorAll('input[name=ct-layout]').forEach((r) => r.addEventListener('change', () => { aplicarLayout(editorAss, r.value === 'lado'); estadoAss(''); atualizarImagem(); }));
        $('ct-ass-det').addEventListener('toggle', atualizarImagem);
        atualizarImagem();
        $('ct-ass-guardar').addEventListener('click', async () => {
            const b = $('ct-ass-guardar'); b.disabled = true; estadoAss(t('contact_saving'));
            try {
                const r = await api('/api/outreach/assinatura', { method: 'PUT', body: JSON.stringify({ html: editorAss.innerHTML }) });
                assinatura = r.assinatura_html;
                editorAss.innerHTML = assinatura; atualizarImagem();
                // atualiza o bloco da assinatura na mensagem aberta (se o utilizador não o apagou)
                const bloco = $('ct-corpo').querySelector('[data-assinatura]');
                if (bloco && assinatura) { bloco.innerHTML = assinatura; estadoAss(t('sig_saved_applied')); }
                else estadoAss(t(assinatura ? 'sig_saved' : 'sig_reset'));
            } catch (e) { estadoAss(t(e.codigo === 'CONFIG' ? 'sig_err_setup' : 'sig_err'), true); }
            b.disabled = false;
        });
        const aoMudarEscolha = () => { if (!editado || confirm(t('contact_rewrite_confirm'))) escrever(); };
        $('ct-dest').addEventListener('change', aoMudarEscolha);
        $('ct-idioma').addEventListener('change', aoMudarEscolha);
        $('ct-reescrever').addEventListener('click', () => { if (!editado || confirm(t('contact_rewrite_confirm'))) escrever(); });

        const mensagemPronta = () => {
            const assunto = $('ct-assunto').value.trim(), final = htmlFinal($('ct-corpo')), texto = lerTexto(final);
            if (!assunto || !texto) { aviso(`<div class="erro-ui">${esc(t('contact_empty'))}</div>`); return null; }
            return { assunto, texto, html: final.innerHTML, para: dest().email };
        };

        // depois de abrir/copiar fora da plataforma, perguntamos se foi mesmo enviado (só então se regista)
        function perguntarSeEnviou(metodo) {
            aviso(`<div class="contact-confirmar"><b>${esc(t('contact_sent_q'))}</b>
                <button type="button" class="btn btn-primary" id="ct-sim">${esc(t('contact_sent_yes'))}</button>
                <button type="button" class="btn btn-secundario" id="ct-nao">${esc(t('contact_sent_no'))}</button></div>`);
            $('ct-nao').addEventListener('click', () => aviso(''));
            $('ct-sim').addEventListener('click', () => registar(metodo));
        }

        async function registar(metodo, caminho = 'registar') {
            const m = mensagemPronta(); if (!m) return;
            botoes(true); aviso(`<p class="nota">${esc(t('contact_saving'))}</p>`);
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/email/${caminho}`, { method: 'POST',
                    // só o envio direto leva a formatação (HTML); nos outros, o utilizador envia texto simples a partir do seu programa
                    body: JSON.stringify({ destinatario: $('ct-dest').value, assunto: m.assunto, corpo: m.texto, html: caminho === 'enviar' ? m.html : undefined, idioma: $('ct-idioma').value, metodo, ia }) });
                corpo.innerHTML = `<div class="contact-ok"><b>${esc(t('contact_done'))}</b>${r.tarefa ? `<p>${esc(t('contact_followup').replace('{d}', dataCurta(r.tarefa.prazo)))}</p>` : ''}</div>
                    <div class="contact-acoes"><button type="button" class="btn btn-primary" data-fechar>${esc(t('contact_close'))}</button></div>`;
                if (aoRegistar) aoRegistar(empresa.id);
            } catch (e) {
                botoes(false);
                const txt = e.codigo === 'BLOQUEADO' && e.bloqueios?.length ? e.bloqueios.map(textoBloqueio).join(' ') : e.codigo === 'SMTP' ? t('contact_smtp_off') : t('contact_error');
                aviso(`<div class="erro-ui">${esc(txt)}</div>`);
            }
        }

        $('ct-mailto')?.addEventListener('click', () => {
            const m = mensagemPronta(); if (!m) return;
            location.href = `mailto:${encodeURIComponent(m.para)}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.texto)}`;
            perguntarSeEnviou('mailto');
        });
        $('ct-gmail')?.addEventListener('click', () => {
            const m = mensagemPronta(); if (!m) return;
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.para)}&su=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.texto)}`, '_blank', 'noopener');
            perguntarSeEnviou('gmail');
        });
        $('ct-copiar')?.addEventListener('click', async () => {
            const m = mensagemPronta(); if (!m) return;
            try {
                // copia o texto COM formatação (para colar no Gmail ou no Outlook) e também em texto simples
                if (window.ClipboardItem && navigator.clipboard.write) {
                    await navigator.clipboard.write([new ClipboardItem({
                        'text/html': new Blob([m.html], { type: 'text/html' }), 'text/plain': new Blob([`${m.assunto}\n\n${m.texto}`], { type: 'text/plain' }) })]);
                } else { await navigator.clipboard.writeText(`${m.assunto}\n\n${m.texto}`); }
                aviso(`<p class="nota">${esc(t('contact_copied'))}</p>`);
            } catch { /* sem permissão de área de transferência: o utilizador copia à mão */ }
            setTimeout(() => perguntarSeEnviou('copiado'), 600);
        });
        // enviar daqui: pede confirmação, porque uma mensagem enviada não se pode desfazer
        $('ct-enviar')?.addEventListener('click', () => {
            const m = mensagemPronta(); if (!m) return;
            aviso(`<div class="contact-confirmar"><b>${esc(t('contact_send_confirm').replace('{to}', m.para))}</b>
                <button type="button" class="btn btn-primary" id="ct-sim">${esc(t('contact_send_yes'))}</button>
                <button type="button" class="btn btn-secundario" id="ct-nao">${esc(t('contact_cancel'))}</button></div>`);
            $('ct-nao').addEventListener('click', () => aviso(''));
            $('ct-sim').addEventListener('click', () => registar('smtp', 'enviar'));
        });

        escrever();                                                      // o rascunho aparece logo ao abrir
    }


    // ---------- janela do LinkedIn ----------
    // O LinkedIn não tem envio automático (nem se deve fazer): a IA escreve o convite e a mensagem, o utilizador copia,
    // envia a partir do seu LinkedIn e confirma aqui para ficar registado.
    async function abrirLinkedin(empresa, aoRegistar) {
        const titulo = t('li_title').replace('{empresa}', empresa.nome);
        const fundo = document.createElement('div');
        fundo.className = 'contact-fundo';
        fundo.innerHTML = `<div class="contact-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" tabindex="-1">
            <div class="contact-cab"><h3>${esc(titulo)}</h3>
                <button type="button" class="contact-x" data-fechar aria-label="${esc(t('contact_close'))}">×</button></div>
            <div class="contact-corpo" id="contact-corpo"><p class="nota">${esc(t('contact_loading'))}</p></div></div>`;
        document.body.appendChild(fundo);
        document.body.classList.add('modal-aberto');
        const corpo = fundo.querySelector('#contact-corpo');
        fundo.querySelector('.contact-modal').focus();

        const fechar = () => { fundo.remove(); document.body.classList.remove('modal-aberto'); document.removeEventListener('keydown', tecla); };
        const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });   // clicar fora não fecha: perdia-se a mensagem em edição
        const fecharBtn = `<div class="contact-acoes"><button type="button" class="btn btn-secundario" data-fechar>${esc(t('contact_close'))}</button></div>`;

        let estado;
        try { estado = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/linkedin`); }
        catch { corpo.innerHTML = `<div class="erro-ui">${esc(t('contact_error'))}</div>${fecharBtn}`; return; }

        const bloqueios = estado.bloqueios.map((b) => `<div class="erro-ui">${esc(textoBloqueio(b))}</div>`).join('');
        if (!estado.destinatarios.length) { corpo.innerHTML = `<p>${esc(t('li_none'))}</p>${fecharBtn}`; return; }
        if (estado.bloqueios.length) { corpo.innerHTML = `${bloqueios}${fecharBtn}`; return; }
        if (!estado.passos.convite.ok && !estado.passos.mensagem.ok) { corpo.innerHTML = `<div class="erro-ui">${esc(textoBloqueio(estado.passos.mensagem))}</div>${fecharBtn}`; return; }

        const MAX = estado.max_convite, MAX_PREMIUM = 300;
        const etiquetaDest = (d) => d.tipo === 'empresa' ? t('li_company_page') : `${d.nome}${d.cargo ? ' · ' + d.cargo : ''}`;
        const tipoTxt = estado.tipo === 'follow_up' ? t('contact_type_follow').replace('{n}', estado.numero - 1) : t('contact_type_first');
        const passo = (id, titulo1, dica, linhas, max) => {
            const livre = estado.passos[id].ok;
            return `<section class="li-passo" id="li-p-${id}"><h4>${esc(titulo1)}</h4><p class="nota">${esc(dica)}</p>
                ${livre ? `<textarea id="li-${id}" rows="${linhas}" maxlength="${max}" aria-label="${esc(titulo1)}"></textarea>
                <div class="li-linha"><span class="nota" id="li-cont-${id}"></span>
                    <span class="li-botoes"><button type="button" class="btn btn-primary" data-abrir="${id}">${esc(t('li_open_copy'))}</button></span></div>
                <div id="li-aviso-${id}"></div>`
                : `<div class="erro-ui">${esc(textoBloqueio(estado.passos[id]))}</div>`}</section>`;
        };
        corpo.innerHTML = `
            <p class="nota contact-tipo">${esc(tipoTxt)} · ${esc(t('li_quota').replace('{u}', estado.limite_diario.usados).replace('{l}', estado.limite_diario.limite))}</p>
            <label class="campo"><span>${esc(t('contact_to'))}</span><select id="li-dest">${estado.destinatarios.map((d) => `<option value="${esc(d.id)}" ${d.id === estado.recomendado ? 'selected' : ''}>${esc(etiquetaDest(d))}</option>`).join('')}</select></label>
            <label class="campo"><span>${esc(t('contact_lang'))}</span><select id="li-idioma">${IDIOMAS.map(([c, n]) => `<option value="${c}" ${c === estado.empresa.idioma ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <p class="nota" id="li-dica-dest"></p>
            <div class="contact-acoes li-abrir"><a class="btn btn-secundario" id="li-abrir" target="_blank" rel="noopener noreferrer" href="#"></a>
                <button type="button" class="btn-link" id="li-reescrever">${esc(t('contact_rewrite'))}</button></div>
            ${passo('convite', t('li_step1'), t('li_step1_hint'), 3, MAX_PREMIUM)}
            ${passo('mensagem', t('li_step2'), t('li_step2_hint'), 9, 3000)}
            <p class="nota" id="ct-nota"></p>
            <details class="contact-base" id="ct-base" hidden><summary>${esc(t('base_title'))}</summary><dl id="ct-base-lista"></dl></details>
            <div id="ct-aviso"></div>
            <p class="nota li-rodape">${esc(t('li_note'))}</p>`;

        const $ = (id) => corpo.querySelector('#' + id);
        const dest = () => estado.destinatarios.find((d) => d.id === $('li-dest').value);
        let ia = { gerado: false, modelo: null };
        let editado = false, ocupado = false;
        const aviso = (html) => { $('ct-aviso').innerHTML = html; };
        const botoes = (off) => corpo.querySelectorAll('button, textarea, select').forEach((b) => { b.disabled = off; });

        function atualizarDestino() {
            const d = dest();
            const a = $('li-abrir');
            a.href = d.url; a.textContent = t(d.tipo === 'empresa' ? 'li_open_page' : 'li_open');
            $('li-dica-dest').textContent = d.tipo === 'empresa' ? t('li_page_hint') : '';
        }
        function contador() {
            const c = $('li-convite'); if (!c) return;
            const n = c.value.length, el = $('li-cont-convite');
            el.textContent = t('li_chars').replace('{n}', n).replace('{max}', MAX);
            el.classList.toggle('erro-texto', n > MAX);
            $('li-p-convite').querySelectorAll('[data-abrir]').forEach((b) => { b.disabled = n > MAX_PREMIUM; });      // acima de 300 nem o LinkedIn aceita
            $('li-aviso-convite').innerHTML = n > MAX_PREMIUM ? `<p class="nota erro-texto">${esc(t('li_over_max'))}</p>` : n > MAX ? `<p class="nota">${esc(t('li_over'))}</p>` : '';
        }
        $('li-convite')?.addEventListener('input', () => { editado = true; contador(); });
        $('li-mensagem')?.addEventListener('input', () => { editado = true; });
        $('li-dest').addEventListener('change', () => { atualizarDestino(); if (!editado || confirm(t('contact_rewrite_confirm'))) escrever(); });
        $('li-idioma').addEventListener('change', () => { if (!editado || confirm(t('contact_rewrite_confirm'))) escrever(); });
        $('li-reescrever').addEventListener('click', () => { if (!editado || confirm(t('contact_rewrite_confirm'))) escrever(); });

        async function escrever() {
            ocupado = true; botoes(true);
            $('ct-nota').textContent = t('contact_writing'); aviso('');
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/linkedin/rascunho`,
                    { method: 'POST', body: JSON.stringify({ destinatario: $('li-dest').value, idioma: $('li-idioma').value, foco: empresa.foco }) });
                if ($('li-convite')) $('li-convite').value = r.convite || '';
                if ($('li-mensagem')) $('li-mensagem').value = r.mensagem || '';
                ia = { gerado: true, modelo: r.modelo }; editado = false;
                $('ct-nota').textContent = t('contact_ai_note').replace('{m}', r.modelo.replace('claude-', ''));
                const b = r.base, linhas = b ? [['base_fact', b.facto], ['base_opp', b.oportunidade], ['base_hyp', b.hipotese]].filter(([, v]) => v) : [];
                $('ct-base').hidden = !linhas.length;
                $('ct-base-lista').innerHTML = linhas.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
            } catch (e) {
                $('ct-nota').textContent = '';
                aviso(`<div class="erro-ui">${esc(e.codigo === 'IA' ? t('contact_err_ia') : e.codigo === 'LIMITE' ? t('contact_err_limit') : t('contact_error'))}</div>`);
            }
            ocupado = false; botoes(false); contador();
        }

        async function registar(id) {
            const texto = $('li-' + id).value.trim();
            if (!texto) { aviso(`<div class="erro-ui">${esc(t('contact_empty'))}</div>`); return; }
            botoes(true); aviso(`<p class="nota">${esc(t('contact_saving'))}</p>`);
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/linkedin/registar`, { method: 'POST',
                    body: JSON.stringify({ destinatario: $('li-dest').value, passo: id, texto, idioma: $('li-idioma').value, ia }) });
                corpo.innerHTML = `<div class="contact-ok"><b>${esc(t('contact_done'))}</b>${r.tarefa ? `<p>${esc(t('contact_followup').replace('{d}', dataCurta(r.tarefa.prazo)))}</p>` : ''}</div>${fecharBtn}`;
                if (aoRegistar) aoRegistar(empresa.id);
            } catch (e) {
                botoes(false); contador();
                const txt = e.codigo === 'BLOQUEADO' && e.bloqueios?.length ? e.bloqueios.map(textoBloqueio).join(' ') : e.codigo === 'LONGO' ? t('li_over_max') : t('contact_error');
                aviso(`<div class="erro-ui">${esc(txt)}</div>`);
            }
        }

        // pergunta se foi enviado (só então se regista)
        function perguntarSeEnviou(id, destino) {
            destino.insertAdjacentHTML('beforeend', `<div class="contact-confirmar"><b>${esc(t('li_confirm'))}</b>
                <button type="button" class="btn btn-primary" data-li-sim>${esc(t('contact_sent_yes'))}</button>
                <button type="button" class="btn btn-secundario" data-li-nao>${esc(t('contact_sent_no'))}</button></div>`);
            destino.querySelector('[data-li-nao]').addEventListener('click', () => { destino.innerHTML = ''; });
            destino.querySelector('[data-li-sim]').addEventListener('click', () => registar(id));
        }

        // "Copiar e abrir no LinkedIn": abre o perfil e põe o texto na área de transferência. O LinkedIn não deixa pré-preencher
        // a caixa por ligação, por isso resta um Ctrl+V e o clique em enviar (que é sempre do utilizador).
        async function abrirNoLinkedin(id) {
            const campo = $('li-' + id), destino = $('li-aviso-' + id), d = dest();
            if (!campo.value.trim()) { aviso(`<div class="erro-ui">${esc(t('contact_empty'))}</div>`); return; }
            // janela pequena (não um separador novo): se não estiver logado no LinkedIn, o login aparece lá dentro
            window.open(d.url, 'linkedin_ns', 'popup,width=540,height=780,noopener,noreferrer');   // no próprio clique (senão o browser bloqueia)
            let copiou = true;
            try { await navigator.clipboard.writeText(campo.value); } catch { copiou = false; campo.focus(); campo.select(); }
            const passos = t(id === 'convite' ? 'li_after_convite' : 'li_after_mensagem') + (d.tipo === 'empresa' ? ' ' + t('li_after_pagina') : '');
            destino.innerHTML = `<p class="nota li-passos">${esc(copiou ? passos : t('li_copy_fail'))}</p>`;
            perguntarSeEnviou(id, destino);
        }

        corpo.addEventListener('click', (ev) => {
            const a = ev.target.closest('[data-abrir]');
            if (a) abrirNoLinkedin(a.dataset.abrir);
        });

        atualizarDestino();
        escrever();                                                      // o texto aparece logo ao abrir
    }


    // ---------- janela do Instagram (DM) ----------
    // A IA escreve a DM; o botão copia o texto e abre o perfil num popup; o utilizador cola, envia e confirma aqui.
    // Nada é enviado nem escrito por script (automatizar o Instagram viola os termos da rede).
    async function abrirInstagram(empresa, aoRegistar) {
        const titulo = t('ig_title').replace('{empresa}', empresa.nome);
        const fundo = document.createElement('div');
        fundo.className = 'contact-fundo';
        fundo.innerHTML = `<div class="contact-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" tabindex="-1">
            <div class="contact-cab"><h3>${esc(titulo)}</h3>
                <button type="button" class="contact-x" data-fechar aria-label="${esc(t('contact_close'))}">×</button></div>
            <div class="contact-corpo" id="contact-corpo"><p class="nota">${esc(t('contact_loading'))}</p></div></div>`;
        document.body.appendChild(fundo);
        document.body.classList.add('modal-aberto');
        const corpo = fundo.querySelector('#contact-corpo');
        fundo.querySelector('.contact-modal').focus();

        const fechar = () => { fundo.remove(); document.body.classList.remove('modal-aberto'); document.removeEventListener('keydown', tecla); };
        const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });   // clicar fora não fecha: perdia-se a mensagem em edição
        const fecharBtn = `<div class="contact-acoes"><button type="button" class="btn btn-secundario" data-fechar>${esc(t('contact_close'))}</button></div>`;

        let estado;
        try { estado = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/instagram`); }
        catch { corpo.innerHTML = `<div class="erro-ui">${esc(t('contact_error'))}</div>${fecharBtn}`; return; }

        if (!estado.destinatarios.length) { corpo.innerHTML = `<p>${esc(t('ig_none'))}</p>${fecharBtn}`; return; }
        if (estado.bloqueios.length) { corpo.innerHTML = `${estado.bloqueios.map((b) => `<div class="erro-ui">${esc(textoBloqueio(b))}</div>`).join('')}${fecharBtn}`; return; }

        const conta = estado.destinatarios[0];
        const tipoTxt = estado.tipo === 'follow_up' ? t('contact_type_follow').replace('{n}', estado.numero - 1) : t('contact_type_first');
        corpo.innerHTML = `
            <p class="nota contact-tipo">${esc(tipoTxt)} · ${esc(t('ig_quota').replace('{u}', estado.limite_diario.usados).replace('{l}', estado.limite_diario.limite))}</p>
            <p class="ig-conta"><b>${esc(t('ig_account'))}:</b> @${esc(conta.conta)}</p>
            <label class="campo"><span>${esc(t('contact_lang'))}</span><select id="ig-idioma">${IDIOMAS.map(([c, n]) => `<option value="${c}" ${c === estado.empresa.idioma ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <section class="li-passo"><h4>${esc(t('ig_step'))}</h4><p class="nota">${esc(t('ig_step_hint'))}</p>
                <textarea id="ig-mensagem" rows="12" maxlength="1500" aria-label="${esc(t('ig_step'))}"></textarea>
                <div class="li-linha"><button type="button" class="btn-link" id="ig-reescrever">${esc(t('contact_rewrite'))}</button>
                    <span class="li-botoes"><button type="button" class="btn btn-primary" id="ig-abrir">${esc(t('ig_open_copy'))}</button></span></div>
                <div id="ig-aviso-passo"></div></section>
            <p class="nota" id="ct-nota"></p>
            <details class="contact-base" id="ct-base" hidden><summary>${esc(t('base_title'))}</summary><dl id="ct-base-lista"></dl></details>
            <div id="ct-aviso"></div>
            <p class="nota li-rodape">${esc(t('ig_note'))}</p>`;

        const $ = (id) => corpo.querySelector('#' + id);
        let ia = { gerado: false, modelo: null };
        let editado = false;
        const aviso = (html) => { $('ct-aviso').innerHTML = html; };
        const botoes = (off) => corpo.querySelectorAll('button, textarea, select').forEach((b) => { b.disabled = off; });
        $('ig-mensagem').addEventListener('input', () => { editado = true; });
        const confirmarReescrever = () => !editado || confirm(t('contact_rewrite_confirm'));
        $('ig-idioma').addEventListener('change', () => { if (confirmarReescrever()) escrever(); });
        $('ig-reescrever').addEventListener('click', () => { if (confirmarReescrever()) escrever(); });

        async function escrever() {
            botoes(true);
            $('ct-nota').textContent = t('contact_writing'); aviso(''); $('ig-aviso-passo').innerHTML = '';
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/instagram/rascunho`,
                    { method: 'POST', body: JSON.stringify({ destinatario: conta.id, idioma: $('ig-idioma').value, foco: empresa.foco }) });
                $('ig-mensagem').value = r.mensagem;
                ia = { gerado: true, modelo: r.modelo }; editado = false;
                $('ct-nota').textContent = t('contact_ai_note').replace('{m}', r.modelo.replace('claude-', ''));
                const b = r.base, linhas = b ? [['base_fact', b.facto], ['base_opp', b.oportunidade], ['base_hyp', b.hipotese]].filter(([, v]) => v) : [];
                $('ct-base').hidden = !linhas.length;
                $('ct-base-lista').innerHTML = linhas.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
            } catch (e) {
                $('ct-nota').textContent = '';
                aviso(`<div class="erro-ui">${esc(e.codigo === 'IA' ? t('contact_err_ia') : e.codigo === 'LIMITE' ? t('contact_err_limit') : t('contact_error'))}</div>`);
            }
            botoes(false);
        }

        async function registar() {
            const texto = $('ig-mensagem').value.trim();
            if (!texto) { aviso(`<div class="erro-ui">${esc(t('contact_empty'))}</div>`); return; }
            botoes(true); aviso(`<p class="nota">${esc(t('contact_saving'))}</p>`);
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/instagram/registar`, { method: 'POST',
                    body: JSON.stringify({ destinatario: conta.id, texto, idioma: $('ig-idioma').value, ia }) });
                corpo.innerHTML = `<div class="contact-ok"><b>${esc(t('contact_done'))}</b>${r.tarefa ? `<p>${esc(t('contact_followup').replace('{d}', dataCurta(r.tarefa.prazo)))}</p>` : ''}</div>${fecharBtn}`;
                if (aoRegistar) aoRegistar(empresa.id);
            } catch (e) {
                botoes(false);
                const txt = e.codigo === 'BLOQUEADO' && e.bloqueios?.length ? e.bloqueios.map(textoBloqueio).join(' ') : t('contact_error');
                aviso(`<div class="erro-ui">${esc(txt)}</div>`);
            }
        }

        // Copiar e abrir: o popup abre no próprio clique (senão o browser bloqueia); o texto vai para a área de transferência
        $('ig-abrir').addEventListener('click', async () => {
            const campo = $('ig-mensagem'), destino = $('ig-aviso-passo');
            if (!campo.value.trim()) { aviso(`<div class="erro-ui">${esc(t('contact_empty'))}</div>`); return; }
            window.open(conta.url, 'instagram_ns', 'popup,width=540,height=780,noopener,noreferrer');
            let copiou = true;
            try { await navigator.clipboard.writeText(campo.value); } catch { copiou = false; campo.focus(); campo.select(); }
            destino.innerHTML = `<p class="nota li-passos">${esc(t(copiou ? 'ig_after' : 'ig_copy_fail'))}</p>
                <div class="contact-confirmar"><b>${esc(t('li_confirm'))}</b>
                    <button type="button" class="btn btn-primary" data-ig-sim>${esc(t('contact_sent_yes'))}</button>
                    <button type="button" class="btn btn-secundario" data-ig-nao>${esc(t('contact_sent_no'))}</button></div>`;
            destino.querySelector('[data-ig-nao]').addEventListener('click', () => { destino.innerHTML = ''; });
            destino.querySelector('[data-ig-sim]').addEventListener('click', registar);
        });

        escrever();                                                      // o texto aparece logo ao abrir
    }


    // ---------- janela do WhatsApp (API oficial da Meta) ----------
    // A primeira mensagem é um MODELO aprovado pela Meta, de texto fixo. O modelo é o do serviço que a análise recomenda para a
    // empresa (ou o genérico); a IA propõe as variáveis, o utilizador revê a pré-visualização e confirma o envio.
    // O servidor repete todas as verificações.
    async function abrirWhatsapp(empresa, aoRegistar) {
        const titulo = t('ws_title').replace('{empresa}', empresa.nome);
        const fundo = document.createElement('div');
        fundo.className = 'contact-fundo';
        fundo.innerHTML = `<div class="contact-modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" tabindex="-1">
            <div class="contact-cab"><h3>${esc(titulo)}</h3>
                <button type="button" class="contact-x" data-fechar aria-label="${esc(t('contact_close'))}">×</button></div>
            <div class="contact-corpo" id="contact-corpo"><p class="nota">${esc(t('contact_loading'))}</p></div></div>`;
        document.body.appendChild(fundo);
        document.body.classList.add('modal-aberto');
        const corpo = fundo.querySelector('#contact-corpo');
        fundo.querySelector('.contact-modal').focus();

        const fechar = () => { fundo.remove(); document.body.classList.remove('modal-aberto'); document.removeEventListener('keydown', tecla); };
        const tecla = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', tecla);
        fundo.addEventListener('click', (ev) => { if (ev.target.closest('[data-fechar]')) fechar(); });   // clicar fora não fecha: perdia-se a mensagem em edição
        const fecharBtn = `<div class="contact-acoes"><button type="button" class="btn btn-secundario" data-fechar>${esc(t('contact_close'))}</button></div>`;

        let estado;
        try { estado = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/whatsapp`); }
        catch { corpo.innerHTML = `<div class="erro-ui">${esc(t('contact_error'))}</div>${fecharBtn}`; return; }

        if (!estado.destinatarios.length) { corpo.innerHTML = `<p>${esc(t('ws_none'))}</p>${fecharBtn}`; return; }
        if (estado.bloqueios.length) { corpo.innerHTML = `${estado.bloqueios.map((b) => `<div class="erro-ui">${esc(textoBloqueio(b))}</div>`).join('')}${fecharBtn}`; return; }
        if (!estado.api.configurado) { corpo.innerHTML = `<div class="erro-ui">${esc(t('ws_off'))}</div>${fecharBtn}`; return; }

        const numero = estado.destinatarios[0];
        const tipoTxt = estado.tipo === 'follow_up' ? t('contact_type_follow').replace('{n}', estado.numero - 1) : t('contact_type_first');
        const CAMPOS = [['1', 'ws_var_1', 60], ['2', 'ws_var_2', 140], ['3', 'ws_var_3', 160]];
        corpo.innerHTML = `
            <p class="nota contact-tipo">${esc(tipoTxt)} · ${esc(t('ws_quota').replace('{u}', estado.limite_diario.usados).replace('{l}', estado.limite_diario.limite))}</p>
            <p class="ig-conta"><b>${esc(t('ws_number'))}:</b> ${esc(numero.formatado)}</p>
            <label class="campo"><span>${esc(t('contact_lang'))}</span><select id="ws-idioma">${IDIOMAS.map(([c, n]) => `<option value="${c}" ${c === estado.empresa.idioma ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="campo"><span>${esc(t('ws_template'))}</span><select id="ws-modelo"></select></label>
            <p class="nota" id="ws-modelo-nota"></p>
            <section class="li-passo"><p class="nota" id="ws-hint">${esc(t('ws_hint'))}</p><p class="nota" id="ws-fixo" hidden>${esc(t('ws_fixed'))}</p>
                ${CAMPOS.map(([n, k, max]) => `<label class="campo ws-campo"><span>${esc(t(k))}</span><input type="text" id="ws-v${n}" maxlength="${max}" autocomplete="off"></label>`).join('')}
                <div class="ws-previa-cab">${esc(t('ws_preview'))}</div>
                <div class="ws-previa" id="ws-previa" aria-live="polite"></div>
                <div class="ws-botoes" id="ws-botoes"></div>
                <div class="li-linha"><button type="button" class="btn-link" id="ws-reescrever">${esc(t('contact_rewrite'))}</button>
                    <span class="li-botoes"><button type="button" class="btn btn-primary" id="ws-enviar">${esc(t('ws_send'))}</button></span></div>
                <div id="ws-aviso-passo"></div></section>
            <p class="nota" id="ct-nota"></p>
            <details class="contact-base" id="ct-base" hidden><summary>${esc(t('base_title'))}</summary><dl id="ct-base-lista"></dl></details>
            <div id="ct-aviso"></div>
            <p class="nota li-rodape">${esc(t('ws_note'))}</p>`;

        const $ = (id) => corpo.querySelector('#' + id);
        let ia = { gerado: false, modelo: null };
        let editado = false;
        const aviso = (html) => { $('ct-aviso').innerHTML = html; };
        const botoes = (off) => corpo.querySelectorAll('button, input, select').forEach((b) => { b.disabled = off; });

        // modelos do idioma escolhido (português do Brasil para empresas do Brasil, como no servidor)
        const chaveIdioma = () => {
            const i = $('ws-idioma').value;
            return i === 'pt' && estado.empresa.pais === 'BR' && estado.modelos.pt_BR ? 'pt_BR' : i;
        };
        const lista = () => estado.modelos[chaveIdioma()] || [];
        const nomeDoModelo = (servico) => (servico === 'generico' ? t('ws_template_generic') : NS.servico(servico));
        // o modelo pré-selecionado: o do serviço recomendado pela análise; senão o genérico; senão o primeiro
        const padrao = () => { const l = lista(); return (l.find((m) => m.servico === empresa.foco?.servico) || l.find((m) => m.servico === estado.servico_recomendado) || l.find((m) => m.servico === 'generico') || l[0] || {}).servico; };
        function preencherModelos(manter) {
            const l = lista(), antes = manter ? $('ws-modelo').value : null;
            $('ws-modelo').innerHTML = l.map((m) => `<option value="${esc(m.servico)}">${esc(nomeDoModelo(m.servico))}${m.servico === estado.servico_recomendado ? ` · ${esc(t('ws_template_rec'))}` : ''}</option>`).join('');
            $('ws-modelo').value = l.some((m) => m.servico === antes) ? antes : (padrao() || '');
            $('ws-modelo-nota').textContent = l.length ? '' : t('ws_err_template');
            $('ws-enviar').disabled = !l.length;
        }
        const modeloAtual = () => lista().find((m) => m.servico === $('ws-modelo').value);
        const valores = () => ({ 1: $('ws-v1').value, 2: $('ws-v2').value, 3: $('ws-v3').value });
        // modelo de texto fixo (sem variáveis): não há campos para preencher nem IA; a janela mostra o texto e os botões de resposta
        const semVariaveis = () => !!modeloAtual()?.sem_variaveis;
        const desenharPrevia = () => {
            const m = modeloAtual(), v = valores(), fixo = semVariaveis();
            corpo.querySelectorAll('.ws-campo, #ws-hint').forEach((e) => { e.hidden = fixo; });
            $('ws-reescrever').hidden = fixo;
            $('ws-fixo').hidden = !fixo;
            $('ws-previa').textContent = m ? m.corpo.replace(/\{\{(\d)\}\}/g, (_, n) => v[n] || `{{${n}}}`) : '';
            $('ws-botoes').innerHTML = m?.botoes?.length ? m.botoes.map((b) => `<span class="chip">${esc(b)}</span>`).join(' ') : '';
        };
        CAMPOS.forEach(([n]) => $('ws-v' + n).addEventListener('input', () => { editado = true; desenharPrevia(); }));
        const confirmarReescrever = () => !editado || confirm(t('contact_rewrite_confirm'));
        $('ws-idioma').addEventListener('change', () => { preencherModelos(false); if (confirmarReescrever()) escrever(); else desenharPrevia(); });
        $('ws-modelo').addEventListener('change', () => { if (confirmarReescrever()) escrever(); else desenharPrevia(); });
        $('ws-reescrever').addEventListener('click', () => { if (confirmarReescrever()) escrever(); });

        async function escrever() {
            if (!modeloAtual() || semVariaveis()) { desenharPrevia(); $('ct-nota').textContent = ''; $('ct-base').hidden = true; return; }
            desenharPrevia();                                                  // os campos (ou o texto fixo) aparecem já, enquanto a IA escreve
            botoes(true);
            $('ct-nota').textContent = t('contact_writing'); aviso(''); $('ws-aviso-passo').innerHTML = '';
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/whatsapp/rascunho`,
                    { method: 'POST', body: JSON.stringify({ destinatario: numero.id, idioma: $('ws-idioma').value, servico: $('ws-modelo').value, foco: empresa.foco }) });
                CAMPOS.forEach(([n]) => { $('ws-v' + n).value = r.variaveis[n] || ''; });
                ia = { gerado: true, modelo: r.modeloIA }; editado = false;
                $('ct-nota').textContent = t('contact_ai_note').replace('{m}', String(r.modeloIA).replace('claude-', ''));
                const b = r.base, linhas = b ? [['base_fact', b.facto], ['base_opp', b.oportunidade], ['base_hyp', b.hipotese]].filter(([, v]) => v) : [];
                $('ct-base').hidden = !linhas.length;
                $('ct-base-lista').innerHTML = linhas.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('');
            } catch (e) {
                $('ct-nota').textContent = '';
                aviso(`<div class="erro-ui">${esc(e.codigo === 'IA' ? t('contact_err_ia') : e.codigo === 'LIMITE' ? t('contact_err_limit') : e.codigo === 'WA_MODELO' ? t('ws_err_template') : t('contact_error'))}</div>`);
            }
            botoes(false); preencherModelos(true); desenharPrevia();
        }

        // mensagem para cada erro que a API da Meta (ou o servidor) pode devolver
        const textoErro = (e) => {
            if (e.codigo === 'BLOQUEADO' && e.bloqueios?.length) return e.bloqueios.map(textoBloqueio).join(' ');
            const mapa = { WA_CONFIG: 'ws_err_config', WA_SEM_WHATSAPP: 'ws_err_nowa', WA_TESTE: 'ws_err_test', WA_MODELO: 'ws_err_template', LIMITE: 'ws_err_limit', VAZIO: 'ws_err_vars', LONGO: 'ws_err_vars', CONFIG: 'ws_err_db' };
            return t(mapa[e.codigo] || 'contact_error');
        };

        async function enviar() {
            botoes(true); aviso(`<p class="nota">${esc(t('ws_sending'))}</p>`);
            try {
                const r = await api(`/api/outreach/empresas/${encodeURIComponent(empresa.id)}/whatsapp/enviar`, { method: 'POST',
                    body: JSON.stringify({ destinatario: numero.id, idioma: $('ws-idioma').value, servico: $('ws-modelo').value, variaveis: valores(), ia }) });
                corpo.innerHTML = `<div class="contact-ok"><b>${esc(t('ws_sent'))}</b><p>${esc(t('contact_done'))}</p>${r.tarefa ? `<p>${esc(t('contact_followup').replace('{d}', dataCurta(r.tarefa.prazo)))}</p>` : ''}</div>${fecharBtn}`;
                if (aoRegistar) aoRegistar(empresa.id);
            } catch (e) { botoes(false); preencherModelos(true); aviso(`<div class="erro-ui">${esc(textoErro(e))}</div>`); }
        }

        // enviar daqui: pede confirmação, porque uma mensagem enviada não se pode desfazer (e tem custo)
        $('ws-enviar').addEventListener('click', () => {
            const v = valores();
            if (!semVariaveis() && (!v[1].trim() || !v[2].trim() || !v[3].trim())) { aviso(`<div class="erro-ui">${esc(t('ws_err_vars'))}</div>`); return; }
            aviso(`<div class="contact-confirmar"><b>${esc(t('ws_confirm').replace('{n}', numero.formatado))}</b>
                <button type="button" class="btn btn-primary" id="ws-sim">${esc(t('contact_send_yes'))}</button>
                <button type="button" class="btn btn-secundario" id="ws-nao">${esc(t('contact_cancel'))}</button></div>`);
            $('ws-nao').addEventListener('click', () => aviso(''));
            $('ws-sim').addEventListener('click', enviar);
        });

        preencherModelos(false);
        desenharPrevia();
        escrever();                                                      // as variáveis aparecem logo ao abrir
    }

    return { menu: abrirMenu, email: abrirEmail, linkedin: abrirLinkedin, instagram: abrirInstagram, whatsapp: abrirWhatsapp };
})();

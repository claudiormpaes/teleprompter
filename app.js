/* Teleprompter - aplicativo estatico, sem dependencias.
   Organizacao: Store (persistencia), Views (navegacao), Library, Editor, Script (texto em
   paragrafos), Prompter (rolagem), Input (pedal, teclado, toque, roda), Pedal (tela do
   pedal e assistente), Settings (folha de ajustes), Voice (comandos de voz). */
(function () {
  'use strict';

  var APP_VERSION = 'v10.1';
  var K_SCRIPTS = 'tp.scripts';
  var K_SETTINGS = 'tp.settings';
  var K_KEYS = 'tp.keys2';          // v6: deslizes passaram a ser medidos com o celular em pe
  var K_PEDAL = 'tp.pedalUsed';     // v9.4: este aparelho tem pedal de verdade (ver hasPedal)

  var $ = function (sel) { return document.querySelector(sel); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var now = function () { return Date.now(); };

  /* ============================ Store ============================ */

  var Store = {
    read: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    write: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    }
  };

  var DEFAULT_SETTINGS = {
    wpm: 130,         // palavras por minuto (a Robertha le entre 109 e 147)
    font: 48,         // px
    line: 140,        // % (1.40)
    margin: 6,        // % de margem lateral
    family: 'hyper',  // hyper | system | serif
    color: '#ffffff',
    countdown: 3,     // 0, 3 ou 5 segundos
    guidePos: 33,     // altura da linha de leitura, % da tela
    guide: true,
    dimRead: true,
    autoPause: false,
    follow: false,    // rolar so enquanto a pessoa fala (microfone, sem internet)
    mirrorH: false,
    mirrorV: false,
    wake: true,
    fullscreen: true,
    haptics: true,
    record: false,      // o proprio app grava com a camera do celular
    camFacing: 'environment',   // environment (traseira, a melhor imagem) | user (frontal, le na tela do proprio celular)
    recQuality: '1080', // 4k | 1080 (o 4K esquenta o celular: so para quem escolher)
    camPreview: true,   // imagem da camera no canto, para enquadrar
    camRotate: 0,       // giro da imagem (graus, horario), no canto e no arquivo: o celular pode estar de cabeca para baixo
    driveUpload: true,  // cada video sobe sozinho para o Google Drive (alem da copia na pasta Download)
    camPos: 'full',     // imagem da camera: full (tela cheia, atras de tudo; v10.0) | top (no alto, centralizada) | line (logo acima da linha de leitura) | corner (canto direito)
    uiAlpha: 55,        // v10.0, tela cheia: opacidade (%) do fundo escuro do roteiro, da barra do topo e do painel (20 a 90)
    fx: null,           // v10.0: filtros de imagem (ver Fx); null = desligado
    textAlign: 'left',  // left | center
    recScreen: 'landscape-primary',  // tela travada enquanto grava: landscape-primary | landscape-secondary | landscape (deitada, o lado em que estiver) | portrait-primary | portrait-secondary | livre
    phone: 'portrait'   // v9.6: na escolha do modo, o celular fica em pe (portrait) ou deitado (landscape, video horizontal)
  };

  /* Cada acao aceita varios comandos: o code (ou key) de uma tecla, ou um gesto.
     Gestos de deslize sao medidos no referencial do celular EM PE: o pedal em modo de toque
     desenha o deslize no referencial fisico da tela, entao girar o aparelho nao troca mais
     os pedais de lugar. */
  var DEFAULT_KEYS = {
    playPause: ['PageDown', 'ArrowDown', 'ArrowRight', 'Space', 'Enter', 'NumpadEnter', 'MediaPlayPause',
      'SwipeRight', 'SwipeDown'],
    back: ['PageUp', 'ArrowUp', 'ArrowLeft', 'MediaTrackPrevious', 'SwipeLeft', 'SwipeUp'],
    forward: ['MediaTrackNext'],
    faster: ['Equal', 'NumpadAdd'],
    slower: ['Minus', 'NumpadSubtract'],
    top: ['Home']
  };

  var ACTIONS = [
    { id: 'playPause', name: 'Iniciar e pausar', pulse: false, gap: 320 },
    { id: 'back', name: 'Parágrafo anterior', pulse: true, gap: 170 },
    { id: 'forward', name: 'Próximo parágrafo', pulse: true, gap: 170 },
    { id: 'faster', name: 'Mais rápido', pulse: true, gap: 60 },
    { id: 'slower', name: 'Mais devagar', pulse: true, gap: 60 },
    { id: 'top', name: 'Voltar ao início', pulse: false, gap: 600 }
  ];
  var ACTION_BY_ID = {};
  ACTIONS.forEach(function (a) { ACTION_BY_ID[a.id] = a; });

  var TOKEN_LABEL = {
    SwipeUp: 'Deslize ↑', SwipeDown: 'Deslize ↓', SwipeLeft: 'Deslize ←', SwipeRight: 'Deslize →',
    WheelUp: 'Roda ↑', WheelDown: 'Roda ↓', WheelLeft: 'Roda ←', WheelRight: 'Roda →',
    Space: 'Espaço', Enter: 'Enter', NumpadEnter: 'Enter (num.)', PageDown: 'Page Down', PageUp: 'Page Up',
    ArrowDown: 'Seta ↓', ArrowUp: 'Seta ↑', ArrowLeft: 'Seta ←', ArrowRight: 'Seta →',
    MediaPlayPause: 'Play/pause (mídia)', MediaTrackNext: 'Próxima (mídia)', MediaTrackPrevious: 'Anterior (mídia)',
    Equal: 'Tecla +', NumpadAdd: '+ (num.)', Minus: 'Tecla −', NumpadSubtract: '− (num.)', Home: 'Home'
  };
  function tokenLabel(t) {
    if (TOKEN_LABEL[t]) return TOKEN_LABEL[t];
    if (/^Key[A-Z]$/.test(t)) return 'Tecla ' + t.slice(3);
    if (/^Digit\d$/.test(t)) return 'Tecla ' + t.slice(5);
    return t;
  }
  function isGesture(t) { return /^(Swipe|Wheel)/.test(t); }

  function defaultKeys() { return JSON.parse(JSON.stringify(DEFAULT_KEYS)); }

  var settings = Object.assign({}, DEFAULT_SETTINGS, Store.read(K_SETTINGS, {}));
  delete settings.speed; delete settings.jump;          // campos da v5 (px/s), sem uso agora
  /* v9.3 (31/10/2026): gravar em 4K esquentava o celular de quem recebeu o app. No app publicado,
     quem nunca tocou na escolha de qualidade passa a gravar em Full HD; quem escolher 4K, fica no 4K. */
  if (!settings.recQualityPicked && settings.recQuality === '4k' && /\.github\.io$/.test(location.hostname)) settings.recQuality = '1080';
  /* v9.5: fora dos aparelhos da Robertha (app servido do PC, localhost), antes da primeira gravacao o app
     pergunta se os videos sobem tambem para o Drive (SaveAsk) e guarda cada video na pasta PROMPTER da
     Galeria (Folder). Instalacao nova comeca sem Drive ate a resposta. Nos da Robertha nada muda. */
  var LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!LOCALHOST && !settings.saveAsked && !('driveUpload' in (Store.read(K_SETTINGS, null) || {}))) settings.driveUpload = false;
  /* v10.0 (11/11/2026, pedido do Claudio: "Vamos deixar o video em tela cheia"): a imagem da camera passa a
     ocupar a tela toda, atras do roteiro e dos controles, nos quatro modos de gravacao. Quem ja tinha
     configuracao salva passa UMA vez para a tela cheia (camPosFullDone), inclusive a memoria de cada modo;
     as posicoes antigas continuam em Ajustes > Onde fica a imagem. */
  if (!settings.camPosFullDone) {
    settings.camPos = 'full';
    if (settings.modes) Object.keys(settings.modes).forEach(function (m) {
      var snap = settings.modes[m];
      if (snap && typeof snap === 'object' && 'camPos' in snap) settings.modes[m] = Object.assign({}, snap, { camPos: 'full' });
    });
    settings.camPosFullDone = true;
    if (Store.read(K_SETTINGS, null)) Store.write(K_SETTINGS, settings);
  }
  settings.uiAlpha = clamp(Math.round(Number(settings.uiAlpha) || 55), 20, 90);
  var keymap = Object.assign(defaultKeys(), Store.read(K_KEYS, {}));
  var scripts = Store.read(K_SCRIPTS, null);

  /* Modos: ao abrir um roteiro a pessoa escolhe como vai gravar. Cada modo lembra os proprios
     ajustes de camera, tela e leitura; o resto (velocidade, fonte, cor) vale para todos. */
  // v10.0: os filtros de imagem (fx) tambem ficam por modo: a frente e a traseira pedem ajustes diferentes
  var MODE_KEYS = ['record', 'camFacing', 'recScreen', 'guidePos', 'camPos', 'textAlign', 'camRotate', 'camPreview', 'mirrorH', 'mirrorV', 'fx'];
  var MODE_PRESETS = {
    // v10.0: nos quatro modos de gravacao a imagem fica em tela cheia (camPos 'full'), atras do texto e dos controles
    // camera da frente: celular de cabeca para baixo, lente embaixo colada no texto, controles no alto
    front: { record: true, camFacing: 'user', recScreen: 'portrait-secondary', guidePos: 75, camPos: 'full', textAlign: 'center', camRotate: 0, camPreview: true, mirrorH: false, mirrorV: false },
    // camera traseira: celular em pe, tela normal, imagem no canto
    rear: { record: true, camFacing: 'environment', recScreen: 'portrait-primary', guidePos: 33, camPos: 'full', textAlign: 'left', camRotate: 0, camPreview: true, mirrorH: false, mirrorV: false },
    // so ler: o teleprompter de sempre
    plain: { record: false, recScreen: 'livre', guidePos: 33, textAlign: 'left' },
    /* v9.6, celular deitado (video horizontal). Memoria separada da versao em pe. A tela trava deitada
       no lado em que o celular estiver ('landscape'); gravando, trava naquele lado (Rec.lockScreen). */
    // camera da frente deitada: texto numa coluna encostada no lado da lente, linha no meio da altura (Lay)
    'front-h': { record: true, camFacing: 'user', recScreen: 'landscape', guidePos: 45, camPos: 'full', textAlign: 'left', camRotate: 0, camPreview: true, mirrorH: false, mirrorV: false },
    // camera traseira deitada: texto na largura toda, imagem no canto, controles embaixo
    'rear-h': { record: true, camFacing: 'environment', recScreen: 'landscape', guidePos: 33, camPos: 'full', textAlign: 'left', camRotate: 0, camPreview: true, mirrorH: false, mirrorV: false }
  };
  function landMode(m) { return /-h$/.test(m === undefined ? settings.mode || '' : m || ''); }

  function saveSettings() {
    if (settings.mode && MODE_PRESETS[settings.mode]) {
      var snap = {};
      MODE_KEYS.forEach(function (k) { snap[k] = settings[k]; });
      settings.modes = Object.assign({}, settings.modes, {});
      settings.modes[settings.mode] = snap;
    }
    Store.write(K_SETTINGS, settings);
  }
  function saveKeys() { Store.write(K_KEYS, keymap); }
  function saveScripts() {
    if (!Store.write(K_SCRIPTS, scripts) && typeof Toast !== 'undefined' && Toast) Toast.show('Não consegui salvar: o armazenamento está cheio.');
  }

  var EXAMPLE = [
    '# Como usar',
    '',
    'Este é um roteiro de exemplo. Pode apagar quando quiser.',
    '',
    'Cada parágrafo é um bloco. Deixe uma linha em branco entre eles. O pedal da esquerda volta para o começo do parágrafo, e pisando de novo vai para o anterior.',
    '',
    'O pedal da direita inicia e pausa. [respire] Na primeira vez, abra a tela do pedal e faça os 2 passos, para o aplicativo aprender o seu pedal.',
    '',
    '# Velocidade',
    '',
    'A velocidade é em **palavras por minuto**. Arraste a régua ou segure o mais e o menos. Se mudar o tamanho da letra, o ritmo de leitura continua o mesmo.',
    '',
    'Boa gravação.'
  ].join('\n');

  if (!Array.isArray(scripts)) {
    scripts = [{ id: 'exemplo', title: 'Como usar o teleprompter', text: EXAMPLE, created: now(), updated: now() }];
    saveScripts();
  }

  function findScript(id) {
    for (var i = 0; i < scripts.length; i++) if (scripts[i].id === id) return scripts[i];
    return null;
  }
  function mostRecentScript() {
    var best = null;
    for (var i = 0; i < scripts.length; i++) if (!best || scripts[i].updated > best.updated) best = scripts[i];
    return best;
  }
  // executa um passo que pode falhar no aparelho sem derrubar o resto do fluxo
  function safe(fn) {
    try {
      var r = fn();
      if (r && typeof r.catch === 'function') r.catch(function () { });
      return r;
    } catch (e) { return null; }
  }
  function newId() { return 'r' + now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(ts) {
    var d = new Date(ts);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtClock(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + pad2(s);
  }
  function haptic(ms) {
    if (!settings.haptics || !navigator.vibrate) return;
    safe(function () { navigator.vibrate(ms || 8); });
  }

  /* Pedal de verdade neste aparelho (v9.4): assistente do pedal concluido, comando escolhido na mao,
     toque do pedal aprendido (modo de deslize) ou tecla do pedal que ja chegou. Sem isso os avisos
     mandam tocar na tela, que funciona sempre (a Consuelo grava sem pedal). "tp.pedalSetupSeen" nao
     serve: so diz que o convite do pedal foi visto. Deslize solto nao conta: dedo rapido parece pedal. */
  var pedalUsed = !!Store.read(K_PEDAL, false);
  function pedalSeen() { if (!pedalUsed) { pedalUsed = true; Store.write(K_PEDAL, true); } }
  function hasPedal() { return pedalUsed || !!(Gestures && Gestures.profile); }
  // texto do aviso: "pise…" com pedal, "toque…" sem
  function cue(withPedal, withTouch) { return hasPedal() ? withPedal : withTouch; }

  /* ============================ Aviso (toast) ============================ */

  var Toast = {
    timer: 0,
    show: function (text, btnText, onBtn, ms) {
      var t = $('#toast'), b = $('#toast-btn');
      $('#toast-text').textContent = text;
      b.hidden = !btnText;
      b.textContent = btnText || '';
      b.onclick = function () { Toast.hide(); if (onBtn) onBtn(); };
      t.hidden = false;
      clearTimeout(Toast.timer);
      Toast.timer = setTimeout(Toast.hide, ms || (btnText ? 7000 : 4000));
    },
    hide: function () { clearTimeout(Toast.timer); $('#toast').hidden = true; }
  };

  /* ============================ Roteiro: texto em blocos ============================ */

  var Script = {
    // "# titulo" vira marcador de bloco; linha em branco separa paragrafos
    parse: function (text) {
      var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      var blocks = [], cur = null;
      var close = function () { if (cur) { blocks.push(cur); cur = null; } };
      lines.forEach(function (line) {
        var m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) { close(); blocks.push({ type: 'mark', text: m[1].replace(/\*\*|__/g, '').trim() }); return; }
        if (!line.trim()) { close(); return; }
        if (!cur) cur = { type: 'para', lines: [] };
        cur.lines.push(line);
      });
      close();
      return blocks;
    },
    // palavras faladas: sem marcadores, sem [indicacoes], sem asteriscos
    countWords: function (text) {
      var n = 0;
      Script.parse(text).forEach(function (b) {
        if (b.type !== 'para') return;
        var spoken = b.lines.join(' ').replace(/\[[^\]\n]*\]/g, ' ').replace(/\*\*/g, '');
        var w = spoken.split(/\s+/);
        for (var i = 0; i < w.length; i++) if (/[0-9A-Za-zÀ-ÿ]/.test(w[i])) n++;
      });
      return n;
    },
    // monta o DOM com textContent: nada do roteiro vira HTML
    renderInline: function (parent, line) {
      var re = /(\[[^\]\n]*\]|\*\*[^*\n]+\*\*)/g, last = 0, m;
      while ((m = re.exec(line))) {
        if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
        var tok = m[0];
        if (tok.charAt(0) === '[') parent.appendChild(el('span', 'cue', tok));
        else parent.appendChild(el('span', 'emph', tok.slice(2, -2)));
        last = m.index + tok.length;
      }
      if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
    },
    render: function (container, text) {
      container.innerHTML = '';
      var blocks = Script.parse(text), paras = [];
      if (!blocks.length) {
        container.appendChild(el('p', 'para empty-script', 'Roteiro vazio. Saia e escreva o texto.'));
        return paras;
      }
      blocks.forEach(function (b) {
        if (b.type === 'mark') { container.appendChild(el('div', 'mark', b.text)); return; }
        var p = el('p', 'para');
        b.lines.forEach(function (line, i) {
          if (i) p.appendChild(document.createTextNode('\n'));
          Script.renderInline(p, line);
        });
        container.appendChild(p);
        paras.push(p);
      });
      return paras;
    },
    // markdown exportado pelo Google Docs -> roteiro: titulos viram "#", negrito vira **, o resto vira texto
    // no Docs cada linha (Enter ou Shift+Enter) e um trecho de leitura: vira um paragrafo do teleprompter
    linesToParas: function (t) {
      return t.replace(/[ \t]+\n/g, '\n').replace(/([^\n])\n(?=[^\n])/g, '$1\n\n').replace(/\n{3,}/g, '\n\n').trim();
    },
    fromDoc: function (raw, isMarkdown) {
      var t = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
      if (!isMarkdown) return Script.linesToParas(t);
      var keep = [];
      // protege os escapes (\# \* \[ ...) antes de mexer em links e italico
      t = t.replace(/\\([\\`*_{}\[\]()#+\-.!>~|<])/g, function (m, c) { keep.push(c); return '\u0000' + (keep.length - 1) + '\u0001'; });
      t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '')                       // imagens
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                        // link: fica o texto
        .replace(/<\/?[a-z][^>]*>/gi, '')                               // html solto
        .replace(/__([^_\n]+)__/g, '**$1**')                            // negrito alternativo
        .replace(/(^|[^*])\*(?=\S)([^*\n]+?)\*(?!\*)/g, '$1$2')         // italico com * sai
        .replace(/(^|[^\w])_(?=\S)([^_\n]+?)_(?=[^\w]|$)/g, '$1$2')     // italico com _ sai
        .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')                          // lista
        .replace(/^[ \t]*>[ \t]?/gm, '')                                // citacao
        .replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')            // linha horizontal
        .replace(/^#{1,6}[ \t]*$/gm, '')                                // titulo vazio
        .replace(/^(#{1,6}[ \t]+)(.*)$/gm, function (m, h, x) { return h + x.replace(/\*\*|__/g, ''); });   // titulo sem negrito
      t = t.replace(/\u0000(\d+)\u0001/g, function (m, i) { return keep[+i]; });
      return Script.linesToParas(t);
    },
    durationLabel: function (words) {
      if (!words) return 'vazio';
      return '~' + fmtDur(words / settings.wpm * 60) + ' a ' + settings.wpm + ' ppm';
    }
  };

  /* ============================ Navegacao ============================ */

  var current = 'library';
  var VIEWS = { library: $('#view-library'), editor: $('#view-editor'), prompter: $('#view-prompter'), pedal: $('#view-pedal'), docs: $('#view-docs') };

  function blurActive() {
    var a = document.activeElement;
    if (a && a !== document.body && a.blur) safe(function () { a.blur(); });
  }

  function show(name) {
    if (current === 'prompter' && name !== 'prompter') Prompter.leave();
    if (current === 'pedal' && name !== 'pedal') Pedal.leave();
    if (current === 'editor' && name !== 'editor') Editor.closeMenu();
    Object.keys(VIEWS).forEach(function (k) { VIEWS[k].classList.toggle('is-active', k === name); });
    current = name;
    if (name === 'library') {
      Library.render();
      Up.paint(true);
      if (Up.pending() && !Up.running) Up.run();     // video esperando login: a rodada termina renovando o login
    }
    if (name === 'pedal') Pedal.enter();
    if (name === 'docs') { Share.paint(); GDocs.enter(); }
    if (Update.pending && name !== 'prompter') Update.offer();
  }

  /* ============================ Biblioteca ============================ */

  var Library = {
    render: function () {
      var list = $('#script-list');
      list.innerHTML = '';
      var ordered = scripts.slice().sort(function (a, b) { return b.updated - a.updated; });
      $('#library-empty').hidden = ordered.length > 0;
      ordered.forEach(function (s) {
        var li = el('li');
        var row = el('div', 'card-row');
        var card = el('button', 'card');
        card.type = 'button';
        card.setAttribute('aria-label', 'Editar ' + (s.title || 'Sem título'));
        card.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-doc"></use></svg>';
        var main = el('div', 'card-main');
        main.appendChild(el('div', 'card-title', s.title || 'Sem título'));
        var words = Script.countWords(s.text);
        var sub = el('div', 'card-sub');
        if (s.source && s.source.type === 'gdoc') sub.appendChild(el('span', 'badge', 'Docs'));
        sub.appendChild(document.createTextNode(Script.durationLabel(words) + ' · ' + words + ' palavras · ' + fmtDate(s.updated)));
        main.appendChild(sub);
        card.appendChild(main);
        card.addEventListener('click', function () { Editor.open(s.id); });

        var go = el('button', 'card-go');
        go.type = 'button';
        go.setAttribute('aria-label', 'Apresentar ' + (s.title || 'roteiro'));
        go.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-play"></use></svg>';
        go.addEventListener('click', function (ev) { ev.stopPropagation(); Modes.pick(s.id); });

        row.appendChild(card);
        row.appendChild(go);
        li.appendChild(row);
        list.appendChild(li);
      });
    }
  };

  /* ============================ Editor ============================ */

  var Editor = {
    id: null,
    timer: 0,
    open: function (id) {
      var s = findScript(id);
      if (!s) return;
      Editor.id = id;
      $('#editor-title').value = s.title || '';
      $('#editor-text').value = s.text || '';
      Editor.setState('Salvo');
      show('editor');
      Editor.paintLink();
    },
    paintLink: function () {
      var s = findScript(Editor.id), linked = !!(s && s.source && s.source.type === 'gdoc');
      $('#editor-link').hidden = !linked;
      $('#btn-gdoc-refresh').hidden = !linked;
      if (linked) $('#editor-link-text').textContent = 'Google Docs · ' + (s.source.name || 'documento') + ' · trazido ' + fmtDate(s.source.syncedAt || s.updated);
    },
    setState: function (state) {
      var words = Script.countWords($('#editor-text').value);
      var box = $('#editor-stats');
      box.innerHTML = '';
      var top = el('div');
      var b = el('b', null, String(words));
      top.appendChild(b);
      top.appendChild(document.createTextNode(' palavras · ' + Script.durationLabel(words)));
      box.appendChild(top);
      box.appendChild(el('div', null, state));
    },
    queueSave: function () {
      Editor.setState('Salvando…');
      clearTimeout(Editor.timer);
      Editor.timer = setTimeout(Editor.saveNow, 400);
    },
    saveNow: function () {
      clearTimeout(Editor.timer);
      Editor.timer = 0;
      var s = findScript(Editor.id);
      if (!s) return;
      var title = $('#editor-title').value.trim() || 'Sem título';
      var text = $('#editor-text').value;
      if (s.title === title && s.text === text) { Editor.setState('Salvo'); return; }
      s.title = title;
      s.text = text;
      s.updated = now();
      saveScripts();
      Editor.setState('Salvo');
    },
    create: function (title, text) {
      var s = { id: newId(), title: title || 'Novo roteiro', text: text || '', created: now(), updated: now() };
      scripts.push(s);
      saveScripts();
      Storage.persist();
      Editor.open(s.id);
      if (!text) setTimeout(function () { $('#editor-title').select(); }, 60);
      return s;
    },
    duplicate: function () {
      Editor.saveNow();
      Editor.closeMenu();
      var s = findScript(Editor.id);
      if (!s) return;
      var copy = { id: newId(), title: s.title + ' (cópia)', text: s.text, created: now(), updated: now() };
      scripts.push(copy);
      saveScripts();
      Editor.open(copy.id);
      Toast.show('Cópia criada.');
    },
    // apagar sem pergunta, com desfazer: menos atrito e nenhum acidente sem volta
    remove: function () {
      Editor.closeMenu();
      var s = findScript(Editor.id);
      if (!s) return;
      var idx = scripts.indexOf(s);
      scripts.splice(idx, 1);
      saveScripts();
      show('library');
      Toast.show('Roteiro “' + s.title + '” apagado.', 'Desfazer', function () {
        scripts.splice(Math.min(idx, scripts.length), 0, s);
        saveScripts();
        Library.render();
      });
    },
    paste: function () {
      var ta = $('#editor-text');
      var fail = function () { Toast.show('Não deu para colar direto. Toque e segure no texto e escolha Colar.'); };
      if (!navigator.clipboard || !navigator.clipboard.readText) { fail(); return; }
      navigator.clipboard.readText().then(function (txt) {
        if (!txt) { Toast.show('A área de transferência está vazia.'); return; }
        var a = ta.selectionStart || 0, b = ta.selectionEnd || 0;
        if (!ta.value) { ta.value = txt; } else { ta.setRangeText(txt, a, b, 'end'); }
        Editor.queueSave();
        Toast.show('Texto colado.');
      }).catch(fail);
    },
    toggleMenu: function () {
      var m = $('#editor-menu'), open = m.hidden;
      m.hidden = !open;
      $('#btn-editor-menu').setAttribute('aria-expanded', String(open));
    },
    closeMenu: function () {
      $('#editor-menu').hidden = true;
      $('#btn-editor-menu').setAttribute('aria-expanded', 'false');
    }
  };

  $('#btn-new').addEventListener('click', function () { Editor.create(); });
  $('#btn-editor-back').addEventListener('click', function () { Editor.saveNow(); show('library'); });
  $('#btn-editor-menu').addEventListener('click', function (ev) { ev.stopPropagation(); Editor.toggleMenu(); });
  document.addEventListener('click', function (ev) {
    if (!$('#editor-menu').hidden && !ev.target.closest('#editor-menu')) Editor.closeMenu();
  });
  $('#btn-duplicate').addEventListener('click', Editor.duplicate);
  $('#btn-delete').addEventListener('click', Editor.remove);
  $('#btn-paste').addEventListener('click', Editor.paste);
  $('#editor-title').addEventListener('input', Editor.queueSave);
  $('#editor-text').addEventListener('input', Editor.queueSave);
  $('#btn-present').addEventListener('click', function () { Editor.saveNow(); Modes.pick(Editor.id); });
  var flushEditor = function () { if (current === 'editor' && Editor.timer) Editor.saveNow(); };
  window.addEventListener('pagehide', flushEditor);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushEditor(); });

  /* ============================ Arquivos: importar e backup ============================ */

  var Files = {
    mode: 'import',
    pick: function (mode) {
      Files.mode = mode;
      var inp = $('#file-import');
      inp.value = '';
      inp.accept = mode === 'restore' ? '.json,application/json' : '.txt,.md,.markdown,.json,text/plain,application/json';
      inp.click();
    },
    onFile: function (file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '');
        if (/\.json$/i.test(file.name) || Files.mode === 'restore') { Files.restore(text); return; }
        var title = file.name.replace(/\.(txt|md|markdown)$/i, '').replace(/[_-]+/g, ' ').trim();
        Editor.create(title || 'Roteiro importado', text);
        Toast.show('Roteiro importado: ' + Script.countWords(text) + ' palavras.');
      };
      reader.onerror = function () { Toast.show('Não consegui ler esse arquivo.'); };
      reader.readAsText(file);
    },
    backup: function () {
      var data = { app: 'teleprompter', format: 2, exported: new Date().toISOString(), scripts: scripts, settings: settings, keys: keymap };
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      var d = new Date();
      var a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'teleprompter-backup-' + d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      Toast.show('Backup salvo em Downloads (' + scripts.length + ' roteiros).');
    },
    restore: function (text) {
      var data;
      try { data = JSON.parse(text); } catch (e) { Toast.show('Esse arquivo não é um backup do teleprompter.'); return; }
      var list = Array.isArray(data) ? data : data && data.scripts;
      if (!Array.isArray(list)) { Toast.show('Esse arquivo não é um backup do teleprompter.'); return; }
      var added = 0, updated = 0;
      list.forEach(function (s) {
        if (!s || typeof s.text !== 'string') return;
        var mine = s.id && findScript(s.id);
        if (!mine) {
          scripts.push({ id: s.id || newId(), title: s.title || 'Sem título', text: s.text, created: s.created || now(), updated: s.updated || now() });
          added++;
        } else if ((s.updated || 0) > (mine.updated || 0)) {
          mine.title = s.title; mine.text = s.text; mine.updated = s.updated; updated++;
        }
      });
      saveScripts();
      Settings.close();
      show('library');
      Toast.show('Backup restaurado: ' + added + ' novos, ' + updated + ' atualizados.');
    }
  };

  $('#btn-import').addEventListener('click', function () { Files.pick('import'); });
  $('#file-import').addEventListener('change', function () { Files.onFile(this.files && this.files[0]); });

  var Storage = {
    asked: false,
    // pede ao navegador para nao apagar os roteiros quando faltar espaco
    persist: function () {
      if (Storage.asked) return;
      Storage.asked = true;
      if (navigator.storage && navigator.storage.persist) safe(function () { return navigator.storage.persist(); });
    }
  };

  /* ============================ Google Docs ============================
     Login direto no Google (OAuth implicito, por redirecionamento: funciona no app instalado).
     v8.9: mais de uma conta. Cada conta entra por um de dois clientes OAuth:
     - "int": cliente "teleprompter-docs" do projeto dashboard-de-mercado. App INTERNO na organizacao
       claudiopaes.com.br: so contas do dominio, sem aviso de app nao verificado e sem prazo.
     - "ext": cliente do projeto teleprompter-contas. App EXTERNO publicado: entra qualquer conta Google.
       v9.1: pede so drive.file (escopo comum, sem verificacao nem auditoria do Google). A pessoa escolhe
       o documento na janela do proprio Google (Picker) e so o escolhido fica liberado para o app; a
       lista mostra os que ja vieram. Login antigo com drive.readonly (modo de teste) segue com a lista.
     A primeira conta conectada e a principal: os videos gravados sobem para o Drive dela. As outras
     so leem documentos. A lista do Docs mostra uma conta por vez (chips no alto).
     Os tokens (1 h) ficam neste aparelho; nada passa por servidor nosso. */

  var GCLIENTS = {
    int: '837450990871-pbi3k1r9fie3torhpimpf9v2n9d0boc6.apps.googleusercontent.com',
    ext: '281907382405-fc49oinpgoltldbomja08i4rn5rdd4hs.apps.googleusercontent.com'
  };
  // Picker do cliente "ext": chave so do Picker, presa aos enderecos do app; o numero do projeto libera
  // para o app o documento escolhido
  var PICKER_KEY = 'AIzaSyBi1BON5MLDRo9hHtp2HKNoLmZ2T9LL1L8';
  var PICKER_APP = '281907382405';
  var GDOCS_READ = 'https://www.googleapis.com/auth/drive.readonly';
  var GDOCS_FILE = 'https://www.googleapis.com/auth/drive.file';
  // conta principal: ler os documentos + criar so os proprios arquivos (os videos sobem para uma pasta do app)
  var GDOCS_SCOPE = GDOCS_READ + ' ' + GDOCS_FILE;
  // cliente interno: so contas deste dominio entram. O Google ja mostra so elas na escolha de conta.
  var GDOCS_DOMAIN = 'claudiopaes.com.br';
  var GDOCS_ACCOUNT = 'claudio@claudiopaes.com.br';
  var K_GTOKEN = 'tp.gtoken';     // token da conta principal
  var K_GEMAIL = 'tp.gemail';     // conta principal
  var K_GOTHER = 'tp.gaccts';     // outras contas: { email: { token, exp, scope, client } }
  var K_GCUR = 'tp.gcur';         // conta mostrada na lista do Docs
  var DOC_MIME = 'application/vnd.google-apps.document';

  function ssRead(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function ssWrite(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem sessao */ } }

  var GDocs = {
    files: [],
    filesOf: '',        // conta dona da lista na tela
    searchTimer: 0,
    loading: false,
    adding: false,      // tela de escolher o tipo de conta aberta por "+ Conta"
    autoTried: {},      // reconexao automatica ja tentada nesta abertura, por conta
    ready: null,        // volta do Google: promessa de "ja sei de quem e o token"

    /* ---- contas ----
       A principal mora nas chaves antigas (tp.gemail, tp.gtoken): o envio ao Drive continua igual.
       Sem conta indicada, token/api/canWrite falam da principal. */
    primary: function () { return Store.read(K_GEMAIL, '') || ''; },
    others: function () { return Store.read(K_GOTHER, {}) || {}; },
    accounts: function () {
      var p = GDocs.primary(), list = p ? [p] : [];
      Object.keys(GDocs.others()).forEach(function (e) { if (e !== p) list.push(e); });
      return list;
    },
    cur: function () {
      var c = Store.read(K_GCUR, ''), list = GDocs.accounts();
      return list.indexOf(c) >= 0 ? c : (list[0] || '');
    },
    rec: function (email) {
      if (!email || email === GDocs.primary()) return Store.read(K_GTOKEN, null);
      return GDocs.others()[email] || null;
    },
    setRec: function (email, rec) {
      var p = GDocs.primary();
      if (!p) { Store.write(K_GEMAIL, email); p = email; }      // a primeira conta vira a principal
      if (email === p) { Store.write(K_GTOKEN, rec); return; }
      var o = GDocs.others();
      o[email] = rec;
      Store.write(K_GOTHER, o);
    },
    // token recusado: a conta continua na lista, so sem token
    drop: function (email) {
      if (!email || email === GDocs.primary()) { Store.write(K_GTOKEN, null); return; }
      var r = GDocs.rec(email);
      if (r) GDocs.setRec(email, Object.assign({}, r, { token: null, exp: 0 }));
    },
    clientFor: function (email) {
      var r = email ? GDocs.rec(email) : null;
      if (r && r.client) return r.client;
      return email && /@claudiopaes\.com\.br$/i.test(email) ? 'int' : 'ext';
    },
    // interno: so a principal pede para criar arquivos (os videos); as outras so leem.
    // externo: so drive.file (o que a pessoa escolher e o que o app criar)
    scopeFor: function (email, client) {
      if ((client || GDocs.clientFor(email)) === 'ext') return GDOCS_FILE;
      var p = GDocs.primary();
      return !p || email === p ? GDOCS_SCOPE : GDOCS_READ;
    },
    // conta que escolhe o documento na janela do Google (sem a leitura do Drive inteiro)
    picks: function (email) {
      return GDocs.clientFor(email) === 'ext' && !/drive\.readonly/.test((GDocs.rec(email) || {}).scope || '');
    },

    token: function (email) {
      var t = GDocs.rec(email);
      return t && t.token && t.exp > now() + 60000 ? t.token : null;
    },
    redirectUri: function () { return location.origin + location.pathname.replace(/index\.html$/, ''); },

    /* vai ao Google e volta; "pending" diz o que fazer na volta. pending.acct: a conta (sem ela, a do
       envio ao Drive para upload/present e a da lista para o resto); pending.add + pending.client:
       conta nova, escolhida na tela do Google. */
    login: function (pending, interactive) {
      if (!navigator.onLine) { Toast.show('Sem internet: o Google Docs precisa de conexão.'); return; }
      pending = Object.assign({ do: 'browse' }, pending || {});
      var email = pending.add ? '' : pending.acct || (/^(upload|present)$/.test(pending.do) ? GDocs.primary() : GDocs.cur());
      var client = pending.client || GDocs.clientFor(email);
      var silent = !interactive && !!email;
      var state = Math.random().toString(36).slice(2) + now().toString(36);
      ssWrite('tp.gstate', state);
      ssWrite('tp.gpending', Object.assign(pending, { acct: email, client: client, silent: silent }));
      if (current === 'editor') Editor.saveNow();
      var q = {
        client_id: GCLIENTS[client], redirect_uri: GDocs.redirectUri(), response_type: 'token',
        scope: GDocs.scopeFor(email, client), include_granted_scopes: 'true', state: state,
        prompt: silent ? 'none' : 'select_account'
      };
      if (client === 'int') { q.hd = GDOCS_DOMAIN; q.login_hint = email || GDOCS_ACCOUNT; }
      else if (email) q.login_hint = email;
      location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(q).toString());
    },
    // tira a conta deste aparelho. Saindo a principal, a proxima vira a principal (e os videos passam a
    // subir para o Drive dela, em pastas novas).
    logout: function (email) {
      email = email || GDocs.cur();
      if (!email) return;
      var t = GDocs.token(email);
      if (t) safe(function () { return fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }); });
      var o = GDocs.others();
      if (email === GDocs.primary()) {
        var next = Object.keys(o)[0] || '';
        Store.write(K_GEMAIL, next);
        Store.write(K_GTOKEN, next ? o[next] : null);
        Store.write(K_UPROOT, null);
        Store.write(K_UPDAYS, {});
        if (next) delete o[next];
      } else delete o[email];
      Store.write(K_GOTHER, o);
      GDocs.files = [];
      GDocs.filesOf = '';
      GDocs.enter();
      Toast.show(email + ' desconectada deste aparelho.');
    },
    pick: function (email) {
      if (email === GDocs.cur() && !GDocs.adding) return;
      Store.write(K_GCUR, email);
      GDocs.adding = false;
      GDocs.files = [];
      GDocs.enter();
    },

    // volta do Google: #access_token=...&expires_in=...&state=...  (ou #error=...)
    handleRedirect: function () {
      var h = location.hash || '';
      if (!/(^|[#&])(access_token|error)=/.test(h)) return null;
      var q = new URLSearchParams(h.replace(/^#/, ''));
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sem historico */ }
      var pending = ssRead('tp.gpending') || { do: 'browse' };
      var state = ssRead('tp.gstate');
      ssWrite('tp.gstate', null);
      ssWrite('tp.gpending', null);
      if (!state || q.get('state') !== state) { Toast.show('O login do Google não foi concluído. Tente de novo.'); return null; }
      if (q.get('error')) {
        // renovacao automatica (envio ao Drive, antes de gravar): sem tela de conta; segue o fluxo
        // e o painel mostra "Entrar"
        if (pending.auto) return pending;
        if (pending.silent) { GDocs.login(pending, true); return 'redirecting'; }  // sessao expirou: pede a conta
        Toast.show(q.get('error') === 'access_denied' ? 'Acesso ao Google Docs não autorizado.' : 'Não deu para entrar no Google (' + q.get('error') + ').');
        return null;
      }
      var rec = { token: q.get('access_token'), exp: now() + (Number(q.get('expires_in')) || 3600) * 1000, scope: q.get('scope') || '', client: pending.client || 'int' };
      GDocs.ready = GDocs.adopt(rec, pending);
      GDocs.ready.then(function () { setTimeout(Up.run, 500); });
      return pending;
    },
    // de quem e o token que chegou? Na escolha de conta a pessoa pode ter pego outra.
    adopt: function (rec, pending) {
      var hint = pending.acct || '';
      return GDocs.whoami(rec.token).then(function (e) { return e || hint; }, function () { return hint; }).then(function (email) {
        if (!email) { Toast.show('Não deu para confirmar a conta do Google. Tente de novo.'); return null; }
        GDocs.setRec(email, rec);
        if (pending.do === 'browse') Store.write(K_GCUR, email);
        return email;
      });
    },
    resume: function (pending) {
      if (!pending || pending === 'redirecting') return;
      var go = function () {
        if (pending.do === 'refresh' && pending.id && findScript(pending.id)) { Editor.open(pending.id); GDocs.refresh(pending.id); return; }
        if (pending.do === 'present' && pending.id && findScript(pending.id)) { Prompter.open(pending.id); return; }
        if (pending.do === 'upload') { show('library'); return; }
        show('docs');
        Share.more(true);                 // v10.1: a volta do Google cai na escolha no Google, aberta
        // conta nova que escolhe pela janela do Google: abre a janela ja na volta (v10.1: no documento do link compartilhado)
        if (pending.fileId) GDocs.choose(GDocs.cur(), pending.fileId);
        else if (pending.do === 'choose' || (pending.add && GDocs.picks(GDocs.cur()))) GDocs.choose(GDocs.cur());
      };
      if (GDocs.ready) GDocs.ready.then(go, go); else go();
    },
    // o login da principal tem o escopo de criar arquivos (login antigo, so leitura, nao tem)
    canWrite: function () {
      var t = Store.read(K_GTOKEN, null);
      return !!(t && t.token && t.exp > now() + 60000 && /drive\.file/.test(t.scope || ''));
    },

    api: function (path, email) {
      var t = GDocs.token(email);
      if (!t) return Promise.reject({ auth: true });
      return fetch('https://www.googleapis.com/drive/v3/' + path, { headers: { Authorization: 'Bearer ' + t } }).then(function (r) {
        if (r.status === 401) { GDocs.drop(email); throw { auth: true }; }
        if (!r.ok) return r.text().then(function (b) { throw { status: r.status, body: b }; });
        return r;
      });
    },
    whoami: function (token) {
      return fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.user && j.user.emailAddress ? String(j.user.emailAddress).toLowerCase() : ''; });
    },

    /* ---- tela ---- */
    enter: function () {
      var list = GDocs.accounts(), acct = GDocs.cur(), connected = !!GDocs.token(acct);
      var adding = GDocs.adding || !list.length;
      // conta ja usada neste aparelho: reconecta sozinho (ida e volta rapida ao Google, sem tela)
      if (!adding && !connected && navigator.onLine && !GDocs.autoTried[acct]) {
        GDocs.autoTried[acct] = true;
        $('#docs-connect').hidden = true;
        $('#docs-main').hidden = false;
        GDocs.paintAccts();
        $('#docs-list').innerHTML = '';
        $('#docs-status').textContent = 'Reconectando ao Google…';
        GDocs.login({ do: 'browse', acct: acct });
        return;
      }
      $('#docs-connect').hidden = !adding;
      $('#btn-docs-cancel').hidden = !list.length;
      // conta da empresa: so aparece em aparelho nosso (app servido do PC ou conta do dominio ja conectada)
      $('#btn-docs-login').hidden = !(/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || list.some(function (e) { return /@claudiopaes\.com\.br$/i.test(e); }));
      $('#docs-main').hidden = adding;
      if (adding) return;
      GDocs.paintAccts();
      $('#docs-who').textContent = acct;
      $('#btn-docs-relogin').hidden = connected;
      var picks = connected && GDocs.picks(acct);
      $('#btn-docs-choose').hidden = !picks;
      $('#docs-pick-hint').hidden = !picks;
      // conta que escolhe pela janela do Google: a busca tambem aceita o link do documento (v9.7)
      $('#docs-q').placeholder = GDocs.picks(acct) ? 'Buscar ou colar o link do documento…' : 'Buscar pelo nome do documento…';
      if (!connected) {
        GDocs.files = [];
        $('#docs-list').innerHTML = '';
        $('#docs-status').textContent = navigator.onLine ? 'O acesso a ' + acct + ' venceu.' : 'Sem internet. Conecte e toque em recarregar.';
        return;
      }
      if (!GDocs.files.length || GDocs.filesOf !== acct) GDocs.load();
      else GDocs.render();
    },
    // uma pilula por conta (a da lista acesa) e "+ Conta"
    paintAccts: function () {
      var box = $('#docs-accts'), cur = GDocs.cur();
      box.innerHTML = '';
      GDocs.accounts().forEach(function (e) {
        var b = el('button', 'chip acct-chip', e.split('@')[0]);
        b.type = 'button';
        b.title = e;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(e === cur));
        b.setAttribute('aria-label', e);
        b.addEventListener('click', function () { GDocs.pick(e); });
        box.appendChild(b);
      });
      var add = el('button', 'chip acct-add', '+ Conta');
      add.type = 'button';
      add.setAttribute('aria-label', 'Conectar outra conta do Google');
      add.addEventListener('click', function () { GDocs.adding = true; GDocs.enter(); });
      box.appendChild(add);
    },
    load: function () {
      var acct = GDocs.cur();
      if (!GDocs.token(acct)) { GDocs.enter(); return; }
      if (!navigator.onLine) { $('#docs-status').textContent = 'Sem internet. Conecte e toque em recarregar.'; return; }
      var term = ($('#docs-q').value || '').trim();
      var q = "mimeType='" + DOC_MIME + "' and trashed=false";
      if (term) q += " and name contains '" + term.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
      var params = new URLSearchParams({
        q: q, orderBy: 'modifiedTime desc', pageSize: '40', spaces: 'drive',
        includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
        fields: 'files(id,name,modifiedTime,owners(displayName),lastModifyingUser(displayName))'
      });
      GDocs.loading = true;
      GDocs.render();
      GDocs.api('files?' + params.toString(), acct).then(function (r) { return r.json(); }).then(function (j) {
        if (acct !== GDocs.cur()) return;                   // trocou de conta no meio
        GDocs.loading = false;
        GDocs.files = GDocs.newestFirst((j && j.files) || []);
        GDocs.filesOf = acct;
        GDocs.render();
      }).catch(function (e) {
        if (acct !== GDocs.cur()) return;
        GDocs.loading = false;
        if (e && e.auth) { GDocs.login({ do: 'browse', acct: acct }); return; }
        GDocs.files = [];
        GDocs.render();
        $('#docs-status').textContent = 'Não deu para listar os documentos. Toque em recarregar.';
      });
    },
    /* do mais recente para o mais antigo, pela data de modificacao do documento (v9.7). O Drive ja manda
       nessa ordem (orderBy modifiedTime desc); aqui a ordem fica garantida em toda lista que o app mostra,
       inclusive a dos ja trazidos das contas que escolhem pela janela do Google. Empate: pelo nome. */
    newestFirst: function (files) {
      var t = function (f) { var v = Date.parse(f && f.modifiedTime); return isNaN(v) ? 0 : v; };
      return files.slice().sort(function (a, b) { return t(b) - t(a) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'); });
    },
    // link de um documento do Google Docs (docs.google.com/document/d/ID/... ou drive.google.com/open?id=ID)
    linkId: function (s) {
      var m = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]{20,})/.exec(s || '') || /drive\.google\.com\/.*[?&]id=([\w-]{20,})/.exec(s || '');
      return m ? m[1] : '';
    },
    // busca da tela do Docs: com link colado, a conta que escolhe pela janela do Google abre a janela ja nele.
    // typed: tecla a tecla (o link digitado so vale no Enter, para nao abrir com o endereco pela metade)
    search: function (now, typed) {
      clearTimeout(GDocs.searchTimer);
      var q = $('#docs-q'), id = GDocs.linkId(q.value), acct = GDocs.cur();
      if (id && !typed && GDocs.picks(acct) && GDocs.token(acct)) {
        // link de arquivo do Word aberto no Google Docs (rtpof=true): a janela so mostra Google Docs
        if (/[?&]rtpof=true/.test(q.value)) { Toast.show('Esse link é de um arquivo do Word (.docx). No Google Docs, salve como Documento Google e cole o link novo.'); return; }
        q.value = '';
        GDocs.choose(acct, id);
        return;
      }
      if (now) GDocs.load(); else GDocs.searchTimer = setTimeout(GDocs.load, 450);
    },
    render: function () {
      var list = $('#docs-list'), st = $('#docs-status');
      list.innerHTML = '';
      if (GDocs.loading) {
        st.textContent = 'Buscando documentos…';
        for (var k = 0; k < 4; k++) { var sk = el('li'); sk.appendChild(el('div', 'skeleton')); list.appendChild(sk); }
        return;
      }
      var term = ($('#docs-q').value || '').trim(), picks = GDocs.picks(GDocs.cur());
      // conta que escolhe pela janela do Google: a lista so tem os documentos que ja vieram para o app
      st.textContent = GDocs.files.length
        ? (term ? GDocs.files.length + ' documento(s) com “' + term + '”.' : picks ? 'Já trazidos para o app, do mais recente para o mais antigo. Para outro, toque em “Escolher no Google Drive”.' : 'Mais recentes primeiro. Toque para trazer.')
        : (term ? (picks ? 'Nenhum dos já trazidos tem “' + term + '” no nome. Toque em “Escolher no Google Drive” para buscar no Drive.' : 'Nenhum documento com “' + term + '” no nome.')
          : picks ? 'Toque em “Escolher no Google Drive” e escolha o roteiro.' : 'Nenhum documento do Google Docs nesta conta.');
      GDocs.files.forEach(function (f) {
        var li = el('li');
        var b = el('button', 'doc-item');
        b.type = 'button';
        b.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-gdoc"></use></svg>';
        var main = el('div', 'card-main');
        main.appendChild(el('div', 'doc-name', f.name));
        var who = (f.lastModifyingUser && f.lastModifyingUser.displayName) || (f.owners && f.owners[0] && f.owners[0].displayName) || '';
        main.appendChild(el('div', 'doc-sub', 'Editado ' + fmtDate(Date.parse(f.modifiedTime)) + (who ? ' · ' + who : '')));
        b.appendChild(main);
        if (GDocs.linked(f.id)) b.appendChild(el('span', 'doc-tag', 'já no app'));
        b.addEventListener('click', function () { GDocs.importDoc(f, b); });
        li.appendChild(b);
        list.appendChild(li);
      });
    },

    /* ---- janela do Google (Picker), para as contas so com drive.file ----
       O documento escolhido fica liberado para o app (e continua liberado: o "Atualizar" le de novo
       sem perguntar). fileId: abre a janela ja nesse documento. done(f): o que fazer com o escolhido
       (sem ele, traz para o app). */
    pickerLib: null,
    loadPicker: function () {
      if (!GDocs.pickerLib) {
        GDocs.pickerLib = new Promise(function (ok, fail) {
          var s = document.createElement('script');
          s.src = 'https://apis.google.com/js/api.js';
          s.onload = function () { window.gapi.load('picker', { callback: ok, onerror: fail, timeout: 20000, ontimeout: fail }); };
          s.onerror = fail;
          document.head.appendChild(s);
        });
        GDocs.pickerLib.catch(function () { GDocs.pickerLib = null; });    // sem rede: tenta de novo na proxima
      }
      return GDocs.pickerLib;
    },
    /* query (v9.7): o que a pessoa escreveu na busca do app; a janela ja abre buscando (View.setQuery).
       A janela do Google nao deixa o app escolher a ordem da lista: a referencia do Picker nao tem
       nenhuma opcao de ordenacao (DocsView, PickerBuilder, Feature). Para o documento certo aparecer
       primeiro, o app oferece a busca pelo nome e o link colado (setFileIds: a janela mostra so ele). */
    choose: function (acct, fileId, done, query) {
      acct = acct || GDocs.cur();
      if (!navigator.onLine) { Toast.show('Sem internet: o Google Drive precisa de conexão.'); return; }
      if (!GDocs.token(acct)) { GDocs.login({ do: 'choose', acct: acct, fileId: fileId || undefined }); return; }
      if (current === 'docs') $('#docs-status').textContent = 'Abrindo o Google Drive…';
      GDocs.loadPicker().then(function () {
        var P = window.google.picker;
        // so documentos do Google Docs: a vista DOCUMENTS tambem mostra .txt, .md e .docx, que o app nao traz
        var view = new P.DocsView(P.ViewId.DOCUMENTS).setMimeTypes(DOC_MIME).setMode(P.DocsViewMode.LIST);
        if (fileId && view.setFileIds) view.setFileIds(fileId);
        else if (query && view.setQuery) view.setQuery(query);
        new P.PickerBuilder()
          .addView(view)
          .enableFeature(P.Feature.NAV_HIDDEN)
          .setOAuthToken(GDocs.token(acct))
          .setDeveloperKey(PICKER_KEY)
          .setAppId(PICKER_APP)
          .setLocale('pt-BR')
          .setTitle('Escolha o roteiro')
          .setCallback(function (d) {
            var a = d[P.Response.ACTION];
            if (a === P.Action.CANCEL && current === 'docs') { GDocs.render(); return; }
            if (a !== P.Action.PICKED) return;
            var doc = (d[P.Response.DOCUMENTS] || [])[0];
            if (!doc) return;
            var f = { id: doc[P.Document.ID], name: doc[P.Document.NAME], modifiedTime: new Date(doc[P.Document.LAST_EDITED_UTC] || now()).toISOString() };
            GDocs.files = [];                                   // a lista passa a ter este tambem
            if (done) done(f); else GDocs.importDoc(f);
          })
          .build()
          .setVisible(true);
      }, function () {
        if (current === 'docs') GDocs.render();
        Toast.show('Não deu para abrir o Google Drive. Confira a internet e tente de novo.');
      });
    },

    // tabId undefined: qualquer roteiro vindo do documento; null: o documento inteiro; '*': todas as guias
    linked: function (docId, tabId) {
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].source;
        if (!src || src.id !== docId) continue;
        if (tabId === undefined || (src.tab ? src.tab.id : null) === tabId) return scripts[i];
      }
      return null;
    },

    /* ---- texto ---- */
    // markdown preserva titulos (# vira marcador) e paragrafos separados por linha em branco
    exportText: function (id, email) {
      return GDocs.api('files/' + id + '/export?mimeType=' + encodeURIComponent('text/markdown'), email)
        .then(function (r) { return r.text(); })
        .then(function (t) { return Script.fromDoc(t, true); })
        .catch(function (e) {
          if (e && e.auth) throw e;
          return GDocs.api('files/' + id + '/export?mimeType=text%2Fplain', email).then(function (r) { return r.text(); })
            .then(function (t) { return Script.fromDoc(t, false); });
        });
    },
    /* ---- guias ----
       A exportacao do Drive junta todas as guias num texto so. A API do Docs traz cada guia
       separada: documento com mais de uma guia pergunta qual trazer (ou todas, uma por bloco). */
    tabs: function (id, email) {
      var t = GDocs.token(email);
      if (!t) return Promise.reject({ auth: true });
      return fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(id) + '?includeTabsContent=true', { headers: { Authorization: 'Bearer ' + t } })
        .then(function (r) {
          if (r.status === 401) { GDocs.drop(email); throw { auth: true }; }
          if (!r.ok) throw { status: r.status };
          return r.json();
        }).then(function (doc) {
          var out = [];
          var walk = function (list, level) {
            (list || []).forEach(function (tb) {
              var p = tb.tabProperties || {}, body = tb.documentTab && tb.documentTab.body;
              out.push({ id: p.tabId, title: p.title || 'Guia ' + (out.length + 1), level: level, text: body ? GDocs.bodyText(body.content) : '' });
              walk(tb.childTabs, level + 1);
            });
          };
          walk(doc.tabs, 0);
          return out;
        });
    },
    // corpo de uma guia (JSON da API do Docs) -> o mesmo markdown da exportacao do Drive -> roteiro
    bodyText: function (content) {
      var lines = [];
      var esc = function (s) { return s.replace(/([\\`*_{}\[\]()#+\-.!>~|<])/g, '\\$1'); };
      var each = function (els) {
        (els || []).forEach(function (se) {
          if (se.table) {
            (se.table.tableRows || []).forEach(function (row) { (row.tableCells || []).forEach(function (c) { each(c.content); }); });
            return;
          }
          if (!se.paragraph) return;
          var p = se.paragraph, style = (p.paragraphStyle && p.paragraphStyle.namedStyleType) || '';
          var heading = /^(TITLE|HEADING_)/.test(style), line = '';
          (p.elements || []).forEach(function (e) {
            var tr = e.textRun;
            if (!tr || !tr.content) return;
            var txt = tr.content.replace(/\n$/, '').replace(/\u000b/g, '\n');   // \u000b = Shift+Enter
            if (!txt) return;
            if (!heading && tr.textStyle && tr.textStyle.bold && txt.trim()) {
              var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(txt);
              line += m[1] + '**' + esc(m[2]) + '**' + m[3];
            } else line += esc(txt);
          });
          if (heading && line.trim()) line = '# ' + line.trim();
          else if (p.bullet) line = '- ' + line;
          lines.push(line);
        });
      };
      each(content);
      return Script.fromDoc(lines.join('\n'), true);
    },
    allTabsText: function (tabs) {
      return tabs.filter(function (t) { return t.text.trim(); })
        .map(function (t) { return '# ' + t.title + '\n\n' + t.text; }).join('\n\n');
    },
    pickTab: function (f, tabs) {
      var box = $('#tab-list');
      box.innerHTML = '';
      $('#tab-hint').textContent = '“' + f.name + '” tem ' + tabs.length + ' guias.';
      var add = function (label, sub, level, fn) {
        var li = el('li'), b = el('button', 'doc-item');
        b.type = 'button';
        if (level) b.style.marginLeft = (level * 18) + 'px';
        var main = el('div', 'card-main');
        main.appendChild(el('div', 'doc-name', label));
        main.appendChild(el('div', 'doc-sub', sub));
        b.appendChild(main);
        b.addEventListener('click', function () { $('#tab-picker').hidden = true; fn(); });
        li.appendChild(b);
        box.appendChild(li);
      };
      tabs.forEach(function (t) {
        add(t.title, Script.countWords(t.text) + ' palavras', t.level, function () { GDocs.save(f, t.text, { id: t.id, title: t.title }); });
      });
      var all = GDocs.allTabsText(tabs);
      add('Todas as guias', Script.countWords(all) + ' palavras · cada guia vira um bloco', 0, function () { GDocs.save(f, all, { id: '*', title: 'Todas as guias' }); });
      $('#tab-picker').hidden = false;
    },
    titleFor: function (name, tab) { return tab && tab.id !== '*' ? name + ' · ' + tab.title : name; },

    importDoc: function (f, btn) {
      var acct = GDocs.cur();
      if (btn) btn.classList.add('busy');
      $('#docs-status').textContent = 'Trazendo “' + f.name + '”…';
      var whole = function () { return GDocs.exportText(f.id, acct).then(function (text) { GDocs.save(f, text, null, acct); }); };
      GDocs.tabs(f.id, acct).then(function (tabs) {
        if (tabs.length <= 1) return whole();                // uma guia so: igual a antes
        if (btn) btn.classList.remove('busy');
        $('#docs-status').textContent = 'Escolha a guia.';
        GDocs.pickTab(f, tabs);
      }, function (e) {
        if (e && e.auth) throw e;
        return whole();                                     // sem a API do Docs: o documento inteiro
      }).catch(function (e) {
        if (btn) btn.classList.remove('busy');
        if (e && e.auth) { GDocs.login({ do: 'browse', acct: acct }); return; }
        $('#docs-status').textContent = 'Não deu para trazer esse documento. Tente de novo.';
      });
    },
    // acct: a conta de onde veio (o "Atualizar" volta a ler por ela)
    save: function (f, text, tab, acct) {
      var src = { type: 'gdoc', id: f.id, name: f.name, modifiedTime: f.modifiedTime, syncedAt: now(), acct: acct || GDocs.cur() };
      if (tab) src.tab = tab;
      var title = GDocs.titleFor(f.name, tab);
      var mine = GDocs.linked(f.id, tab ? tab.id : null);
      if (mine) {
        var before = { text: mine.text, title: mine.title, source: mine.source };
        mine.text = text; mine.title = title; mine.source = src; mine.updated = now();
        saveScripts();
        Editor.open(mine.id);
        Toast.show('Roteiro atualizado com o Google Docs.', 'Desfazer', function () {
          Object.assign(mine, before); saveScripts(); Editor.open(mine.id);
        });
      } else {
        var s = Editor.create(title, text);
        s.source = src;
        saveScripts();
        Editor.paintLink();
        Toast.show('Trazido do Google Docs: ' + Script.countWords(text) + ' palavras.');
      }
    },
    // texto atual do que o roteiro trouxe: o documento inteiro, uma guia ou todas
    sourceText: function (src) {
      var acct = GDocs.srcAcct(src);
      if (!src.tab) return GDocs.exportText(src.id, acct);
      return GDocs.tabs(src.id, acct).then(function (tabs) {
        if (src.tab.id === '*') return GDocs.allTabsText(tabs);
        for (var i = 0; i < tabs.length; i++) if (tabs[i].id === src.tab.id) return tabs[i].text;
        throw { status: 404, tab: true };
      });
    },
    // puxa de novo o documento vinculado
    // roteiro trazido antes da v8.9 (sem a conta anotada): veio da principal, a unica que havia
    srcAcct: function (src) { return (src && src.acct) || GDocs.primary(); },
    refresh: function (scriptId) {
      var s = findScript(scriptId);
      if (!s || !s.source) return;
      var acct = GDocs.srcAcct(s.source);
      if (!GDocs.token(acct)) { GDocs.login({ do: 'refresh', id: scriptId, acct: acct }); return; }
      Toast.show('Atualizando do Google Docs…');
      Promise.all([GDocs.api('files/' + s.source.id + '?fields=id,name,modifiedTime&supportsAllDrives=true', acct).then(function (r) { return r.json(); }), GDocs.sourceText(s.source)])
        .then(function (res) {
          var meta = res[0], text = res[1];
          var before = { text: s.text, title: s.title, source: s.source };
          var same = text === s.text;
          s.text = text; s.title = meta.name ? GDocs.titleFor(meta.name, s.source.tab) : s.title;
          s.source = Object.assign({}, s.source, { name: meta.name, modifiedTime: meta.modifiedTime, syncedAt: now() });
          if (!same) s.updated = now();
          saveScripts();
          if (current === 'editor' && Editor.id === s.id) Editor.open(s.id);
          if (same) Toast.show('Já estava igual ao Google Docs.');
          else Toast.show('Atualizado: ' + Script.countWords(text) + ' palavras.', 'Desfazer', function () {
            Object.assign(s, before); saveScripts(); if (current === 'editor' && Editor.id === s.id) Editor.open(s.id);
          });
        }).catch(function (e) {
          if (e && e.auth) { GDocs.login({ do: 'refresh', id: scriptId, acct: acct }); return; }
          // conta so com drive.file e documento que nao veio pela janela do Google (trazido no tempo
          // do drive.readonly): escolher de novo libera o documento para o app
          if (e && !e.tab && (e.status === 404 || e.status === 403) && GDocs.picks(acct)) {
            Toast.show('Para atualizar, escolha este documento no Google Drive.', 'Escolher', function () {
              GDocs.choose(acct, s.source.id, function () { GDocs.refresh(scriptId); });
            }, 12000);
            return;
          }
          Toast.show(e && e.tab ? 'Essa guia não existe mais no documento.'
            : e && e.status === 404 ? 'O documento não existe mais ou perdeu o acesso.' : 'Não deu para atualizar agora. Confira a internet.');
        });
    },
    // ao abrir para ler: se o documento mudou no Docs, oferece atualizar (sem login, sem travar nada)
    checkForUpdate: function (s) {
      var acct = s && GDocs.srcAcct(s.source);
      if (!s || !s.source || !GDocs.token(acct) || !navigator.onLine) return;
      var id = s.id;
      GDocs.api('files/' + s.source.id + '?fields=modifiedTime&supportsAllDrives=true', acct).then(function (r) { return r.json(); }).then(function (m) {
        var cur = findScript(id);
        if (!cur || !cur.source || !m.modifiedTime) return;
        if (Date.parse(m.modifiedTime) > Date.parse(cur.source.modifiedTime || 0) + 1000) {
          Toast.show('Este roteiro mudou no Google Docs.', 'Atualizar', function () { GDocs.refresh(id); }, 12000);
        }
      }).catch(function () { /* sem rede ou sem acesso: segue com o que tem */ });
    }
  };

  /* ============================ Envio ao Google Drive ============================
     Cada video gravado entra numa fila guardada no aparelho (IndexedDB, em disco) e sobe sozinho
     para o Drive da conta conectada: pasta "Gravações do Prompter" > "Gravação AAAA MM DD".
     Upload retomavel em pedacos de 32 MB, dois videos ao mesmo tempo (cada um na sua sessao, com
     os pedacos em ordem). Escopo drive.file: o app so cria e mexe no que ele mesmo criou.

     v8.8, depois da gravacao de 22/10 (subiram 5 de 12 videos):
     - O login do Google (fluxo implicito) vale 1 hora e nao renova sozinho. Abrir a sessao de
       envio precisa do login; mandar os bytes para uma sessao aberta, nao (o endereco vale cerca
       de uma semana). Por isso, com o login valido, a sessao de TODOS os videos da fila abre na
       hora. Com video esperando login, a tela inicial renova o login sozinha (ida e volta rapida
       ao Google, sem tela de conta). Antes de gravar, renova se faltar menos de 40 minutos.
     - Antes de abrir a sessao, procura no Drive um arquivo com o mesmo nome e tamanho, inclusive
       na lixeira (apagado de proposito conta como enviado). Se achar, tira da fila sem subir.
       Enxerga o que subiu por outro caminho (Drive do computador) quando o login tem drive.readonly;
       conta so com drive.file (v9.1) enxerga so o que o proprio app subiu.
     - Tela acesa (Wake Lock) enquanto envia. Painel com o que falta, progresso, velocidade e
       tempo. Aviso antes de sair do prompter e no "voltar" do Android com envio pendente.
     - A sessao de cada video fica numa tabela a parte ('meta'): regravar o registro do video
       copiaria centenas de MB no disco do celular. */

  var K_UPROOT = 'tp.upRoot', K_UPDAYS = 'tp.upDays', K_UPDONE = 'tp.upDone', K_AUTOLOGIN = 'tp.upAutoLogin';
  var UP_ROOT_NAME = 'Gravações do Prompter';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';

  function fmtBytes(b) {
    b = Math.max(0, b || 0);
    if (b >= 1e9) return (b / 1e9).toFixed(1).replace('.', ',') + ' GB';
    if (b >= 1e6) return Math.round(b / 1e6) + ' MB';
    return Math.max(1, Math.round(b / 1e3)) + ' KB';
  }
  function fmtLeft(sec) {
    if (!(sec > 0) || !isFinite(sec)) return '';
    if (sec < 90) return 'menos de 2 min';
    var m = Math.round(sec / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + pad2(m % 60) + ' min';
  }
  // texto dentro de aspas simples numa busca do Drive
  function driveQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  function today() { var d = new Date(); return d.getFullYear() + ' ' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getDate()); }

  var Up = {
    CHUNK: 32 * 1024 * 1024,   // multiplo de 256 KB, como o Drive exige
    PAR: 2,                    // videos subindo ao mesmo tempo
    STALL: 90000,              // pedaco sem progresso por 90 s (Wi-Fi caiu sem avisar): derruba e tenta de novo
    FINAL_WAIT: 300000,        // depois do ultimo byte o Google leva ~1 min para confirmar
    RETRY: 30000,
    AUTO_GAP: 10 * 60000,      // renovacao automatica do login: no maximo uma a cada 10 min
    dbp: null,
    items: [],                 // a fila sem os videos: painel, aviso de saida, contas
    loaded: false,
    running: false,
    workers: 0,
    preparing: false,
    prepAgain: false,
    busy: {},                  // id -> true (subindo) | 'prep' (conferindo no Drive e abrindo a sessao)
    failed: {},                // id -> deu erro nesta rodada: so tenta de novo na proxima
    errs: [],
    prog: {},                  // id -> bytes ja enviados
    bytes: 0,                  // bytes enviados desde que o app abriu (velocidade)
    samples: [],
    batchDone: 0,              // bytes dos videos que ja sairam da fila nesta leva (barra de progresso)
    adding: 0,                 // videos sendo gravados na fila agora (nao sair da pagina no meio)
    note: '',                  // '' | 'login' | 'erro' | 'offline'
    paintAt: 0,
    retryTimer: 0,
    autoTimer: 0,
    lock: null,

    db: function () {
      if (Up.dbp) return Up.dbp;
      Up.dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('sem IndexedDB')); return; }
        var r = indexedDB.open('tp-envios', 2);
        r.onupgradeneeded = function () {
          var db = r.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
        };
        r.onsuccess = function () {
          var db = r.result;
          db.onversionchange = function () { db.close(); Up.dbp = null; };   // versao nova do app em outra aba
          res(db);
        };
        r.onerror = function () { rej(r.error); };
      });
      Up.dbp.catch(function () { Up.dbp = null; });
      return Up.dbp;
    },
    tx: function (mode, fn) {
      return Up.db().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(['files', 'meta'], mode), box = {};
          fn(t.objectStore('files'), t.objectStore('meta'), box);
          t.oncomplete = function () { res(box); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    },
    // a fila inteira, do mais antigo ao mais novo, com a sessao de envio de cada video
    all: function () {
      return Up.tx('readonly', function (fs, ms, box) {
        fs.getAll().onsuccess = function (e) { box.files = e.target.result || []; };
        ms.getAll().onsuccess = function (e) { box.meta = e.target.result || []; };
      }).then(function (box) {
        var meta = {};
        (box.meta || []).forEach(function (m) { meta[m.id] = m; });
        var l = (box.files || []).map(function (r) {
          var m = meta[r.id];
          if (m) { r.session = m.session || null; r.checked = !!m.checked; }
          return r;
        }).sort(function (a, b) { return a.created - b.created; });
        Up.items = l.map(Up.meta);
        Up.loaded = true;
        return l;
      });
    },
    meta: function (r) { return { id: r.id, name: r.name, size: r.size, day: r.day, created: r.created, session: !!r.session, checked: !!r.checked }; },
    index: function (id) { for (var i = 0; i < Up.items.length; i++) if (Up.items[i].id === id) return i; return -1; },
    remember: function (rec) {
      var m = Up.meta(rec), i = Up.index(rec.id);
      if (i < 0) Up.items.push(m); else Up.items[i] = m;
    },
    put: function (rec) {
      return Up.tx('readwrite', function (fs, ms) {
        fs.put(rec);
        ms.put({ id: rec.id, session: rec.session || null, checked: !!rec.checked });
      }).then(function () { Up.remember(rec); });
    },
    saveMeta: function (rec) {
      return Up.tx('readwrite', function (fs, ms) {
        ms.put({ id: rec.id, session: rec.session || null, checked: !!rec.checked });
      }).then(function () { Up.remember(rec); });
    },
    del: function (id) {
      return Up.tx('readwrite', function (fs, ms) { fs.delete(id); ms.delete(id); }).then(function () {
        var i = Up.index(id);
        if (i >= 0) Up.items.splice(i, 1);
      });
    },

    pending: function () { return settings.driveUpload ? Up.items.length : 0; },
    // bytes que faltam, descontando o que ja subiu dos videos em andamento
    leftBytes: function () {
      var b = 0;
      Up.items.forEach(function (r) { b += Math.max(0, r.size - (Up.prog[r.id] || 0)); });
      return b;
    },
    // sobe agora sem login? (sessao aberta e o video ja conferido no Drive)
    ready: function (r) { return GDocs.canWrite() || (!!r.session && !!r.checked); },
    needsLogin: function () { return Up.pending() > 0 && !GDocs.canWrite() && Up.items.some(function (r) { return !r.session || !r.checked; }); },

    // day: 'AAAA MM DD', o dia da gravacao (vira o nome da pasta)
    add: function (blob, name, day) {
      var rec = { id: newId(), name: name, day: day, size: blob.size, type: blob.type || 'video/mp4', blob: blob, created: now(), session: null, checked: false };
      Up.adding++;
      return Up.put(rec).then(function () {
        Up.adding--;
        Up.paint(true);
        Up.run();
      }, function () {
        Up.adding--;
        Toast.show('Não consegui pôr o vídeo na fila do Drive. Ele ficou salvo no celular.');
      });
    },
    /* "Nao, so no celular" (v9.5): a fila do Drive e copia repetida. Rec.save sempre guarda o video no
       celular (pasta PROMPTER ou Download) antes do Up.add; aqui so se libera o espaco do IndexedDB. */
    clear: function () {
      return Up.tx('readwrite', function (fs, ms) { fs.clear(); ms.clear(); }).then(function () {
        Up.items = [];
        Up.prog = {};
        Up.batchDone = 0;
        Up.paint(true);
      });
    },

    /* ---- rodada de envio: abre as sessoes que faltam e sobe dois videos por vez ---- */
    run: function () {
      clearTimeout(Up.retryTimer);
      Up.retryTimer = 0;
      if (!settings.driveUpload) { Up.paint(true); return; }
      if (!navigator.onLine) { Up.note = 'offline'; Up.paint(true); return; }
      if (!Up.running) { Up.running = true; Up.note = ''; Up.errs = []; Up.failed = {}; }
      Up.wake();
      Up.prepareAll();
      Up.spawn();
      Up.check();
    },
    spawn: function () {
      while (Up.running && Up.workers < Up.PAR) {
        Up.workers++;
        Up.worker().then(Up.workerDone);
      }
    },
    pick: function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (!Up.busy[r.id] && !Up.failed[r.id] && Up.ready(r)) return r;
      }
      return null;
    },
    worker: function () {
      return Up.all().then(function (list) {
        var rec = Up.pick(list);
        return rec ? Up.send(rec).then(Up.worker) : null;
      }).catch(function (e) { Up.errs.push(e || {}); });
    },
    workerDone: function () { Up.workers--; Up.check(); },
    check: function () { if (Up.running && !Up.workers && !Up.preparing) Up.settle(); },
    settle: function () {
      Up.running = false;
      var errs = Up.errs;
      Up.errs = [];
      Up.failed = {};
      Up.samples = [];
      var auth = errs.some(function (e) { return e && e.auth; });
      var net = errs.some(function (e) { return !(e && e.auth); });
      if (net && Up.pending()) Up.retryTimer = setTimeout(Up.run, Up.RETRY);    // rede caiu: tenta de novo sozinho
      Up.note = (auth || Up.needsLogin()) && Up.pending() ? 'login' : net && Up.pending() ? 'erro' : '';
      if (!Up.retryTimer) Up.unwake();
      Up.paint(true);
      if (Up.note === 'login') Up.autoLogin();
    },

    // com o login valido, abre a sessao de envio de todos os videos da fila, sem mandar bytes:
    // o que nao subir dentro da hora do login continua depois sem login
    prepareAll: function () {
      if (Up.preparing) { Up.prepAgain = true; return; }
      if (!GDocs.canWrite()) return;
      Up.preparing = true;
      var step = function () {
        if (!Up.running || !GDocs.canWrite()) return null;
        return Up.all().then(function (list) {
          var rec = null;
          for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if ((!r.session || !r.checked) && !Up.busy[r.id] && !Up.failed[r.id]) { rec = r; break; }
          }
          if (!rec) return null;
          Up.busy[rec.id] = 'prep';
          Up.paint();
          return Up.dedup(rec).then(function (found) {
            if (found) return Up.finish(rec, 'drive');
            if (rec.session) { rec.checked = true; return Up.saveMeta(rec); }   // sessao antiga, agora conferida
            return Up.open(rec);
          }).then(function () {
            delete Up.busy[rec.id];
            Up.paint();
            Up.spawn();
            return step();
          }, function (e) {
            delete Up.busy[rec.id];
            Up.failed[rec.id] = true;
            Up.errs.push(e || {});
          });
        });
      };
      Promise.resolve().then(step).catch(function (e) { Up.errs.push(e || {}); }).then(function () {
        Up.preparing = false;
        if (Up.prepAgain) { Up.prepAgain = false; Up.prepareAll(); }
        Up.check();
      });
    },

    send: function (rec) {
      Up.busy[rec.id] = true;
      Up.prog[rec.id] = Up.prog[rec.id] || 0;
      Up.paint(true);
      return Up.dedup(rec).then(function (found) {
        if (found) return Up.finish(rec, 'drive');
        var start = rec.session
          ? Up.status(rec).then(function (from) { return from < 0 ? Up.open(rec) : from; })
          : Up.open(rec);
        return start.then(function (from) { return Up.chunks(rec, from); })
          .then(function () { return Up.finish(rec, 'app'); });
      }).then(function () {
        delete Up.busy[rec.id];
      }, function (e) {
        delete Up.busy[rec.id];
        Up.failed[rec.id] = true;
        throw e;
      });
    },

    /* Ja existe no Drive um arquivo com o mesmo nome e tamanho? Subiu por outro caminho (Drive do
       computador), ou subiu inteiro e o app fechou antes de tirar da fila. A busca inclui a lixeira:
       apagado de proposito conta como enviado. Sem login, so segue o que ja foi conferido antes. */
    dedup: function (rec) {
      if (!GDocs.token()) return rec.checked ? Promise.resolve(false) : Promise.reject({ auth: true });
      var params = new URLSearchParams({
        q: "name = '" + driveQ(rec.name) + "'", fields: 'files(id,size,trashed)', spaces: 'drive', pageSize: '50',
        includeItemsFromAllDrives: 'true', supportsAllDrives: 'true'
      });
      return GDocs.api('files?' + params.toString()).then(function (r) { return r.json(); }).then(function (j) {
        return (j && j.files || []).some(function (f) { return Number(f.size) === rec.size; });
      });
    },

    // pasta do dia + sessao de envio retomavel (o video acabou de ser conferido no Drive)
    open: function (rec) {
      return Up.folder(rec.day).then(function (parent) { return Up.begin(rec, parent); });
    },
    begin: function (rec, parent) {
      var t = GDocs.canWrite() ? GDocs.token() : null;
      if (!t) return Promise.reject({ auth: true });
      return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': rec.type, 'X-Upload-Content-Length': String(rec.size) },
        body: JSON.stringify({ name: rec.name, parents: [parent], mimeType: rec.type })
      }).then(function (r) {
        if (r.status === 401 || r.status === 403) { if (r.status === 401) Store.write(K_GTOKEN, null); throw { auth: true }; }
        if (r.status === 404) { Store.write(K_UPROOT, null); Store.write(K_UPDAYS, {}); throw { status: 404 }; }   // pasta apagada: recria
        if (!r.ok) throw { status: r.status };
        var loc = r.headers.get('Location');
        if (!loc) throw { status: 'sem endereço de envio' };
        rec.session = loc;
        rec.checked = true;
        return Up.saveMeta(rec).then(function () { return 0; });
      });
    },
    // onde a sessao parou; -1 = sessao vencida (abre outra do zero)
    status: function (rec) {
      return Up.xhr('PUT', rec.session, null, { 'Content-Range': 'bytes */' + rec.size }).then(function (x) {
        if (x.status === 200 || x.status === 201) return rec.size;
        if (x.status === 308) return Up.offset(x, 0);
        if (x.status === 404 || x.status === 410) { rec.session = null; return Up.saveMeta(rec).then(function () { return -1; }); }
        throw { status: x.status };
      });
    },
    offset: function (x, fallback) {
      var m = /bytes=0-(\d+)/.exec(x.getResponseHeader('Range') || '');
      return m ? Number(m[1]) + 1 : fallback;
    },
    chunks: function (rec, from) {
      Up.prog[rec.id] = from;
      if (from >= rec.size) return Promise.resolve();
      var to = Math.min(rec.size, from + Up.CHUNK), last = 0;
      return Up.xhr('PUT', rec.session, rec.blob.slice(from, to), { 'Content-Range': 'bytes ' + from + '-' + (to - 1) + '/' + rec.size },
        function (loaded) {
          Up.bytes += Math.max(0, loaded - last);
          last = loaded;
          Up.prog[rec.id] = Math.max(Up.prog[rec.id] || 0, from + loaded);
          Up.paint();
        }, to - from)
        .then(function (x) {
          if (x.status === 200 || x.status === 201) { Up.prog[rec.id] = rec.size; return null; }
          if (x.status === 308) {
            var next = Up.offset(x, -1);
            // sem "Range" o Google nao guardou nada deste pedaco: pergunta onde a sessao esta
            return next >= 0 ? Up.chunks(rec, next) : Up.status(rec).then(function (f) {
              if (f < 0) throw { status: 'sessão vencida' };
              return Up.chunks(rec, f);
            });
          }
          if (x.status === 404 || x.status === 410) { rec.session = null; return Up.saveMeta(rec).then(function () { throw { status: x.status }; }); }
          throw { status: x.status };
        });
    },
    xhr: function (method, url, body, headers, onProgress, total) {
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest(), seen = now(), sent = 0, timer = 0, done = false;
        var end = function (fn, v) { if (done) return; done = true; clearInterval(timer); fn(v); };
        x.open(method, url);
        Object.keys(headers || {}).forEach(function (k) { x.setRequestHeader(k, headers[k]); });
        if (onProgress && x.upload) x.upload.onprogress = function (e) { seen = now(); sent = e.loaded; onProgress(e.loaded); };
        x.onload = function () { end(res, x); };
        x.onerror = x.ontimeout = x.onabort = function () { end(rej, { status: 0 }); };
        // rede travada sem erro (Wi-Fi trocou, sinal sumiu): sem progresso, derruba e tenta de novo
        timer = setInterval(function () {
          var limit = total && sent >= total ? Up.FINAL_WAIT : Up.STALL;
          if (now() - seen > limit) { safe(function () { x.abort(); }); end(rej, { status: 0, stall: true }); }
        }, 5000);
        x.send(body);
      });
    },
    finish: function (rec, how) {
      return Up.del(rec.id).then(function () {
        delete Up.prog[rec.id];
        Up.batchDone = Up.items.length ? Up.batchDone + rec.size : 0;
        var log = Store.read(K_UPDONE, []) || [];
        log.unshift({ name: rec.name, size: rec.size, day: rec.day, at: now(), how: how });
        Store.write(K_UPDONE, log.slice(0, 40));
        Up.paint(true);
      });
    },

    /* ---- pastas ---- */
    /* Dois videos do mesmo dia abrindo sessao ao mesmo tempo criavam a pasta duas vezes ("Gravação
       2026 10 27" e "(1)", em 27/10): quem chega enquanto a pasta esta sendo criada espera a mesma busca. */
    inflight: {},
    once: function (key, fn) {
      if (Up.inflight[key]) return Up.inflight[key];
      var p = fn();
      var clear = function () { delete Up.inflight[key]; };
      Up.inflight[key] = p;
      p.then(clear, clear);
      return p;
    },
    folder: function (day) {
      var days = Store.read(K_UPDAYS, {}) || {};
      if (days[day]) return Promise.resolve(days[day]);
      return Up.once('day:' + day, function () {
        return Up.root().then(function (root) {
          return Up.findOrCreate('Gravação ' + day, root);
        }).then(function (id) {
          days = Store.read(K_UPDAYS, {}) || {};
          days[day] = id;
          Store.write(K_UPDAYS, days);
          return id;
        });
      });
    },
    root: function () {
      var id = Store.read(K_UPROOT, null);
      if (id) return Promise.resolve(id);
      return Up.once('root', function () {
        return Up.findOrCreate(UP_ROOT_NAME, 'root').then(function (rid) { Store.write(K_UPROOT, rid); return rid; });
      });
    },
    findOrCreate: function (name, parent) {
      var q = "mimeType='" + FOLDER_MIME + "' and trashed=false and name='" + driveQ(name) + "' and '" + parent + "' in parents";
      return GDocs.api('files?' + new URLSearchParams({ q: q, fields: 'files(id)', spaces: 'drive' }).toString())
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.files && j.files.length) return j.files[0].id;
          var t = GDocs.token();
          if (!t) throw { auth: true };
          return fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ name: name, mimeType: FOLDER_MIME, parents: [parent] })
          }).then(function (r) {
            if (r.status === 401 || r.status === 403) throw { auth: true };
            if (!r.ok) throw { status: r.status };
            return r.json();
          }).then(function (f) { return f.id; });
        });
    },

    /* ---- login vencido ----
       Video esperando login: a tela inicial renova sozinha (ida e volta rapida ao Google, sem
       tela de conta), no maximo uma vez a cada 10 minutos. Nunca com gravacao em andamento ou
       video ainda sendo salvo: sair da pagina no meio perderia o arquivo. */
    autoLogin: function () {
      clearTimeout(Up.autoTimer);
      if (current !== 'library' || !navigator.onLine || !Up.needsLogin() || !Store.read(K_GEMAIL, '')) return false;
      if (now() - (Store.read(K_AUTOLOGIN, 0) || 0) < Up.AUTO_GAP) return false;
      var saving = Rec.saving && now() - (Rec.savedAt || 0) < 120000;
      if (Rec.active() || saving || Up.adding || now() - (Rec.savedAt || 0) < 20000) {
        Up.autoTimer = setTimeout(Up.autoLogin, 5000);
        return false;
      }
      Store.write(K_AUTOLOGIN, now());
      Toast.show('Renovando o acesso ao Google para continuar o envio…');
      Up.autoTimer = setTimeout(function () {
        // nesse meio segundo pode ter voltado a subir (app reaberto): sair da pagina cortaria o envio
        if (current === 'library' && !Up.running && Up.needsLogin() && !Rec.active() && !Up.adding) GDocs.login({ do: 'upload', auto: true });
        else Store.write(K_AUTOLOGIN, 0);     // nao renovou: a proxima rodada pode tentar
      }, 900);
      return true;
    },
    // antes de gravar: se o login tiver menos de 40 minutos pela frente, renova agora
    refreshBeforeRecording: function (pending) {
      if (!settings.driveUpload || !navigator.onLine || !Store.read(K_GEMAIL, '')) return false;
      var t = Store.read(K_GTOKEN, null);
      if (t && /drive\.file/.test(t.scope || '') && t.exp - now() > 40 * 60000) return false;
      if (now() - (Store.read(K_AUTOLOGIN, 0) || 0) < Up.AUTO_GAP) return false;
      Store.write(K_AUTOLOGIN, now());
      GDocs.login(Object.assign({}, pending, { auto: true }));
      return true;
    },

    /* ---- tela acesa enquanto envia ---- */
    wake: function () {
      if (Up.lock || !navigator.wakeLock || !navigator.wakeLock.request || document.visibilityState !== 'visible') return;
      var p;
      try { p = navigator.wakeLock.request('screen'); } catch (e) { return; }
      if (!p || !p.then) return;
      Up.lock = 'pedindo';
      p.then(function (l) {
        if (Up.lock !== 'pedindo') { safe(function () { return l.release(); }); return; }   // o envio acabou antes
        Up.lock = l;
        if (l.addEventListener) l.addEventListener('release', function () { if (Up.lock === l) Up.lock = null; });
      }, function () { if (Up.lock === 'pedindo') Up.lock = null; });
    },
    unwake: function () {
      var l = Up.lock;
      Up.lock = null;
      if (l && l !== 'pedindo' && l.release) safe(function () { return l.release(); });
    },

    /* ---- painel na tela inicial e selo no prompter ---- */
    speed: function () {
      var t = now(), s = Up.samples;
      s.push([t, Up.bytes]);
      while (s.length > 2 && t - s[0][0] > 30000) s.shift();
      var dt = (t - s[0][0]) / 1000;
      return dt >= 4 ? (Up.bytes - s[0][1]) / dt : 0;
    },
    state: function (r) {
      if (Up.busy[r.id] === 'prep') return 'conferindo no Drive';
      if (Up.busy[r.id]) return 'enviando ' + Math.floor((Up.prog[r.id] || 0) / Math.max(1, r.size) * 100) + '%';
      if (!Up.ready(r)) return 'esperando o login';
      if (Up.failed[r.id] || Up.note === 'erro') return 'tenta de novo em instantes';
      return 'na fila';
    },
    summary: function () {
      var n = Up.pending(), left = Up.leftBytes();
      var txt = (n === 1 ? '1 vídeo' : n + ' vídeos') + ' para subir ao Google Drive (' + fmtBytes(left) + ')';
      var sending = Up.running && Object.keys(Up.busy).length > 0;
      if (sending) txt += ' · enviando';
      else if (!navigator.onLine) txt += ' · sem internet';
      else if (Up.note === 'login') txt += ' · entre no Google para enviar';
      else if (Up.note === 'erro') txt += ' · tento de novo em 30 s';
      return txt;
    },
    paint: function (force) {
      var t = now();
      if (!force && t - Up.paintAt < 400) return;
      Up.paintAt = t;
      if (!Up.loaded) { Up.all().then(function () { Up.paint(true); }, function () { /* sem IndexedDB */ }); return; }
      var n = Up.pending(), box = $('#up-status');
      var log = (Store.read(K_UPDONE, []) || []).filter(function (d) { return d.at && new Date(d.at).toDateString() === new Date().toDateString(); });
      box.hidden = !settings.driveUpload || (!n && !log.length);
      Up.paintChip(n);
      if (box.hidden) return;
      box.classList.toggle('all-done', !n);
      var sp = Up.running ? Up.speed() : 0, left = Up.leftBytes();
      var total = Up.batchDone, sent = Up.batchDone;
      Up.items.forEach(function (r) { total += r.size; sent += Math.min(r.size, Up.prog[r.id] || 0); });
      if (!n) {
        var bytes = 0;
        log.forEach(function (d) { bytes += d.size || 0; });
        $('#up-text').textContent = 'Tudo no Google Drive';
        $('#up-sub').textContent = 'Hoje: ' + (log.length === 1 ? '1 vídeo' : log.length + ' vídeos') + ', ' + fmtBytes(bytes) + '.';
      } else {
        $('#up-text').textContent = Up.summary();
        var sub = '';
        if (Up.running && sp > 0) sub = (sp / 1e6).toFixed(1).replace('.', ',') + ' MB/s · faltam cerca de ' + fmtLeft(left / sp);
        else if (!navigator.onLine) sub = 'Conecte a internet: o envio continua sozinho.';
        else if (Up.note === 'login') sub = 'O acesso ao Google vence em 1 hora. Toque em Entrar para continuar.';
        else if (Up.running) sub = 'Conferindo no Drive e começando o envio…';
        $('#up-sub').textContent = sub;
      }
      $('#up-sub').hidden = !$('#up-sub').textContent;
      $('#up-bar').style.width = (n && total ? Math.min(100, sent / total * 100) : 100).toFixed(1) + '%';
      $('#up-keep').hidden = !n;
      $('#btn-up-login').hidden = !(n && Up.needsLogin());
      var ul = $('#up-list');
      ul.innerHTML = '';
      Up.items.forEach(function (r) {
        var li = el('li');
        li.appendChild(el('span', 'up-name', r.name));
        li.appendChild(el('span', 'up-st', fmtBytes(r.size) + ' · ' + Up.state(r)));
        var bar = el('i', 'up-mini');
        bar.style.width = Math.min(100, (Up.prog[r.id] || 0) / Math.max(1, r.size) * 100).toFixed(1) + '%';
        li.appendChild(bar);
        ul.appendChild(li);
      });
      var dl = $('#up-done-list');
      dl.innerHTML = '';
      log.forEach(function (d) { dl.appendChild(el('li', null, d.name + (d.how === 'drive' ? ' (já estava no Drive)' : ''))); });
      $('#up-done-sum').textContent = 'Já no Drive hoje: ' + log.length;
      $('#up-done').hidden = !log.length || !n;
    },
    // selo no alto do prompter (some junto com os controles durante a leitura)
    paintChip: function (n) {
      var c = $('#p-up');
      if (!c) return;
      c.hidden = !n;
      if (!n) return;
      var sending = Object.keys(Up.busy).filter(function (k) { return Up.busy[k] === true; });
      var txt = 'Drive: ' + (n === 1 ? '1 vídeo' : n + ' vídeos');
      if (sending.length) {
        var tot = 0, got = 0;
        Up.items.forEach(function (r) { tot += r.size; got += Math.min(r.size, Up.prog[r.id] || 0); });
        txt += ' · ' + Math.floor((Up.batchDone + got) / Math.max(1, Up.batchDone + tot) * 100) + '%';
      } else if (Up.note === 'login' || Up.needsLogin()) txt += ' · entre no Google na tela inicial';
      else if (!navigator.onLine) txt += ' · sem internet';
      c.textContent = txt;
    }
  };

  /* ---- aviso de envio pendente: antes de sair do prompter e no "voltar" do Android ----
     Sair do prompter nao para o envio (a tela inicial continua e mostra o progresso); fechar o app
     para. O "voltar" do Android com o app na tela inicial fecha o app: com envio pendente, uma
     entrada no historico segura o primeiro "voltar" e mostra o aviso; o segundo fecha. */
  var UpLeave = {
    ctx: '',
    isShown: function () { return !$('#up-leave').hidden; },
    show: function (ctx) {
      UpLeave.ctx = ctx;
      var n = Up.pending(), left = Up.leftBytes(), sp = Up.running ? Up.speed() : 0;
      var what = (n === 1 ? 'Falta 1 vídeo' : 'Faltam ' + n + ' vídeos') + ' (' + fmtBytes(left) + (sp > 0 ? ', cerca de ' + fmtLeft(left / sp) : '') + ').';
      var login = Up.needsLogin();
      if (ctx === 'prompter') {
        $('#up-leave-title').textContent = 'Ainda subindo para o Drive';
        $('#up-leave-text').textContent = what + (login
          ? ' Na tela inicial, toque em Entrar para o envio continuar. Não feche o app até terminar.'
          : ' Na tela inicial o envio continua e mostra o progresso. Não feche o app até terminar.');
        $('#btn-up-stay').textContent = 'Voltar ao prompter';
        $('#btn-up-go').hidden = false;
      } else {
        $('#up-leave-title').textContent = 'Não feche o app agora';
        $('#up-leave-text').textContent = what + ' Com o app fechado o envio para e só continua quando ele abrir de novo. Para fechar mesmo assim, use o voltar outra vez.';
        $('#btn-up-stay').textContent = 'Continuar enviando';
        $('#btn-up-go').hidden = true;
      }
      $('#up-leave').hidden = false;
    },
    hide: function () { $('#up-leave').hidden = true; },
    stay: function () {
      UpLeave.hide();
      Guard.arm();
      if (Prompter.isOpen()) Prompter.showUI();
    },
    go: function () {
      UpLeave.hide();
      if (UpLeave.ctx === 'prompter') show('library');
    }
  };
  $('#btn-up-stay').addEventListener('click', function (ev) { ev.stopPropagation(); UpLeave.stay(); });
  $('#btn-up-go').addEventListener('click', function (ev) { ev.stopPropagation(); UpLeave.go(); });

  var Guard = {
    armed: false,
    need: function () { return Up.pending() > 0; },
    // so com gesto do usuario: entrada criada sem gesto o Chrome pula no "voltar"
    arm: function () {
      if (Guard.armed || !Guard.need()) return;
      try { history.pushState({ tpEnvio: 1 }, '', location.href); Guard.armed = true; } catch (e) { /* sem historico */ }
    }
  };
  document.addEventListener('pointerdown', Guard.arm, true);
  document.addEventListener('keydown', Guard.arm, true);
  window.addEventListener('popstate', function () {
    if (!Guard.armed) return;
    Guard.armed = false;
    if (Guard.need() && !UpLeave.isShown()) UpLeave.show('close');
  });

  $('#btn-up-login').addEventListener('click', function () { GDocs.login({ do: 'upload' }); });
  $('#p-up').addEventListener('click', function (ev) { ev.stopPropagation(); Toast.show(Up.summary() + '.'); });
  $('#btn-tab-cancel').addEventListener('click', function () { $('#tab-picker').hidden = true; GDocs.render(); });
  $('#tab-picker').addEventListener('click', function (ev) { if (ev.target === this) { this.hidden = true; GDocs.render(); } });
  window.addEventListener('online', function () { Up.run(); });
  window.addEventListener('offline', function () { Up.paint(true); });

  $('#btn-gdocs').addEventListener('click', function () { show('docs'); });
  $('#btn-docs-back').addEventListener('click', function () { show('library'); });
  // v10.1: link de Docs compartilhado sem conta no aparelho: depois do login a janela abre nele (pendingFile)
  $('#btn-docs-login').addEventListener('click', function () { GDocs.login({ do: 'browse', add: true, client: 'int', fileId: GDocs.pendingFile || undefined }, true); });
  $('#btn-docs-login-ext').addEventListener('click', function () { GDocs.login({ do: 'browse', add: true, client: 'ext', fileId: GDocs.pendingFile || undefined }, true); });
  $('#btn-docs-cancel').addEventListener('click', function () { GDocs.adding = false; GDocs.enter(); });
  $('#btn-docs-relogin').addEventListener('click', function () { GDocs.login({ do: 'browse', acct: GDocs.cur() }, true); });
  $('#btn-docs-choose').addEventListener('click', function () {
    var term = ($('#docs-q').value || '').trim();
    if (GDocs.linkId(term)) { GDocs.search(true); return; }
    GDocs.choose(GDocs.cur(), null, null, term);
  });
  $('#btn-docs-logout').addEventListener('click', function () { GDocs.logout(GDocs.cur()); });
  $('#btn-docs-reload').addEventListener('click', function () {
    if (GDocs.adding || !GDocs.accounts().length) return;
    if (GDocs.token(GDocs.cur())) GDocs.load();
    else { GDocs.autoTried = {}; GDocs.enter(); }
  });
  $('#docs-q').addEventListener('input', function (ev) { GDocs.search(false, ev.inputType === 'insertText'); });
  $('#docs-q').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') GDocs.search(true); });
  $('#btn-gdoc-refresh').addEventListener('click', function () { Editor.closeMenu(); Editor.saveNow(); GDocs.refresh(Editor.id); });
  $('#btn-gdoc-refresh2').addEventListener('click', function () { Editor.saveNow(); GDocs.refresh(Editor.id); });

  /* ============================ Prompter ============================ */

  var Prompter = {
    id: null,
    raf: 0,
    lastT: 0,
    offset: 0,
    cur: 0,            // velocidade instantanea em px/s (com suavizacao)
    playing: false,
    maxOffset: 1,
    lineBox: 60,
    pxPerWord: 12,
    words: 0,
    paras: [],
    tops: [],
    marks: [],         // titulos (# bloco): onde cada bloco comeca
    lastSec: -1,
    ended: false,      // o texto chegou ao fim rolando: o proximo play recomeca do topo
    anim: null,        // salto animado entre paragrafos
    lastPara: -1,
    wakeLock: null,
    pendingPlay: false,
    playAt: 0,
    cdShown: -1,
    hideTimer: 0,
    quiet: false,      // acao do pedal/voz em andamento: nao mostra os controles de toque
    metaAt: 0,
    flashTimer: 0,
    heights: [],
    fullDim: false,    // v10.0, tela cheia: o texto ja lido apaga por paragrafo (paintDone), sem o degrade escuro
    doneN: 0,

    /* Fonte unica de verdade: o prompter esta aberto se a view esta na tela. */
    isOpen: function () { return VIEWS.prompter.classList.contains('is-active'); },
    // folha de Ajustes ou de filtros (v10.0) aberta: o toque na tela nao inicia nada
    sheetOpen: function () { return !$('#panel-settings').hidden || FxSheet.isOpen(); },
    closeSheets: function () { Settings.close(); FxSheet.close(); },

    open: function (id) {
      var s = findScript(id) || mostRecentScript();
      if (!s) { Editor.create(); return; }
      Prompter.id = s.id;
      if (s.wpm) settings.wpm = clamp(s.wpm, 60, 260);   // cada roteiro lembra a propria velocidade
      blurActive();
      Prompter.paras = Script.render($('#content'), s.text);
      Prompter.doneN = 0;
      Prompter.words = Script.countWords(s.text);
      $('#p-title').textContent = s.title || '';
      Prompter.offset = 0;
      Prompter.cur = 0;
      Prompter.anim = null;
      Prompter.lastPara = 0;
      Prompter.lastSec = -1;
      Prompter.ended = false;
      Prompter.playing = false;

      // 1) o essencial, na ordem em que depende do layout
      show('prompter');
      safe(Settings.applyToPrompter);
      Prompter.measure(false);
      if (Prompter.tops.length) Prompter.offset = Prompter.tops[0];
      Prompter.lastSec = Prompter.sectionAt(Prompter.offset);
      Prompter.buildTicks();
      Prompter.paint();
      Prompter.updateUI();
      Prompter.startLoop();
      // gravando, nada comeca sozinho: a pessoa senta, se enquadra e pisa no pedal
      if (Rec.enabled()) {
        Flip.start();      // antes do prepare: enquanto decide se o celular esta virado, a tela nao inverte
        Lay.start();       // deitado (v9.6): o mesmo, enquanto decide se o celular esta deitado
        Rec.prepare();
        Rec.poke();        // abrir (trocar de modo reabre) zera a contagem da camera ociosa
        Folder.check();    // licenca da pasta PROMPTER: o primeiro toque sabe se precisa pedir
        Prompter.flash('i-rec', cue('Pise para gravar', 'Toque na tela para gravar'));
        // o login do Google sai da pagina: so antes de gravar, nunca no meio (o video em andamento se perderia)
        if (settings.driveUpload && !GDocs.canWrite() && navigator.onLine) {
          var sid = s.id;
          Toast.show('Para os vídeos subirem sozinhos para o Drive, entre no Google antes de gravar.', 'Entrar', function () {
            if (!Rec.active()) GDocs.login({ do: 'present', id: sid });
          }, 12000);
        }
      }
      else Prompter.countdownThenPlay();
      requestAnimationFrame(function () { if (Prompter.isOpen()) { Prompter.relayout(); } });

      // 2) o que pode falhar no aparelho (TWA, permissao, navegador antigo) nunca impede rolagem ou pedal
      safe(Prompter.requestFullscreen);
      safe(Prompter.requestWakeLock);
      if (settings.follow) Follow.start();
      GDocs.checkForUpdate(s);
    },

    // botao de sair, Esc: com video na fila do Drive, avisa antes
    exit: function () {
      if (Up.pending() > 0) { Prompter.pause(true); UpLeave.show('prompter'); return; }
      show('library');
    },

    leave: function () {
      UpLeave.hide();
      Prompter.playing = false;
      Prompter.pendingPlay = false;
      Prompter.anim = null;
      Prompter.stopLoop();
      clearTimeout(Prompter.hideTimer);
      VIEWS.prompter.classList.remove('ui-hidden');
      $('#countdown').hidden = true;
      Prompter.cdShown = -1;
      Settings.close();
      FxSheet.close();
      Peek.hide(true);
      Voice.stop();
      Follow.stop();
      if (Player.isOpen()) Player.close();
      Flip.stop();
      Lay.stop();
      Rec.release();
      Lay.clear();
      safe(Prompter.releaseWakeLock);
      safe(Prompter.exitFullscreen);
    },

    /* ---- medidas ---- */

    // paragrafo cujo comeco ja passou da linha de leitura
    paraIndexAt: function (off) {
      var t = Prompter.tops, i = 0;
      for (var k = 0; k < t.length; k++) { if (t[k] <= off + Prompter.lineBox * 0.5) i = k; else break; }
      return i;
    },
    anchor: function () {
      var t = Prompter.tops;
      if (!t.length) return { i: -1, f: Prompter.offset / Prompter.maxOffset };
      var i = Prompter.paraIndexAt(Prompter.offset);
      var next = i + 1 < t.length ? t[i + 1] : Prompter.maxOffset + Prompter.lineBox;
      var h = Math.max(1, next - t[i]);
      return { i: i, f: (Prompter.offset - t[i]) / h };
    },
    // bloco (# titulo) que esta na linha de leitura; -1 antes do primeiro titulo
    sectionAt: function (off) {
      var m = Prompter.marks || [], i = -1;
      for (var k = 0; k < m.length; k++) { if (m[k].top <= off + Prompter.lineBox * 0.5) i = k; else break; }
      return i;
    },
    sectionTitle: function (i) {
      var m = Prompter.marks || [];
      return i >= 0 && i < m.length ? m[i].text : '';
    },
    restoreAnchor: function (a) {
      var t = Prompter.tops;
      if (a.i < 0 || !t.length) { Prompter.offset = clamp(a.f * Prompter.maxOffset, 0, Prompter.maxOffset); return; }
      var i = Math.min(a.i, t.length - 1);
      var next = i + 1 < t.length ? t[i + 1] : Prompter.maxOffset + Prompter.lineBox;
      Prompter.offset = clamp(t[i] + a.f * Math.max(1, next - t[i]), 0, Prompter.maxOffset);
    },

    measure: function (keepAnchor) {
      var st = $('#stage'), content = $('#content');
      if (keepAnchor && Prompter.anim) { Prompter.offset = Prompter.anim.to; Prompter.anim = null; }
      var a = keepAnchor ? Prompter.anchor() : null;
      var H = st.clientHeight || window.innerHeight;
      var G = H * settings.guidePos / 100;
      var lineBox = settings.font * settings.line / 100;
      Prompter.lineBox = lineBox;
      st.style.setProperty('--guidey', G.toFixed(1) + 'px');
      st.style.setProperty('--linebox', lineBox.toFixed(1) + 'px');
      VIEWS.prompter.style.setProperty('--guidey', G.toFixed(1) + 'px');     // a imagem da camera se apoia na linha
      VIEWS.prompter.style.setProperty('--linebox', lineBox.toFixed(1) + 'px');
      $('#app').style.setProperty('--guidey', G.toFixed(1) + 'px');           // v10.0: o aviso (toast) fica acima do texto da linha
      $('#app').style.setProperty('--linebox', lineBox.toFixed(1) + 'px');
      st.style.setProperty('--fadeh', Math.max(0, G - lineBox * 0.55).toFixed(1) + 'px');
      st.style.setProperty('--padtop', (G - lineBox / 2).toFixed(1) + 'px');
      var textH = content.offsetHeight, paraH = 0;
      Prompter.tops = Prompter.paras.map(function (p) { paraH += p.offsetHeight; return p.offsetTop; });
      Prompter.heights = Prompter.paras.map(function (p) { return p.offsetHeight; });
      Prompter.marks = Array.prototype.map.call(content.querySelectorAll('.mark'), function (m) {
        return { top: m.offsetTop, text: m.textContent };
      });
      Prompter.maxOffset = Math.max(1, textH - lineBox);
      // velocidade em palavras por minuto: px por palavra medidos so nos paragrafos falados
      // (titulos, [indicacoes] e espacos entre blocos passam no mesmo ritmo, como respiro)
      Prompter.pxPerWord = Prompter.words > 0 && paraH > 0 ? paraH / Prompter.words : lineBox / 5;
      if (a) Prompter.restoreAnchor(a);
      Prompter.offset = clamp(Prompter.offset, 0, Prompter.maxOffset);
    },
    relayout: function () {
      if (!Prompter.isOpen()) return;
      Prompter.measure(true);
      Prompter.buildTicks();
      Prompter.paint();
      Prompter.updateMeta(true);
      SndSpot.place();          // a linha de leitura ou a tela mudaram: o aviso do som procura o lugar de novo
    },
    pxPerSec: function () { return settings.wpm * Prompter.pxPerWord / 60; },

    /* ---- desenho ---- */

    paint: function () {
      $('#scroller').style.transform = 'translate3d(0,' + (-Prompter.offset).toFixed(2) + 'px,0)';
      var pct = clamp(Prompter.offset / Prompter.maxOffset, 0, 1);
      $('#progress-bar').style.transform = 'scaleX(' + pct.toFixed(4) + ')';
      // a barra de posicao muda largura (refaz o layout): com os controles escondidos, nao mexe nela
      if (!Prompter.uiHidden()) Prompter.paintScrub(pct);
      if (Prompter.fullDim || Prompter.doneN) Prompter.paintDone(false);
    },
    /* v10.0, tela cheia: o degrade escuro do texto ja lido cobriria a imagem da camera. No lugar dele, cada
       paragrafo que ja passou inteiro pela linha de leitura fica apagado (classe 'done'). So mexe nas classes
       quando o numero de paragrafos lidos muda. */
    paintDone: function (force) {
      var paras = Prompter.paras, n = 0;
      if (Prompter.fullDim) {
        var lim = Prompter.offset + 1;
        for (var i = 0; i < paras.length; i++) { if (Prompter.tops[i] + (Prompter.heights[i] || 0) <= lim) n = i + 1; else break; }
      }
      if (n === Prompter.doneN && !force) return;
      var a = force ? 0 : Math.min(n, Prompter.doneN), b = force ? paras.length : Math.max(n, Prompter.doneN);
      for (var k = a; k < b; k++) paras[k].classList.toggle('done', k < n);
      Prompter.doneN = n;
    },
    paintScrub: function (pct) {
      if (pct == null) pct = clamp(Prompter.offset / Prompter.maxOffset, 0, 1);
      $('#scrub-fill').style.width = (pct * 100).toFixed(2) + '%';
      $('#scrub-knob').style.left = (pct * 100).toFixed(2) + '%';
    },
    updateMeta: function (force) {
      var t = now();
      if (!force && Prompter.uiHidden()) return;      // ninguem ve: atualiza quando os controles voltarem
      if (!force && t - Prompter.metaAt < 250) return;
      Prompter.metaAt = t;
      var n = Prompter.paras.length;
      var i = n ? Prompter.paraIndexAt(Prompter.offset) : 0;
      $('#scrub-para').textContent = n ? 'Parágrafo ' + (i + 1) + ' de ' + n : '';
      var left = (Prompter.maxOffset - Prompter.offset) / Math.max(1, Prompter.pxPerSec());
      $('#scrub-time').textContent = 'faltam ' + fmtDur(left);
      var sc = $('#scrub');
      sc.setAttribute('aria-valuenow', String(Math.round(Prompter.offset / Prompter.maxOffset * 100)));
      sc.setAttribute('aria-valuetext', $('#scrub-para').textContent + ', ' + $('#scrub-time').textContent);
    },
    buildTicks: function () {
      var box = $('#scrub-ticks');
      box.innerHTML = '';
      var max = Prompter.maxOffset;
      if (Prompter.tops.length > 80) return;
      Prompter.tops.forEach(function (top, i) {
        if (!i) return;
        var b = el('b');
        b.style.left = (clamp(top / max, 0, 1) * 100).toFixed(2) + '%';
        box.appendChild(b);
      });
    },
    updateUI: function () {
      var p = Prompter.playing;
      $('#pause-pill').hidden = p || Prompter.pendingPlay;
      Prompter.paintPlay();
      if (p) Prompter.scheduleHide(); else if (!Prompter.quiet) Prompter.showUI();
      Rec.poke();          // play, pausa, fim, contagem: a camera ociosa conta a partir daqui
    },
    /* botao de play e pilula: o que o proximo "iniciar" faz. v9.8: parado no fim do roteiro e ainda
       gravando, iniciar para a gravacao (Rec.finish): o botao vira parar e a pilula diz como parar.
       Chamado tambem quando a gravacao comeca ou para (Rec.paint) e quando o texto sai do fim (unend). */
    paintPlay: function () {
      var p = Prompter.playing, stopRec = Rec.atEnd();
      $('#pc-play-use').setAttribute('href', p ? '#i-pause' : stopRec ? '#i-stop' : '#i-play');
      $('#pc-play').setAttribute('aria-label', p ? 'Pausar' : stopRec ? 'Parar a gravação' : 'Iniciar');
      $('#pause-pill').lastChild.textContent = stopRec ? cue('Pise para parar a gravação', 'Toque para parar a gravação')
        : !p && Prompter.ended ? 'Fim' : Rec.napped ? 'Câmera desligada'
        : Rec.enabled() && !Rec.active() ? cue('Pise para gravar', 'Toque na tela para gravar') : 'Pausado';
    },
    // o texto saiu do fim (voltar, avancar, arrastar): o proximo iniciar volta a rolar dali
    unend: function () {
      if (!Prompter.ended) return;
      Prompter.ended = false;
      Prompter.paintPlay();
    },

    // controles somem durante a leitura; o vidro reflete so o texto
    showUI: function () {
      clearTimeout(Prompter.hideTimer);
      var was = Prompter.uiHidden();
      VIEWS.prompter.classList.remove('ui-hidden');
      if (was && Prompter.isOpen()) { Prompter.paintScrub(); Prompter.updateMeta(true); }
      if (Prompter.playing) Prompter.scheduleHide();
    },
    scheduleHide: function () {
      clearTimeout(Prompter.hideTimer);
      Prompter.hideTimer = setTimeout(function () {
        if (Prompter.playing && !Dial.dragging && !Scrub.dragging && !Prompter.sheetOpen()) VIEWS.prompter.classList.add('ui-hidden');
      }, 2600);
    },
    uiHidden: function () { return VIEWS.prompter.classList.contains('ui-hidden'); },

    flash: function (icon, text, muted) {
      if (!Prompter.isOpen()) return;
      var f = $('#flash');
      $('#flash-use').setAttribute('href', '#' + icon);
      $('#flash-text').textContent = text || '';
      $('#flash-text').hidden = !text;
      f.classList.toggle('muted', !!muted);
      f.classList.remove('show');
      void f.offsetWidth;
      f.classList.add('show');
      clearTimeout(Prompter.flashTimer);
      Prompter.flashTimer = setTimeout(function () { f.classList.remove('show'); }, text ? 900 : 520);
    },

    /* ---- laco de animacao ---- */

    startLoop: function () {
      Prompter.stopLoop();
      Prompter.lastT = 0;
      Prompter.raf = requestAnimationFrame(Prompter.tick);
    },
    stopLoop: function () {
      if (Prompter.raf) cancelAnimationFrame(Prompter.raf);
      Prompter.raf = 0;
    },
    // religa o laco se ele tiver morrido (aba em segundo plano, throttle do sistema)
    ensureLoop: function () { if (Prompter.isOpen() && !Prompter.raf) Prompter.startLoop(); },

    tick: function (t) {
      if (!Prompter.isOpen()) { Prompter.raf = 0; return; }
      Prompter.raf = requestAnimationFrame(Prompter.tick);
      /* no maximo ~60 quadros por segundo: tela de 90/120 Hz desenhando o dobro so esquenta o celular
         (a velocidade nao muda: o passo usa o tempo real entre quadros) */
      if (Prompter.lastT && t - Prompter.lastT < Prompter.MIN_FRAME) return;
      try { Prompter.step(t); } catch (e) { /* um quadro ruim nao derruba a rolagem */ }
      // parado e sem nada se mexendo: o laco dorme; play, salto, contagem e a volta ao app o acordam (ensureLoop)
      if (Prompter.idle()) {
        cancelAnimationFrame(Prompter.raf);
        Prompter.raf = 0;
        Prompter.updateMeta(true);
      }
    },
    MIN_FRAME: 14,
    idle: function () {
      return !Prompter.playing && !Prompter.pendingPlay && !Prompter.anim && Prompter.cur === 0 && !Follow.active();
    },
    step: function (t) {
      if (!Prompter.lastT) Prompter.lastT = t;
      var dt = Math.min(0.05, (t - Prompter.lastT) / 1000);
      Prompter.lastT = t;
      if (Prompter.maxOffset <= 2) Prompter.measure(false);

      /* contagem regressiva e play automatico moram no laco, nao em setTimeout:
         nao dependem de temporizador que o sistema possa atrasar ou engolir */
      if (Prompter.pendingPlay) {
        var left = Prompter.playAt - now();
        if (left <= 0) {
          Prompter.pendingPlay = false;
          Prompter.cdShown = -1;
          $('#countdown').hidden = true;
          Prompter.play(true);
        } else {
          var secs = Math.ceil(left / 1000);
          if (secs !== Prompter.cdShown) { Prompter.cdShown = secs; $('#countdown-num').textContent = String(secs); }
        }
      }

      Follow.sample();
      var gate = Follow.active() ? (Follow.speaking ? 1 : 0) : 1;
      var target = Prompter.playing ? Prompter.pxPerSec() * gate : 0;
      // aceleracao e freada suaves, independentes da taxa de quadros (~0,7 s para parar)
      var k = Prompter.playing ? (gate ? 4.5 : 3.2) : 6;
      Prompter.cur += (target - Prompter.cur) * (1 - Math.exp(-k * dt));
      if (Math.abs(target - Prompter.cur) < 1) Prompter.cur = target;

      var moved = false;
      if (Prompter.anim) {
        var a = Prompter.anim, p = Math.min(1, (now() - a.t0) / a.dur);
        var e = 1 - Math.pow(1 - p, 3);
        Prompter.offset = clamp(a.from + (a.to - a.from) * e, 0, Prompter.maxOffset);
        if (p >= 1) {
          Prompter.anim = null;
          Prompter.lastPara = Prompter.paraIndexAt(Prompter.offset);
          Prompter.lastSec = Prompter.sectionAt(Prompter.offset);
        }
        moved = true;
      } else if (Prompter.cur !== 0) {
        Prompter.offset += Prompter.cur * dt;
        moved = true;
        if (Prompter.offset >= Prompter.maxOffset) {
          Prompter.offset = Prompter.maxOffset;
          Prompter.playing = false;
          Prompter.ended = true;
          Prompter.cur = 0;
          /* v9.8 (05/11, pedido do Claudio: "o aplicativo tem que continuar gravando no final"): gravando,
             o fim do roteiro NAO fecha mais o arquivo (ate a v9.7 fechava sozinho 2,5 s depois e cortava
             o final). O texto para; a gravacao segue ate a pessoa parar. Iniciar (pedal da direita, toque,
             play) para e salva (Rec.finish); voltar volta o texto e a gravacao continua no mesmo arquivo.
             Esquecida assim, para sozinha depois de Rec.END_IDLE_MS sem ninguem mexer (Rec.armEnd). */
          if (Rec.active()) {
            Prompter.quiet = true;       // como no fim do bloco: controles escondidos continuam escondidos e a pilula diz como parar
            Prompter.updateUI();
            Prompter.quiet = false;
            Prompter.flash('i-rec', 'Fim do roteiro · gravando');
          } else {
            Prompter.updateUI();
            Prompter.flash('i-check', 'Fim do roteiro');
          }
        }
        if (Prompter.offset < 0) Prompter.offset = 0;
        // gravar por blocos: para no fim do paragrafo e deixa o proximo na linha
        if (Prompter.playing && settings.autoPause && Prompter.tops.length) {
          var idx = Prompter.paraIndexAt(Prompter.offset);
          if (idx > Prompter.lastPara) {
            Prompter.quiet = true;
            Prompter.pause(true);
            Prompter.quiet = false;
            Prompter.cur = 0;
            Prompter.jumpTo(Prompter.tops[idx], 260);
            Prompter.flash('i-pause', 'Bloco ' + (idx + 1) + ' pronto');
          }
          Prompter.lastPara = idx;
        }
        // gravando: o texto para no titulo do proximo bloco; a proxima pisada abre outro arquivo
        if (Prompter.marks.length) {
          var sec = Prompter.sectionAt(Prompter.offset);
          if (Prompter.playing && Rec.active() && sec > Prompter.lastSec) {
            Prompter.quiet = true;
            Prompter.pause(true);
            Prompter.quiet = false;
            Prompter.cur = 0;
            Prompter.jumpTo(Prompter.firstParaAfter(Prompter.marks[sec].top), 260);
            Prompter.flash('i-rec', cue('Fim do bloco: pise para o próximo', 'Fim do bloco: toque para o próximo'));
          }
          Prompter.lastSec = sec;
        }
      }
      if (moved) Prompter.paint();
      Prompter.updateMeta(false);
    },

    /* ---- comandos ---- */

    play: function (silent) {
      if (!Prompter.isOpen()) return;
      Prompter.cancelCountdown();
      Prompter.ensureLoop();
      if (Prompter.playing) return;
      if (Prompter.maxOffset <= 2) Prompter.measure(false);
      // so recomeca do topo se o texto chegou ao fim rolando (parar no ultimo bloco de uma linha nao e "fim")
      if (Prompter.ended) { Prompter.offset = 0; Prompter.paint(); }
      Prompter.ended = false;
      Prompter.lastPara = Prompter.paraIndexAt(Prompter.offset);
      Prompter.lastSec = Prompter.sectionAt(Prompter.offset);
      Prompter.playing = true;
      Prompter.updateUI();
      if (!silent) Prompter.flash('i-play');
    },
    pause: function (silent) {
      if (!Prompter.isOpen()) return;
      var wasCounting = Prompter.pendingPlay;
      Prompter.cancelCountdown();
      Prompter.ensureLoop();
      if (!Prompter.playing) { if (wasCounting) Prompter.updateUI(); return; }
      Prompter.playing = false;
      Prompter.updateUI();
      if (!silent) Prompter.flash('i-pause');
    },
    toggle: function () {
      if (Prompter.playing) { Prompter.pause(); return; }
      // v9.8: parado no fim do roteiro e ainda gravando, iniciar para e salva (nao recomeca do topo gravando)
      if (Rec.atEnd()) { Rec.finish(); return; }
      if (Rec.enabled() && Rec.begin()) return;     // primeira pisada: liga a gravacao, conta e rola
      Prompter.play();
    },
    firstParaAfter: function (top) {
      var t = Prompter.tops;
      for (var i = 0; i < t.length; i++) if (t[i] > top) return t[i];
      return top;
    },
    cancelCountdown: function () {
      Prompter.pendingPlay = false;
      Prompter.cdShown = -1;
      $('#countdown').hidden = true;
    },
    jumpTo: function (target, dur) {
      if (!Prompter.isOpen()) return;
      Prompter.unend();
      Prompter.anim = { from: Prompter.offset, to: clamp(target, 0, Prompter.maxOffset), t0: now(), dur: dur || 380 };
      Prompter.ensureLoop();
    },
    // onde o salto em andamento vai terminar: duas pisadas rapidas voltam dois paragrafos
    baseOffset: function () { return Prompter.anim ? Prompter.anim.to : Prompter.offset; },
    // voltar e pausar: para refazer a tomada com calma; o pedal da direita retoma
    back: function () {
      Prompter.pause(true);
      var t = Prompter.tops, base = Prompter.baseOffset();
      if (!t.length) { Prompter.jumpTo(base - $('#stage').clientHeight * 0.4); return; }
      var i = Prompter.paraIndexAt(base);
      var target = base - t[i] > Prompter.lineBox * 0.6 ? t[i] : (i > 0 ? t[i - 1] : 0);
      /* Gravando: voltar nao atravessa o titulo do bloco que esta sendo gravado. Do 1o paragrafo
         do bloco, o "anterior" era o ultimo do bloco de antes, e a pisada seguinte abria um arquivo
         novo com o nome do bloco anterior (22/10: "ROBERTHA-004" com o comeco do 005). Para
         regravar o bloco anterior: parar a gravacao (selo REC) e voltar. */
      var start = Rec.blockStart();
      if (start != null && target < start - 1) {
        Prompter.jumpTo(start);
        Prompter.flash('i-prev', 'Início do bloco');
        return;
      }
      Prompter.jumpTo(target);
      Prompter.flash('i-prev', 'Parágrafo ' + (Prompter.paraIndexAt(target) + 1));
    },
    forward: function () {
      var t = Prompter.tops, base = Prompter.baseOffset();
      if (!t.length) { Prompter.jumpTo(base + $('#stage').clientHeight * 0.4); return; }
      if (base < t[0] - Prompter.lineBox * 0.5) {         // ainda antes do 1o paragrafo (titulo, topo)
        Prompter.jumpTo(t[0]);
        Prompter.flash('i-next', 'Parágrafo 1');
        return;
      }
      var i = Prompter.paraIndexAt(base);
      var target = i + 1 < t.length ? t[i + 1] : Prompter.maxOffset;
      Prompter.jumpTo(target);
      Prompter.flash('i-next', i + 1 < t.length ? 'Parágrafo ' + (i + 2) : 'Fim');
    },
    toTop: function () {
      Prompter.jumpTo(0, 500);
      Prompter.flash('i-top', 'Início');
    },
    // rolagem manual (dedo, roda, barra de posicao)
    nudge: function (px) {
      Prompter.anim = null;
      Prompter.unend();
      Prompter.offset = clamp(Prompter.offset + px, 0, Prompter.maxOffset);
      Prompter.lastPara = Prompter.paraIndexAt(Prompter.offset);
      Prompter.lastSec = Prompter.sectionAt(Prompter.offset);
      Prompter.paint();
      Prompter.updateMeta(true);
    },
    setWpm: function (v, persist) {
      v = clamp(Math.round(v), 60, 260);
      if (v === settings.wpm && !persist) return;
      settings.wpm = v;
      if (persist) {
        saveSettings();
        var s = Prompter.isOpen() && findScript(Prompter.id);
        if (s && s.wpm !== v) { s.wpm = v; saveScripts(); }
      }
      Dial.paint();
      Settings.syncControls();
      Prompter.updateMeta(true);
    },
    changeSpeed: function (delta, showFlash) {
      Prompter.setWpm(Math.round((settings.wpm + delta) / 5) * 5, true);
      if (showFlash) Prompter.flash(delta > 0 ? 'i-plus' : 'i-minus', settings.wpm + ' ppm');
    },

    countdownThenPlay: function () {
      var n = settings.countdown | 0;
      if (!(n > 0)) { Prompter.cancelCountdown(); Prompter.play(true); return; }
      Prompter.pendingPlay = true;
      Prompter.playAt = now() + n * 1000;
      Prompter.cdShown = n;
      $('#countdown-num').textContent = String(n);
      $('#countdown').hidden = false;
      Prompter.updateUI();
      Prompter.ensureLoop();
    },

    requestWakeLock: function () {
      if (!settings.wake || !navigator.wakeLock || !navigator.wakeLock.request || !Prompter.isOpen()) return;
      if (Prompter.wakeLock && !Prompter.wakeLock.released) return;
      var p = navigator.wakeLock.request('screen');
      if (!p || !p.then) return;
      p.then(function (lock) {
        Prompter.wakeLock = lock;
        if (lock && lock.addEventListener) lock.addEventListener('release', function () { Prompter.wakeLock = null; });
      }).catch(function () { /* negado, sem bateria, ou sem suporte */ });
    },
    releaseWakeLock: function () {
      var lock = Prompter.wakeLock;
      Prompter.wakeLock = null;
      if (lock && lock.release) safe(function () { return lock.release(); });
    },
    // instalado (TWA em fullscreen) o pedido explicito falha: nao pedimos, e se pedirmos a falha e engolida
    alreadyImmersive: function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) return true;
      if (!window.matchMedia) return false;
      return window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches;
    },
    requestFullscreen: function () {
      if (!settings.fullscreen || Prompter.alreadyImmersive()) return;
      var d = document.documentElement;
      var fn = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fn) safe(function () { return fn.call(d); });
    },
    exitFullscreen: function () {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
      var fn = document.exitFullscreen || document.webkitExitFullscreen;
      if (fn) safe(function () { return fn.call(document); });
    }
  };

  /* ============================ Gravacao com a camera ============================
     O proprio teleprompter grava, para a pessoa gravar sozinha: camera traseira e microfone,
     MP4 pelo MediaRecorder. A primeira pisada liga a gravacao e a contagem; depois o pedal so
     pausa e retoma o texto, e a gravacao segue (os erros saem na edicao). Cada bloco (# titulo)
     vira um arquivo: o texto para no titulo seguinte e a proxima pisada fecha um e abre outro.
     O video desce para a pasta Download do aparelho. */

  /* Grava o giro no proprio MP4 (matriz do tkhd da faixa de video), sem recodificar: o arquivo
     abre em pe no celular, no Drive e no editor. O MP4 do Chrome e fragmentado e o moov vem no
     primeiro pedaco. Giro em graus no sentido horario, o mesmo da imagem do canto. */
  function mp4Rotate(buf, deg) {
    var M = { 0: [1, 0, 0, 1], 90: [0, 1, -1, 0], 180: [-1, 0, 0, -1], 270: [0, -1, 1, 0] }[deg];
    if (!M) return false;
    var dv = new DataView(buf), done = false;
    var walk = function (p, end) {
      while (!done && p + 8 <= end) {
        var size = dv.getUint32(p), hdr = 8;
        var type = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
        if (size === 1) { size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12); hdr = 16; }
        else if (size === 0) size = end - p;
        if (size < hdr || p + size > end) return;            // caixa cortada: o moov nao veio inteiro
        if (type === 'moov' || type === 'trak') walk(p + hdr, p + size);
        else if (type === 'tkhd') {
          var m = p + hdr + 4 + (dv.getUint8(p + hdr) === 1 ? 32 : 20) + 16;
          if (m + 44 <= p + size && dv.getUint32(m + 36) && dv.getUint32(m + 40)) {   // faixa com largura e altura: video
            dv.setInt32(m, M[0] * 65536); dv.setInt32(m + 4, M[1] * 65536);
            dv.setInt32(m + 12, M[2] * 65536); dv.setInt32(m + 16, M[3] * 65536);
            done = true;
          }
        }
        p += size;
      }
    };
    walk(0, buf.byteLength);
    return done;
  }

  function slugName(s) {
    var t = String(s || '');
    if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    t = t.replace(/[^A-Za-z0-9 _.-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim();
    return t || 'gravacao';
  }

  var Rec = {
    stream: null,
    starting: false,
    gen: 0,             // geracao do pedido de camera: resposta atrasada de pedido antigo e descartada
    mr: null,
    t0: 0,
    sec: -1,            // bloco em gravacao
    clock: 0,
    saving: 0,          // videos sendo salvos (Download + fila do Drive)
    savedAt: 0,
    IDLE_MS: 120000,    // camera ociosa: parada esse tempo sem ninguem mexer, desliga (ver nap)
    idleAt: 0,          // ultima interacao (ou ultima vez que havia algo acontecendo)
    idleTimer: 0,
    napped: false,      // desligada por ociosidade: a faixa do som avisa ate religar
    END_IDLE_MS: 600000, // v9.8: parada no fim do roteiro, gravando, esse tempo sem ninguem mexer: para e salva (ver armEnd)
    endTimer: 0,
    fxRec: false,       // v10.0: a gravacao em curso sai do canvas do filtro (Fx), nao direto da camera
    streamBig: false,   // a camera ligada foi pedida em 4K

    enabled: function () { return !!settings.record; },
    active: function () { return !!Rec.mr; },
    // 4K so sem filtro (v10.0): com filtro ligado o video sai no maximo em Full HD e a camera e pedida em 1080
    big: function () { return settings.recQuality !== '1080' && !Fx.wanted(); },
    // voz crua: sem cancelamento de eco, supressao de ruido nem ganho automatico
    audio: function () { return { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } }; },

    /* tela travada enquanto grava. Camera traseira: o celular fica em pe, de costas para a pessoa,
       e a tela deitada aparece inteira no monitor do lado da lente (em pe ela vira uma faixa estreita).
       As versoes "invertidas" servem para o celular (ou o monitor) de cabeca para baixo.
       v9.6: 'landscape' = deitada, no lado em que o celular estiver (o layout acompanha se virar);
       gravando, trava naquele lado. */
    lockScreen: function () {
      var o = screen.orientation;
      if (!o || !o.lock || Flip.on || Lay.on) return;      // aviso de virar/deitar o celular em andamento: ele decide a tela
      var want = settings.recScreen;
      if (want === 'landscape' && Rec.active()) {
        if (!/^landscape-/.test(o.type || '')) return;      // a tela nao deitou (a trava falhou): girar agora mudaria o video no meio
        want = o.type;
      }
      if (Rec.enabled() && Prompter.isOpen() && /^(landscape|portrait)(-|$)/.test(want)) safe(function () { return o.lock(want); });
      else if (o.unlock) safe(function () { o.unlock(); });
    },

    /* v9.6: gravando deitado, o Chrome do Android entrega o quadro deitado (na orientacao da tela).
       Se a faixa vier em pe mesmo assim, o giro que falta vai para o tkhd (sem recodificar) e o
       video toca horizontal. Graus no sentido horario; frente e traseira giram ao contrario, porque
       a imagem da frente sai como os outros veem (nao espelhada). */
    fixRot: function () {
      if (!landMode() || !Rec.stream || !Lay.flat()) return 0;
      var t = Rec.stream.getVideoTracks()[0], s = (t && t.getSettings && t.getSettings()) || {};
      var v = $('#cam-video'), w = s.width || v.videoWidth, h = s.height || v.videoHeight;
      if (!w || !h || w >= h) return 0;
      return (Lay.side() === 'l') === (settings.camFacing === 'user') ? 90 : 270;
    },

    // ao abrir o prompter: so liga a camera, para enquadrar
    prepare: function () {
      Rec.paint();
      Rec.lockScreen();
      if (!Rec.enabled() || Rec.stream || Rec.starting || !Prompter.isOpen()) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        Toast.show('Este aparelho não deixa o app gravar vídeo.');
        return;
      }
      Rec.starting = true;
      if (Rec.napped) { Rec.napped = false; Prompter.updateUI(); Sound.paint(); }   // religando: tira o aviso
      var gen = ++Rec.gen, big = Rec.big();
      Rec.streamBig = big;
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: settings.camFacing === 'user' ? 'user' : 'environment' }, width: { ideal: big ? 3840 : 1920 }, height: { ideal: big ? 2160 : 1080 }, frameRate: { ideal: 30 } },
        audio: Rec.audio()
      }).then(function (stream) {
        if (gen !== Rec.gen || !Rec.enabled() || !Prompter.isOpen()) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        Rec.starting = false;
        Rec.stream = stream;
        // o microfone caindo nao derruba a camera: o medidor de som avisa e pede o microfone de novo
        stream.getVideoTracks().forEach(function (t) { t.addEventListener('ended', Rec.lost); });
        /* 11/11/2026: a camera da frente baixava sozinha para ~24 qps irregulares quando a luz caia (7 de 10 tomadas da
           Robertha), e o video saia com quadros repetidos ("tremido"). Pede 30 qps no minimo; se o aparelho recusar,
           segue como estava. Com pouca luz a imagem fica um pouco mais escura: preferir boa luz a perder a fluidez. */
        stream.getVideoTracks().forEach(function (t) {
          if (!t.applyConstraints || !t.getConstraints) return;
          safe(function () {
            var c = Object.assign({}, t.getConstraints(), { frameRate: { min: 30, ideal: 30 } });
            return t.applyConstraints(c);
          });
        });
        Sound.attach(stream);
        var v = $('#cam-video');
        v.srcObject = stream;
        safe(function () { return v.play(); });
        Rec.poke();                     // camera pronta: a contagem da ociosa comeca do zero
        Rec.paint();
        Fx.sync();                      // filtro ligado: o laco do canvas comeca com a camera (v10.0)
      }).catch(function (e) {
        if (gen !== Rec.gen) return;
        Rec.starting = false;
        Toast.show(e && e.name === 'NotAllowedError'
          ? 'Sem permissão de câmera e microfone: libere nas configurações do app.'
          : 'Não consegui ligar a câmera. Feche a câmera do celular e abra o roteiro de novo.');
        Rec.paint();
      });
    },

    // desliga tudo (sair do prompter, desligar a gravacao); o que estava gravando e salvo.
    // keepScreen: a camera so cochilou (nap), a tela continua travada na posicao de gravar
    release: function (keepScreen) {
      Rec.gen++;                        // pedido de camera ou de microfone em andamento chega velho e e descartado
      Rec.starting = false;
      Rec.stop();
      Fx.stop();                        // v10.0: o laco do canvas do filtro para junto (cochilo da camera, sair do prompter)
      Peek.hide(true);
      Sound.detach();                   // antes de parar as faixas: o medidor nao ve o microfone sumir (sem alarme, sem pedir de novo)
      if (Rec.stream) Rec.stream.getTracks().forEach(function (t) { t.removeEventListener('ended', Rec.lost); safe(function () { t.stop(); }); });
      Rec.stream = null;
      clearTimeout(Rec.idleTimer);
      Rec.idleTimer = 0;
      Rec.napped = false;
      $('#cam-video').srcObject = null;
      if (keepScreen !== true && screen.orientation && screen.orientation.unlock) safe(function () { screen.orientation.unlock(); });
      Rec.paint();
    },

    /* ---- camera ociosa (v9.4) ----
       31/10: o S23 Ultra da Consuelo esquentava. Com a gravacao ligada, camera e microfone ficavam
       ligados o tempo todo, inclusive parados em "Toque para gravar" e depois de gravar. Parada assim
       por IDLE_MS sem nenhum toque, tecla, pedal ou rolagem: desliga camera e microfone. A tela
       continua aberta e a faixa do som avisa; a proxima pisada ou toque religa (Rec.begin) e so a
       seguinte grava. Com a gravacao em andamento (inclusive entre blocos) nunca desliga. */
    busy: function () {
      return Rec.active() || Rec.starting || Prompter.playing || Prompter.pendingPlay || Prompter.cur !== 0 || !!Prompter.anim || Player.isOpen();
    },
    // interacao ou mudanca de estado: a contagem recomeca
    poke: function () {
      Rec.idleAt = now();
      Rec.armIdle(Rec.IDLE_MS);
      Rec.armEnd();                     // parada no fim gravando (v9.8): a contagem para salvar sozinha tambem recomeca
    },
    armIdle: function (ms) {
      clearTimeout(Rec.idleTimer);
      Rec.idleTimer = 0;
      if (Rec.stream && Prompter.isOpen()) Rec.idleTimer = setTimeout(Rec.idleCheck, Math.max(50, ms));
    },
    idleCheck: function () {
      Rec.idleTimer = 0;
      if (!Rec.stream || !Prompter.isOpen()) return;
      var t = now(), busy = Rec.busy();
      if (busy) Rec.idleAt = t;                                     // algo acontecendo: conta de novo
      else if (t - Rec.idleAt >= Rec.IDLE_MS) { Rec.nap(); return; }
      // ocupado, olha de novo logo (uma mudanca que nao avisou erra no maximo 5 s); parado, no fim do prazo
      Rec.armIdle(busy ? Math.min(Rec.IDLE_MS, 5000) : Rec.idleAt + Rec.IDLE_MS - t);
    },
    nap: function () {
      if (!Rec.stream || Rec.busy() || !Prompter.isOpen()) return;
      Rec.release(true);                // o mesmo caminho limpo de sair do prompter
      Rec.napped = true;
      Rec.paint();                      // faixa: "CAMERA DESLIGADA"
      Prompter.updateUI();
    },

    // a camera caiu (outro app pegou, o sistema desligou): salva o que deu
    lost: function () {
      if (!Rec.stream) return;
      var was = Rec.active();
      Rec.release();
      Toast.show(was ? 'A câmera desligou no meio. O que foi gravado está salvo.' : 'A câmera desligou.');
    },

    /* ---- fim do roteiro gravando (v9.8) ----
       O texto chegou ao fim rolando e a gravacao continua (antes o arquivo fechava sozinho em 2,5 s).
       Iniciar (pedal da direita, toque na tela, play) para e salva: Prompter.toggle chama finish.
       Voltar tira o texto do fim (Prompter.unend) e a gravacao segue no mesmo arquivo. Para quem
       esquece gravando: END_IDLE_MS sem nenhum toque, tecla, pedal ou rolagem e a gravacao para e
       salva sozinha. Qualquer interacao passa por Rec.poke, que rearma esta contagem. A camera
       ociosa (IDLE_MS) nao muda: gravando, ela nunca desliga. */
    atEnd: function () {
      return Rec.active() && Prompter.ended && !Prompter.playing && !Prompter.pendingPlay && Prompter.isOpen();
    },
    armEnd: function () {
      clearTimeout(Rec.endTimer);
      Rec.endTimer = Rec.atEnd() ? setTimeout(Rec.endIdle, Math.max(50, Rec.END_IDLE_MS)) : 0;
    },
    endIdle: function () {
      Rec.endTimer = 0;
      if (Rec.atEnd()) Rec.finish(true);
    },
    // para e salva a gravacao parada no fim do roteiro. auto: ninguem mexeu por END_IDLE_MS
    finish: function (auto) {
      if (!Rec.active()) return;
      Rec.stop();
      if (auto) Toast.show('A gravação parou sozinha: ficou parada no fim do roteiro sem ninguém mexer. O vídeo foi salvo.', null, null, 30000);
      else Prompter.flash('i-stop', 'Gravação parada');
    },

    // pedal "iniciar" (ou toque na tela, ou play). Devolve true quando a pisada ja foi usada aqui (o texto rola depois da contagem).
    begin: function () {
      Sound.wake();                     // a pisada e um gesto: destrava o medidor se o navegador o deixou parado
      if (!Rec.stream) {
        // camera desligada (ociosa ou que falhou): esta pisada so a liga, a seguinte grava
        Rec.prepare();
        Prompter.flash('i-rec', Rec.starting ? 'Ligando a câmera…' : 'Câmera desligada', true);
        return true;
      }
      if (Rec.active()) {
        if (Prompter.sectionAt(Prompter.baseOffset()) !== Rec.sec) { Rec.stop(); Rec.start(); }   // outro bloco, outro arquivo
        return false;
      }
      if (Folder.ask()) return true;    // a pasta PROMPTER pede licenca de novo: este toque so libera, o seguinte grava
      if (!Rec.start()) return true;
      Prompter.countdownThenPlay();
      return true;
    },

    mime: function () {
      var list = ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];
      for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
      return '';
    },

    start: function () {
      if (Rec.active() || !Rec.stream) return false;
      Voice.stop();                     // o reconhecimento de voz disputa o microfone com a gravacao
      var type = Rec.mime(), mr = null, opts = { mimeType: type, videoBitsPerSecond: Rec.big() ? 30e6 : 12e6, audioBitsPerSecond: 192000 };
      /* v10.0: filtro ligado e funcionando: grava o canvas do filtro (o mesmo que esta na tela) com o som da
         camera. Sem filtro, o caminho de sempre: a camera direto no MediaRecorder. */
      var fxTrack = Fx.running && !Fx.broken ? Fx.track() : null;
      if (fxTrack) {
        try { mr = new MediaRecorder(new MediaStream([fxTrack].concat(Rec.stream.getAudioTracks())), opts); }
        catch (e) { safe(function () { fxTrack.stop(); }); fxTrack = null; mr = null; }
      }
      if (!mr) {
        try {
          mr = new MediaRecorder(Rec.stream, opts);
        } catch (e) {
          Toast.show('Este aparelho não conseguiu iniciar a gravação.');
          return false;
        }
      }
      // posicao final de um salto em andamento: o nome sai do bloco onde o texto vai parar
      var chunks = [], started = new Date(), sec = Prompter.sectionAt(Prompter.baseOffset());
      var label = Prompter.sectionTitle(sec) || $('#p-title').textContent;
      var rot = ((settings.camRotate | 0) + Rec.fixRot()) % 360;
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      mr.onstop = function () {
        if (fxTrack) safe(function () { fxTrack.stop(); });     // so a faixa do canvas; o som e a camera continuam
        Rec.save(chunks, mr.mimeType || type, started, label, rot);
      };
      mr.onerror = function () {
        Toast.show('A gravação deu erro. O que já foi gravado será salvo.');
        if (Rec.mr === mr) Rec.stop();
      };
      try { mr.start(1000); } catch (e) {
        if (fxTrack) safe(function () { fxTrack.stop(); });
        Toast.show('Este aparelho não conseguiu iniciar a gravação.');
        return false;
      }
      Rec.mr = mr;
      Rec.fxRec = !!fxTrack;
      Rec.sec = sec;
      Rec.t0 = now();
      if (settings.recScreen === 'landscape') Rec.lockScreen();   // deitada: gravando, a tela fica travada no lado em que esta
      clearInterval(Rec.clock);
      Rec.clock = setInterval(Rec.paintClock, 500);
      haptic(25);
      Sound.started();
      Rec.paint();
      return true;
    },

    // topo do 1o paragrafo do bloco em gravacao (null: nao esta gravando, ou o roteiro nao tem blocos)
    blockStart: function () {
      var m = Prompter.marks || [];
      if (!Rec.active() || Rec.sec < 0 || !m[Rec.sec]) return null;
      return Prompter.firstParaAfter(m[Rec.sec].top);
    },

    stop: function () {
      clearTimeout(Rec.endTimer);
      Rec.endTimer = 0;
      clearInterval(Rec.clock);
      var mr = Rec.mr;
      Rec.mr = null;
      if (mr) Rec.savedAt = now();
      if (mr && mr.state !== 'inactive') safe(function () { mr.stop(); });
      if (mr) Rec.poke();               // gravacao acabou: a camera ociosa conta a partir daqui
      if (mr && settings.recScreen === 'landscape') Rec.lockScreen();   // deitada: volta a seguir o lado do celular
      if (mr) {
        Rec.fxRec = false;
        // v10.0: o filtro desligado (ou que falhou) no meio da gravacao sai agora; a camera volta ao 4K se for o caso.
        // Depois, nao aqui: no meio de release/begin a camera ainda esta mudando
        setTimeout(Fx.sync, 0);
      }
      Rec.paint();
    },

    // copia na pasta Download do celular (o caminho de sempre e a reserva da pasta PROMPTER)
    download: function (url, name) {
      var a = el('a');
      a.href = url; a.download = name; a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },

    save: function (chunks, type, d, label, rot) {
      if (!chunks.length) return;
      // ate o video estar no celular e na fila do Drive, a pagina nao sai (login automatico espera)
      Rec.saving++;
      var settle = function () { Rec.saving = Math.max(0, Rec.saving - 1); Rec.savedAt = now(); };
      var webm = /webm/.test(type);
      var stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
      var name = stamp + ' ' + slugName(label) + (webm ? '.webm' : '.mp4');
      var finish = function (parts) {
        var blob = new Blob(parts, { type: type.split(';')[0] || 'video/mp4' });
        var url = URL.createObjectURL(blob);
        // a ultima gravacao fica a mao para conferir; a anterior libera a memoria
        if (Rec.last) { var old = Rec.last.url; setTimeout(function () { URL.revokeObjectURL(old); }, 15 * 60 * 1000); }
        Rec.last = { url: url, name: name };
        Rec.paint();       // sem aviso na tela (o Cláudio pediu): a ultima gravacao fica no icone de filme do topo
        // primeiro a copia no celular (pasta PROMPTER, ou Download); so depois a fila do Drive (Up.clear conta com isso)
        Folder.keep(blob, url, name).then(function () {
          if (settings.driveUpload) Up.add(blob, name, d.getFullYear() + ' ' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getDate())).then(settle, settle);
          else settle();
        });
      };
      if (!rot || webm || !chunks[0].arrayBuffer) { finish(chunks); return; }
      chunks[0].arrayBuffer().then(function (buf) {
        finish(mp4Rotate(buf, rot) ? [new Blob([buf])].concat(chunks.slice(1)) : chunks);
      }).catch(function () { finish(chunks); });
    },

    paintClock: function () {
      if (!Rec.active()) return;
      var s = Math.floor((now() - Rec.t0) / 1000);
      $('#rec-time').textContent = pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
    },

    paint: function () {
      var on = Rec.enabled() && Prompter.isOpen();
      // deitado com a faixa em pe (fixRot): o canto gira junto; a imagem da frente e espelho, gira ao contrario
      var fix = Rec.fixRot(), land = landMode() && Lay.flat();
      var v = $('#cam-video'), rot = ((settings.camRotate | 0) + (settings.camFacing === 'user' ? 360 - fix : fix)) % 360, vp = VIEWS.prompter;
      var show = on && !!settings.camPreview;
      // v10.0: tela cheia: a imagem ocupa a tela toda atras de tudo (em pe e deitado); nada abre espaco para ela
      var full = show && settings.camPos === 'full';
      $('#cam').hidden = !show;
      vp.classList.toggle('has-cam', show && !full);
      vp.classList.toggle('cam-full', full);
      $('#app').classList.toggle('tp-full', full);
      // frente em pe (painel no alto): o aviso (toast) fica logo acima do texto da linha, nao em cima dele
      $('#app').classList.toggle('tp-fctl', full && !land && vp.classList.contains('ctl-top'));
      // onde fica a imagem: no alto (centralizada), logo acima da linha de leitura, ou no canto (o texto abre espaco).
      // Deitado, o lugar e do layout deitado (Lay): coluna do canto
      vp.classList.toggle('cam-top', show && !full && settings.camPos === 'top' && !land);
      vp.classList.toggle('cam-above', show && !full && settings.camPos === 'line' && !land);
      vp.classList.toggle('recording', Rec.active());
      // tela cheia: filtros (varinha) e "Ver imagem" (olho); a varinha some gravando (o filtro e decidido antes)
      ['#pc-fx', '#pt-fx'].forEach(function (s) { var x = $(s); x.hidden = !full; x.classList.toggle('off', Rec.active()); });
      ['#pc-peek', '#pt-peek'].forEach(function (s) { $(s).hidden = !full || !Rec.stream; });
      var fd = full && !!settings.dimRead;
      if (fd !== Prompter.fullDim) { Prompter.fullDim = fd; Prompter.paintDone(true); }
      // a caixa do canto segue a proporcao da imagem ja girada
      var w = v.videoWidth || (land ? 16 : 9), h = v.videoHeight || (land ? 9 : 16);
      if (rot % 180) { var t = w; w = h; h = t; }
      vp.style.setProperty('--camratio', (w / h).toFixed(4));
      vp.style.setProperty('--camrot', rot + 'deg');
      $('#cam').classList.toggle('sideways', rot % 180 !== 0);
      $('#cam').classList.toggle('selfie', settings.camFacing === 'user');   // frontal: o canto mostra como espelho; o arquivo nao
      $('#cam').classList.toggle('live', !!Rec.stream);
      $('#cam').classList.toggle('fx-on', Fx.running);
      FxUI.sync();                      // gravando, os filtros travam (Ajustes > Imagem e a folha)
      var b = $('#pc-rec');
      b.hidden = !on;
      b.setAttribute('aria-pressed', String(Rec.active()));
      b.setAttribute('aria-label', Rec.active() ? 'Parar a gravação' : 'Gravar');
      $('#pc-rec-use').setAttribute('href', Rec.active() ? '#i-stop' : '#i-rec');
      $('#pc-stop').hidden = !Rec.active();
      $('#pc-last').hidden = !on || !Rec.last || Rec.active();
      $('#rec-badge').hidden = !Rec.active();
      Prompter.paintPlay();             // gravacao comecou ou parou: o que o play faz no fim do roteiro muda (v9.8)
      Rec.paintClock();
      Sound.paint();
      Lay.measure();
    }
  };
  $('#cam-video').addEventListener('loadedmetadata', function () { Rec.paint(); });
  // a imagem mudou de tamanho (o quadro girou com a tela): a caixa acompanha
  $('#cam-video').addEventListener('resize', function () { Rec.paint(); });

  /* ---- o som esta chegando? ----
     27/10: o receptor USB do microfone sem fio ficou ligado ao celular e entregou so um chiado
     digital em 5 de 9 videos. O transmissor parou de mandar som e nada avisou: o Android continuou
     vendo o microfone ligado. O medidor ouve a mesma faixa de audio que vai para o arquivo, 10 vezes
     por segundo, desde que a camera liga (da para ver o problema antes de gravar):
     - sem faixa de audio, faixa encerrada ou muda (outro app pegou o microfone): alarme na hora;
     - nada acima de -70 dBFS por 2 s: alarme. Medido nos arquivos (pico por janela de 43 ms, a
       mesma do medidor): os mudos de 27/10 ficam entre -83 e -80 dBFS; com o Hollyland mandando
       som, nem nas pausas da fala o pico desce de -54 dBFS (22/10 ao ar livre e 27/10);
     - gravando com o texto rolando e nada acima de -45 dBFS por 12 s: aviso de som baixo (voz
       nenhuma chegando). Pausado ou na contagem nao conta: ali o silencio e normal.
     Com a camera ligada, o aviso diz o tempo todo como esta o som: SOM OK (selo verde pequeno, com o
     medidor), SOM BAIXO (faixa ambar) ou SEM SOM (faixa vermelha, pisca). "SOM OK" so aparece depois
     que chegou som de verdade; antes disso o selo diz "OUVINDO…". Sem som, o selo do REC tambem acende
     e, gravando, o celular vibra uma vez. Onde o aviso fica: SndSpot (v9.7, fora da linha de leitura).
     Microfone que cai entre uma tomada e outra (receptor tirado e posto de volta): pede de novo. */
  var Sound = {
    ctx: null, an: null, src: null, buf: null, track: null, timer: 0,
    heard: false,       // ja chegou algum som desde que o microfone ligou
    peak: 0,            // pico do ultimo quadro (0..1)
    lastSignal: 0,      // ultima vez que chegou algum som (acima do silencio digital)
    lastVoice: 0,       // ultima vez que passou do nivel de voz (ou que o silencio era normal)
    state: 'off',       // off | ok | low | dead
    why: '',            // dead: none | ended | muted | silent
    healing: false,
    healAt: 0,
    DEAD: 3.16e-4,      // -70 dBFS
    VOICE: 0.0056,      // -45 dBFS
    DEAD_MS: 2000,
    LOW_MS: 12000,

    attach: function (stream) {
      Sound.detach();
      var tr = stream.getAudioTracks()[0] || null;
      Sound.track = tr;
      Sound.lastSignal = Sound.lastVoice = now();
      if (tr) {
        tr.addEventListener('ended', Sound.tick);
        tr.addEventListener('mute', Sound.tick);
        tr.addEventListener('unmute', Sound.tick);
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) safe(function () {
          var ctx = new Ctx();
          var src = ctx.createMediaStreamSource(new MediaStream([tr]));
          var an = ctx.createAnalyser();
          an.fftSize = 2048;
          src.connect(an);
          Sound.ctx = ctx; Sound.src = src; Sound.an = an;
          Sound.buf = new Float32Array(an.fftSize);
        });
        Sound.wake();
      }
      Sound.heard = !Sound.an;                                      // sem Web Audio nao da para ouvir: confia na faixa
      Sound.timer = setInterval(Sound.tick, 100);
      Sound.tick();
    },
    detach: function () {
      clearInterval(Sound.timer);
      Sound.timer = 0;
      var tr = Sound.track, ctx = Sound.ctx, src = Sound.src;
      if (tr) ['ended', 'mute', 'unmute'].forEach(function (k) { tr.removeEventListener(k, Sound.tick); });
      if (src) safe(function () { src.disconnect(); });
      if (ctx && ctx.close) safe(function () { return ctx.close(); });
      Sound.ctx = Sound.an = Sound.src = Sound.buf = Sound.track = null;
      Sound.peak = 0;
      Sound.heard = false;
      Sound.set('off', '');
    },
    wake: function () {
      var c = Sound.ctx;
      if (c && c.state === 'suspended' && c.resume) safe(function () { return c.resume(); });
    },
    // gravacao comecou: se ja nao chega som, vibra agora (a pessoa talvez nem olhe para a tela)
    started: function () {
      Sound.lastVoice = now();
      if (Sound.state === 'dead') Sound.buzz();
    },

    tick: function () {
      if (!Rec.stream) { Sound.set('off', ''); return; }
      var tr = Sound.track, t = now();
      if (!tr || tr.readyState === 'ended') { Sound.peak = 0; Sound.meter(); Sound.set('dead', tr ? 'ended' : 'none'); Sound.heal(); return; }
      if (tr.muted) { Sound.peak = 0; Sound.meter(); Sound.set('dead', 'muted'); return; }
      if (!Sound.an) { Sound.set('ok', ''); return; }               // sem Web Audio: so os eventos da faixa
      if (Sound.ctx.state !== 'running') {                          // medidor parado leria zeros: nao conta
        Sound.wake();
        Sound.lastSignal = Sound.lastVoice = t;
        return;
      }
      var b = Sound.buf, pk = 0;
      Sound.an.getFloatTimeDomainData(b);
      for (var i = 0; i < b.length; i++) { var v = b[i] < 0 ? -b[i] : b[i]; if (v > pk) pk = v; }
      Sound.peak = pk;
      if (pk > Sound.DEAD) {
        Sound.lastSignal = t;
        if (!Sound.heard) { Sound.heard = true; Sound.paint(); }    // "OUVINDO…" vira "SOM OK"
      }
      if (pk > Sound.VOICE || !(Rec.active() && Prompter.playing)) Sound.lastVoice = t;
      if (t - Sound.lastSignal > Sound.DEAD_MS) Sound.set('dead', 'silent');
      else if (t - Sound.lastVoice > Sound.LOW_MS) Sound.set('low', '');
      else Sound.set('ok', '');
      Sound.meter();
    },
    set: function (state, why) {
      if (state === Sound.state && why === Sound.why) return;
      var was = Sound.state;
      Sound.state = state;
      Sound.why = why;
      if (state === 'dead' && was !== 'dead' && Rec.active()) Sound.buzz();
      Sound.paint();
    },
    // vibra mesmo com a vibracao dos botoes desligada: o video ja esta saindo mudo
    buzz: function () { if (navigator.vibrate) safe(function () { navigator.vibrate([260, 120, 260]); }); },

    // microfone caido fora da gravacao: pede de novo (no maximo a cada 3 s)
    heal: function () {
      var stream = Rec.stream, gen = Rec.gen;
      if (!stream || Rec.active() || Sound.healing || now() < Sound.healAt) return;
      Sound.healing = true;
      Sound.healAt = now() + 3000;
      navigator.mediaDevices.getUserMedia({ audio: Rec.audio() }).then(function (s) {
        Sound.healing = false;
        var tr = s.getAudioTracks()[0];
        if (!tr || gen !== Rec.gen || Rec.stream !== stream || Rec.active()) { s.getTracks().forEach(function (x) { x.stop(); }); return; }
        stream.getAudioTracks().forEach(function (old) { stream.removeTrack(old); safe(function () { old.stop(); }); });
        stream.addTrack(tr);
        Sound.attach(stream);
      }, function () { Sound.healing = false; });
    },

    paint: function () {
      var on = !!Rec.stream && Prompter.isOpen(), rec = Rec.active();
      // camera desligada por ociosidade: a mesma faixa avisa, calma (nao e alarme)
      var st = on ? Sound.state : Rec.napped && Prompter.isOpen() ? 'nap' : 'off';
      if (st === 'ok' && !Sound.heard) st = 'wait';                  // nao diz "SOM OK" antes de ouvir algo
      var box = $('#snd-alert');
      box.hidden = st === 'off';
      box.dataset.st = st;
      if (st !== 'off') {
        var title, sub = '';
        if (st === 'nap') {
          title = 'CÂMERA DESLIGADA';
          sub = 'Para o celular descansar. ' + cue('Pise para ligar a câmera.', 'Toque na tela para ligar a câmera.');
        }
        else if (st === 'wait') title = 'OUVINDO…';
        else if (st === 'ok') title = 'SOM OK';
        else if (st === 'low') { title = 'SOM BAIXO'; sub = 'Não estou ouvindo a voz. O microfone está ligado e perto?'; }
        else {
          title = 'SEM SOM';
          sub = (rec ? 'O vídeo está saindo mudo. ' : '') + (Sound.why === 'muted' ? 'Outro app está usando o microfone. Feche-o.'
            : Sound.why === 'ended' || Sound.why === 'none' ? 'O microfone desligou. Ligue de novo: o app volta a ouvir sozinho.'
            : 'Confira o transmissor: ligado, com bateria, sem mudo e perto do celular.');
        }
        $('#snd-title').textContent = title;
        $('#snd-sub').textContent = sub;
        $('#snd-icon').setAttribute('href', st === 'dead' ? '#i-mic-off' : st === 'nap' ? '#i-camera' : '#i-mic');
      }
      var b = $('#rec-badge');
      b.classList.toggle('nosound', st === 'dead');
      b.classList.toggle('lowsound', st === 'low');
      $('#rec-label').textContent = st === 'dead' ? 'SEM SOM' : 'REC';
      SndSpot.place();                                              // o tamanho mudou com o estado: procura o lugar
    },
    // barrinhas no selo do REC e na faixa: o som chegando (de -60 a 0 dBFS)
    meter: function () {
      var db = Sound.peak > 0 ? 20 * Math.log(Sound.peak) / Math.LN10 : -100;
      var s = 'scaleX(' + clamp((db + 60) / 60, 0, 1).toFixed(3) + ')';
      $('#rec-vu').style.transform = s;
      $('#snd-vu').style.transform = s;
    }
  };

  /* ---- onde fica o aviso do som com o celular em pe (v9.7) ----
     03/11: "O alerta de som esta muito grande e atrapalhando quem tem celular menor". So a apresentacao
     muda; a medicao (Sound) e a mesma. O aviso nunca fica por cima do texto perto da linha de leitura (a
     linha, a de antes e a de depois, na coluna do texto), dos controles a vista nem do selo REC.
     - SOM OK e OUVINDO…: selo pequeno colado na imagem da camera (ao lado dela, se esta no alto; embaixo
       dela, se esta no canto). Sem imagem, no primeiro espaco livre do alto.
     - SOM BAIXO, SEM SOM e CAMERA DESLIGADA: faixa na largura da tela, no espaco livre. Linha embaixo
       (camera da frente): logo acima do texto ja lido. Linha no alto (traseira): no pe da tela. Pode cobrir
       a imagem da camera, nunca o texto. Sem espaco na largura (celular pequeno com os controles a vista):
       na coluna da imagem, estreita; sem espaco nem assim, so o titulo (o selo REC tambem avisa).
     O lugar e refeito quando muda o estado do som, os controles aparecem ou somem, a gravacao comeca ou
     para, a tela gira ou o texto muda de tamanho. Deitado, o lugar e o do layout deitado (CSS). */
  var SndSpot = {
    M: 6,              // folga entre o aviso e o que ele nao pode cobrir
    probe: null,
    // areas seguras da tela (furo da camera, barra de gestos) em px
    safe: function () {
      var p = SndSpot.probe;
      if (!p) {
        p = SndSpot.probe = document.createElement('div');
        p.setAttribute('aria-hidden', 'true');
        p.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l)';
        VIEWS.prompter.appendChild(p);
      }
      var cs = getComputedStyle(p);
      return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    },
    rect: function (n) {
      if (!n || n.hidden || !n.getClientRects().length) return null;
      var r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
    },
    reset: function (box) {
      box.classList.remove('placed', 'narrow', 'tight');
      box.style.left = box.style.top = box.style.width = box.style.maxWidth = '';
    },
    // tamanho do aviso numa faixa de largura lw (o texto quebra conforme a largura)
    size: function (box, small, lw, narrow, tight) {
      box.classList.add('placed');
      box.classList.toggle('narrow', narrow);
      box.classList.toggle('tight', tight);
      box.style.left = box.style.top = '0px';
      box.style.maxWidth = lw + 'px';
      box.style.width = small ? '' : Math.min(lw, 560) + 'px';
      var t = $('#snd-title');
      return { w: box.offsetWidth, h: box.offsetHeight, ok: t.scrollWidth <= t.clientWidth + 1 && box.offsetWidth <= lw + 1 };
    },
    // trechos livres na altura de uma faixa vertical [l, r]
    gaps: function (lane, obs, top, bottom) {
      var M = SndSpot.M, out = [], y = top;
      obs.filter(function (o) { return o.r > lane.l + 1 && o.l < lane.r - 1 && o.b + M > top && o.t - M < bottom; })
        .map(function (o) { return [o.t - M, o.b + M]; })
        .sort(function (a, b) { return a[0] - b[0]; })
        .forEach(function (s) { if (s[0] > y) out.push([y, s[0]]); y = Math.max(y, s[1]); });
      if (bottom > y) out.push([y, bottom]);
      return out;
    },
    hit: function (a, o) {
      var w = Math.min(a.r, o.r) - Math.max(a.l, o.l), h = Math.min(a.b, o.b) - Math.max(a.t, o.t);
      return w > 0.5 && h > 0.5 ? w * h : 0;
    },
    /* v10.0, tela cheia em pe: o selo REC fica a vista a gravacao toda, encostado na direita, no primeiro lugar
       livre: abaixo da barra do topo; abaixo do painel, se o painel fica no alto (camera da frente); senao abaixo
       ou acima do texto da linha de leitura. Nunca por cima da linha, do texto em volta dela, dos botoes ou do
       painel (mesmo escondido: o selo nao pula quando os controles somem). Fora disso o lugar e o do CSS. */
    badge: function (on) {
      var b = $('#rec-badge');
      if (!on || b.hidden) {
        if (b.classList.contains('placed')) { b.classList.toggle('placed', false); b.style.left = b.style.top = ''; }
        return;
      }
      var V = VIEWS.prompter.getBoundingClientRect(), S = SndSpot.safe(), M = SndSpot.M;
      if (!V.width || !V.height) return;
      b.classList.toggle('placed', true);
      var w = b.offsetWidth, h = b.offsetHeight;
      var top = V.top + 8 + S.t, bottom = V.bottom - 8 - S.b, x = V.right - 12 - S.r - w;
      var box = function (n) { return n && !n.hidden && n.getClientRects().length ? n.getBoundingClientRect() : null; };
      var g = box($('#guide')), c = box($('#content')), lb = Prompter.lineBox || 0, obs = [], ys = [];
      if (g) {
        obs.push({ l: g.left, r: g.right, t: g.top, b: g.bottom });
        obs.push({ l: c ? c.left : g.left, r: c ? c.right : g.right, t: g.top - lb, b: g.bottom + lb });
      }
      var bar = 0, dock = null;
      Array.prototype.forEach.call(document.querySelectorAll('#p-top > *'), function (n) {
        var r = box(n); if (r) { obs.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); bar = Math.max(bar, r.bottom); }
      });
      ['#speed', '#transport', '#scrub'].forEach(function (sel) {
        var r = box($(sel)); if (!r) return;
        obs.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
        dock = dock ? { t: Math.min(dock.t, r.top), b: Math.max(dock.b, r.bottom) } : { t: r.top, b: r.bottom };
      });
      ys.push(bar ? bar + M : top);
      if (dock) ys.push(dock.b + M);
      if (g) ys.push(g.bottom + lb + M, g.top - lb - M - h);
      if (dock) ys.push(dock.t - M - h);
      var y = null;
      for (var i = 0; i < ys.length && y === null; i++) {
        var t = ys[i];
        if (t < top - 0.5 || t + h > bottom + 0.5) continue;
        var a = { l: x, r: x + w, t: t, b: t + h };
        if (!obs.some(function (o) { return SndSpot.hit(a, o) > 0; })) y = t;
      }
      if (y === null) y = clamp(ys[0], top, Math.max(top, bottom - h));
      b.style.left = Math.round(x - V.left) + 'px';
      b.style.top = Math.round(y - V.top) + 'px';
    },
    place: function () {
      var box = $('#snd-alert'), app = $('#app'), vp = VIEWS.prompter;
      var land = app.classList.contains('tp-lf') || app.classList.contains('tp-lr'), full = vp.classList.contains('cam-full');
      SndSpot.badge(Prompter.isOpen() && full && !land);
      if (box.hidden || !Prompter.isOpen() || land) {
        SndSpot.reset(box);
        // deitado: o lugar e do CSS; se a explicacao nao couber no espaco, fica so o titulo (nada cortado)
        if (!box.hidden && box.scrollHeight > box.clientHeight + 1) box.classList.add('tight');
        return;
      }
      var st = box.dataset.st, small = st === 'ok' || st === 'wait', R = SndSpot.rect;
      var V = vp.getBoundingClientRect(), S = SndSpot.safe();
      if (!V.width || !V.height) return;
      var top = V.top + 8 + S.t, bottom = V.bottom - 8 - S.b, left = V.left + 8 + S.l, right = V.right - 8 - S.r;
      // tela cheia (v10.0): a imagem e o fundo, nao um obstaculo
      var g = R($('#guide')), c = R($('#content')), cam = full ? null : R($('#cam')), lb = Prompter.lineBox || 0;
      var hard = [], zt = top, zb = top;
      if (g) {
        zt = g.t - lb; zb = g.b + lb;
        hard.push({ l: g.l, r: g.r, t: g.t, b: g.b, k: 10 });                                   // a linha de leitura
        hard.push({ l: c ? c.l : g.l, r: c ? c.r : g.r, t: zt, b: zb, k: 10 });                 // o texto em volta dela
      }
      if (!Prompter.uiHidden()) {
        Array.prototype.forEach.call(document.querySelectorAll('#p-top > *, #speed, #transport, #scrub'), function (n) { var r = R(n); if (r) hard.push(r); });
      }
      ['#rec-badge', '#pause-pill', '#voice-flag'].forEach(function (s) { var r = R($(s)); if (r) hard.push(r); });
      // o selo nao cobre a imagem da camera; a faixa de alerta pode cobrir (o texto, nunca)
      var obs = small && cam ? hard.concat([cam]) : hard;
      var centered = vp.classList.contains('cam-top') || vp.classList.contains('cam-above');
      var lanes = [{ k: 'full', l: left, r: right }];
      // imagem no canto: a coluna dela (col) e, mais larga, do fim do texto ate a borda (col2, abaixo da linha)
      if (cam && centered) lanes.push({ k: 'side', l: left, r: cam.l - 4, end: true }, { k: 'side2', l: cam.r + 4, r: right });
      else if (cam && g && cam.l >= g.r - 1) {
        lanes.push({ k: 'col', l: Math.max(cam.l - 4, g.r + 4), r: right, end: true });
        if (c) lanes.push({ k: 'col2', l: c.r + SndSpot.M, r: right, end: true });
      } else if (cam && g && cam.r <= g.l + 1) {
        lanes.push({ k: 'col', l: left, r: Math.min(cam.r + 4, g.l - 4) });
        if (c) lanes.push({ k: 'col2', l: left, r: c.l - SndSpot.M });
      }
      var H = V.height, lineLow = g ? (g.t + g.b) / 2 > V.top + H / 2 : false;
      var home = !cam ? top : centered ? cam.t : cam.b + SndSpot.M;
      var lanePref = small ? { side: 0, col: 0, col2: 1, side2: 4, full: cam ? 12 : 0 } : { full: 0, col: 15, col2: 16, side: 25, side2: 26 };
      var pref = function (k, y, h) {
        var p = lanePref[k];
        if (small) return p + Math.abs(y - home) / H * 10;
        var b = y + h, above = b <= zt + 1, below = y >= zb - 1;
        if (lineLow) return p + (above ? (zt - b) / H * 10 : below ? 10 + (bottom - b) / H * 10 : 6);
        return p + (below ? (bottom - b) / H * 10 : above ? 10 + (zt - b) / H * 10 : 6);
      };
      var best = null, tries = small ? [false] : [false, true];
      for (var i = 0; i < tries.length && !best; i++) {
        lanes.forEach(function (ln) {
          var lw = ln.r - ln.l;
          if (lw < 60) return;
          var sz = SndSpot.size(box, small, lw, !small && lw < 240, tries[i]);
          if (!sz.ok) return;
          var x = small ? (ln.end ? ln.r - sz.w : ln.l) : ln.l + (lw - sz.w) / 2;
          SndSpot.gaps(ln, obs, top, bottom).forEach(function (gp) {
            if (gp[1] - gp[0] < sz.h) return;
            var ys = [gp[0], gp[1] - sz.h];
            if (small) ys.push(clamp(home, gp[0], gp[1] - sz.h));
            ys.forEach(function (y) {
              var p = pref(ln.k, y, sz.h);
              if (!best || p < best.p) best = { p: p, x: x, y: y, lw: lw, narrow: !small && lw < 240, tight: tries[i] };
            });
          });
        });
      }
      if (!best) {
        // nenhum espaco livre de verdade: o lugar que menos cobre (o texto da linha pesa mais)
        lanes.forEach(function (ln) {
          var lw = ln.r - ln.l;
          if (lw < 60) return;
          var narrow = !small && lw < 240, sz = SndSpot.size(box, small, lw, narrow, !small);
          var x = small ? (ln.end ? ln.r - sz.w : ln.l) : ln.l + (lw - sz.w) / 2;
          var ys = [top, bottom - sz.h];
          SndSpot.gaps(ln, obs, top, bottom).forEach(function (gp) { ys.push(gp[0], gp[1] - sz.h); });
          ys.forEach(function (y) {
            y = clamp(y, top, Math.max(top, bottom - sz.h));
            var a = { l: x, r: x + sz.w, t: y, b: y + sz.h }, p = 0;
            obs.forEach(function (o) { p += SndSpot.hit(a, o) * (o.k || 1); });
            p += pref(ln.k, y, sz.h);
            if (!best || p < best.p) best = { p: p, x: x, y: y, lw: lw, narrow: narrow, tight: !small };
          });
        });
      }
      if (!best) { SndSpot.reset(box); return; }
      SndSpot.size(box, small, best.lw, best.narrow, best.tight);
      box.style.left = Math.round(best.x - V.left) + 'px';
      box.style.top = Math.round(best.y - V.top) + 'px';
    }
  };
  // controles que aparecem ou somem, selo REC, selo de pausa, imagem, tela deitada: o aviso procura o lugar de novo
  (function () {
    var mo = new MutationObserver(function () { if (Prompter.isOpen()) SndSpot.place(); });
    mo.observe(VIEWS.prompter, { attributes: true, attributeFilter: ['class'] });
    mo.observe($('#app'), { attributes: true, attributeFilter: ['class'] });
    ['#rec-badge', '#pause-pill', '#voice-flag', '#cam'].forEach(function (s) { mo.observe($(s), { attributes: true, attributeFilter: ['hidden', 'class'] }); });
  })();

  /* ---- ver a ultima gravacao: confere a tomada ali mesmo, sem sair do app ----
     Com o player aberto, o pedal da direita toca e pausa o video e o da esquerda fecha:
     nenhuma pisada comeca uma gravacao nova por engano. */
  var Player = {
    isOpen: function () { return !$('#player').hidden; },
    open: function () {
      if (!Rec.last || Rec.active()) return;
      Prompter.pause(true);
      var v = $('#player-video');
      v.src = Rec.last.url;
      $('#player-name').textContent = Rec.last.name;
      $('#player').hidden = false;
      safe(function () { return v.play(); });
    },
    close: function () {
      var v = $('#player-video');
      safe(function () { v.pause(); });
      v.removeAttribute('src');
      safe(function () { v.load(); });
      $('#player').hidden = true;
      Prompter.showUI();
      Rec.poke();
    },
    toggle: function () {
      var v = $('#player-video');
      if (v.paused) safe(function () { return v.play(); }); else v.pause();
    }
  };
  $('#btn-player-close').addEventListener('click', Player.close);

  /* ---- pasta PROMPTER na Galeria (v9.5) ----
     O video ia so para a pasta Download. Agora vai para a pasta PROMPTER, escolhida uma vez no seletor
     do Android (dentro de Movies ou DCIM, que a Galeria mostra; o app cria a PROMPTER). O endereco da
     pasta fica no IndexedDB. Sem suporte, seletor cancelado, licenca negada ou erro ao gravar: o video
     vai para a pasta Download como antes (nunca se perde) e um aviso diz onde ficou. Nos aparelhos da
     Robertha (localhost) a pasta nao entra: Download como sempre. */
  var Folder = {
    NAME: 'PROMPTER',
    handle: null,       // pasta PROMPTER escolhida
    perm: '',           // licenca de escrita: granted | prompt | denied ('' = ainda nao conferida)
    asked: false,       // licenca ja pedida nesta abertura (pede no maximo uma vez)
    warned: false,      // aviso de "ficou na Download" ja dado nesta abertura
    pendingWarn: '',    // aviso esperando a gravacao acabar
    dbp: null,

    supported: function () { return !LOCALHOST && typeof window.showDirectoryPicker === 'function'; },
    active: function () { return !LOCALHOST && !!Folder.handle; },

    db: function () {
      if (Folder.dbp) return Folder.dbp;
      Folder.dbp = new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('sem IndexedDB')); return; }
        var r = indexedDB.open('tp-pasta', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () {
          var db = r.result;
          db.onversionchange = function () { db.close(); Folder.dbp = null; };   // versao nova do app em outra aba
          res(db);
        };
        r.onerror = function () { rej(r.error); };
      });
      Folder.dbp.catch(function () { Folder.dbp = null; });
      return Folder.dbp;
    },
    kv: function (mode, fn) {
      return Folder.db().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('kv', mode), box = {};
          fn(t.objectStore('kv'), box);
          t.oncomplete = function () { res(box.v); };
          t.onerror = t.onabort = function () { rej(t.error); };
        });
      });
    },
    // endereco guardado: so vale se ainda for uma pasta de verdade
    load: function () {
      if (LOCALHOST) return Promise.resolve(null);
      return Folder.kv('readonly', function (s, box) { s.get('dir').onsuccess = function (e) { box.v = e.target.result; }; })
        .then(function (h) {
          if (h && typeof h.getFileHandle === 'function' && !Folder.handle) { Folder.handle = h; Folder.check(); }
          Folder.paint();
          return Folder.handle;
        }, function () { return null; });
    },
    store: function (h) {
      return Folder.kv('readwrite', function (s) { s.put(h, 'dir'); }).catch(function () { /* fica so nesta abertura */ });
    },

    /* escolha no seletor do sistema. Precisa do toque: chamar antes de qualquer espera. Escolhida a
       propria PROMPTER, usa ela; senao cria a PROMPTER dentro da escolhida. Cancelou: fica a de antes. */
    choose: function () {
      if (!Folder.supported()) return Promise.resolve(Folder.handle);
      var p;
      try { p = window.showDirectoryPicker({ id: 'prompter', mode: 'readwrite', startIn: 'videos' }); } catch (e) { p = Promise.reject(e); }
      return Promise.resolve(p).then(function (dir) {
        return /^prompter$/i.test(dir.name || '') ? dir : dir.getDirectoryHandle(Folder.NAME, { create: true });
      }).then(function (h) {
        Folder.handle = h;
        Folder.perm = 'granted';
        Folder.warned = false;
        Folder.store(h);
        Folder.paint();
        return h;
      }, function (e) {
        if (!(e && e.name === 'AbortError')) Toast.show('Não deu para usar essa pasta. Em Ajustes > Pasta dos vídeos, escolha Movies ou DCIM.', null, null, 9000);
        else if (!Folder.handle) Toast.show('Sem pasta escolhida, os vídeos ficam na pasta Download. Para escolher depois: Ajustes > Pasta dos vídeos.', null, null, 9000);
        return Folder.handle;
      });
    },

    // licenca de escrita, sem pedir nada: ao carregar, ao abrir o prompter, antes de gravar e ao salvar
    check: function () {
      var h = Folder.handle;
      if (!h) return Promise.resolve('');
      if (typeof h.queryPermission !== 'function') { Folder.perm = 'granted'; return Promise.resolve('granted'); }
      return Promise.resolve(h.queryPermission({ mode: 'readwrite' })).then(function (p) {
        if (Folder.handle === h) Folder.perm = p;
        return p;
      }, function () { return Folder.perm; });
    },
    /* No toque que comeca a gravacao (um gesto): sem licenca, pede agora e NAO grava neste toque, para
       o aviso do Android nao cobrir o texto com a gravacao rodando. No maximo uma vez por abertura;
       recusou ou falhou, grava assim mesmo na Download. Devolve true se este toque foi usado para pedir. */
    ask: function () {
      var h = Folder.handle;
      Folder.check();                   // confere de novo para o proximo toque, sem esperar
      if (!Folder.active() || Folder.asked || Folder.perm !== 'prompt' || typeof h.requestPermission !== 'function') return false;
      Folder.asked = true;
      Prompter.flash('i-film', 'Libere a pasta PROMPTER', true);
      Promise.resolve().then(function () { return h.requestPermission({ mode: 'readwrite' }); }).then(function (p) {
        Folder.perm = p;
        if (p === 'granted') Prompter.flash('i-check', cue('Pasta liberada: pise para gravar', 'Pasta liberada: toque para gravar'));
        else Folder.warn('antes');
      }, function () { Folder.perm = 'denied'; Folder.warn('antes'); });
      return true;
    },

    // guarda o video no celular: pasta PROMPTER, ou Download se nao der. Nunca falha.
    keep: function (blob, url, name) {
      var done = function (where) { if (Folder.pendingWarn) Folder.warn(Folder.pendingWarn); return where; };
      if (!Folder.active()) { Rec.download(url, name); return Promise.resolve(done('download')); }
      return Folder.write(blob, name).then(function () { return done('pasta'); }, function () {
        Rec.download(url, name);
        Folder.warn('depois');
        return done('download');
      });
    },
    write: function (blob, name) {
      var h = Folder.handle;
      return Folder.check().then(function (p) {
        if (p !== 'granted') throw new Error('sem licença');
        return h.getFileHandle(name, { create: true });
      }).then(function (fh) { return fh.createWritable(); }).then(function (w) {
        return w.write(blob).then(function () { return w.close(); }, function (e) { safe(function () { return w.abort(); }); throw e; });
      });
    },
    // uma vez por abertura: onde o video ficou e como voltar a usar a pasta (gravando, espera acabar)
    warn: function (when) {
      if (Folder.warned) return;
      if (Rec.active()) { Folder.pendingWarn = when; return; }
      Folder.warned = true;
      Folder.pendingWarn = '';
      Toast.show(when === 'antes'
        ? 'Sem licença para a pasta PROMPTER: os vídeos vão para a pasta Download. Para trocar: Ajustes > Pasta dos vídeos.'
        : 'O vídeo ficou na pasta Download do celular. Para voltar a usar a pasta PROMPTER: Ajustes > Pasta dos vídeos.', null, null, 9000);
    },

    // Ajustes > Gravacao: "Pasta dos vídeos: PROMPTER  [Trocar]" (ou Download)
    paint: function () {
      var row = $('#s-folder');
      if (!row) return;
      var on = Folder.active(), can = Folder.supported();
      row.hidden = LOCALHOST;
      $('#s-folder-hint').hidden = LOCALHOST;
      $('#s-folder-name').textContent = on ? Folder.NAME : 'Download';
      $('#btn-folder').hidden = !can;
      $('#btn-folder').textContent = on ? 'Trocar' : 'Escolher';
      $('#s-folder-hint').textContent = can
        ? 'Escolha a pasta Movies ou DCIM, que a Galeria mostra. O app cria a pasta PROMPTER dentro dela.'
        : 'Este celular não deixa o app escolher a pasta: os vídeos ficam na pasta Download.';
    }
  };
  $('#btn-folder').addEventListener('click', function () {
    // o seletor do Android sai do app: no meio de uma gravacao a camera pararia
    if (Rec.active()) { Toast.show('Pare a gravação antes de trocar a pasta.'); return; }
    Folder.choose().then(function (h) { if (h) Toast.show('Pronto: os vídeos vão para a pasta PROMPTER.'); });
  });

  /* ---- onde guardar os videos (v9.5): pergunta uma vez, antes da primeira gravacao ----
     Depois de escolher camera da frente ou traseira, nunca no meio de uma gravacao (o login do Google
     sai da pagina e o video em andamento se perderia). Nao pergunta nos aparelhos da Robertha. */
  var SaveAsk = {
    id: null,
    needed: function () { return !LOCALHOST && !settings.saveAsked; },
    isShown: function () { return !$('#save-ask').hidden; },
    show: function (id) {
      SaveAsk.id = id;
      var can = Folder.supported();
      $('#save-ask-text').textContent = 'Todo vídeo fica salvo no seu celular, na pasta ' + (can ? 'PROMPTER da Galeria' : 'Download') + '. Quer que ele suba também para o seu Google Drive?';
      $('#save-ask-tip').hidden = !can;
      $('#save-ask').hidden = false;
    },
    answer: function (drive) {
      var picked = Folder.choose();     // primeiro: o seletor de pasta precisa deste toque
      var id = SaveAsk.id;
      $('#save-ask').hidden = true;
      settings.saveAsked = true;
      settings.driveUpload = drive;
      saveSettings();
      Settings.syncControls();
      if (!drive) Up.clear().catch(function () { /* sem IndexedDB: nada na fila */ });
      picked.then(function () {
        if (!findScript(id)) return;
        // sim: entra no Google agora (antes de gravar); a volta abre o roteiro
        if (drive && !GDocs.canWrite() && navigator.onLine) { GDocs.login({ do: 'present', id: id }); return; }
        if (drive && Up.refreshBeforeRecording({ do: 'present', id: id })) return;
        Prompter.open(id);
      });
    }
  };
  $('#btn-save-local').addEventListener('click', function () { SaveAsk.answer(false); });
  $('#btn-save-drive').addEventListener('click', function () { SaveAsk.answer(true); });

  /* ---- escolha do modo ao abrir um roteiro ----
     v9.6: "Celular: Em pé | Deitado" no topo da caixa (fica lembrado em settings.phone). Deitado,
     os cartoes da frente e da traseira viram os modos front-h e rear-h (video horizontal). */
  var MODE_TEXT = {
    front: { portrait: 'Lê na tela do celular, que fica de cabeça para baixo. Para gravar sozinha.',
      landscape: 'Celular deitado, vídeo horizontal. Lê na tela, perto da lente.' },
    rear: { portrait: 'Imagem melhor. Celular em pé, tela virada para quem opera.',
      landscape: 'Imagem melhor. Celular deitado, vídeo horizontal, tela virada para quem opera.' }
  };
  var Modes = {
    id: null,
    apply: function (mode) {
      if (!MODE_PRESETS[mode]) return;
      settings.mode = mode;
      Object.assign(settings, MODE_PRESETS[mode], (settings.modes || {})[mode] || {});
      saveSettings();
      safe(Settings.applyToPrompter);
      Settings.syncControls();
    },
    phone: function () { return settings.phone === 'landscape' ? 'landscape' : 'portrait'; },
    // cartao + posicao do celular = modo de verdade ("so ler" nao muda)
    resolve: function (card) { return card !== 'plain' && Modes.phone() === 'landscape' ? card + '-h' : card; },
    paint: function () {
      var ph = Modes.phone();
      Array.prototype.forEach.call(document.querySelectorAll('#mode-orient [data-orient]'), function (b) {
        b.setAttribute('aria-checked', String(b.dataset.orient === ph));
      });
      Array.prototype.forEach.call(document.querySelectorAll('#mode-picker [data-mode]'), function (b) {
        var m = b.dataset.mode;
        b.classList.toggle('last', Modes.resolve(m) === settings.mode);
        if (MODE_TEXT[m]) b.querySelector('small').textContent = MODE_TEXT[m][ph];
      });
    },
    setPhone: function (ph) {
      if (ph !== 'landscape' && ph !== 'portrait') return;
      settings.phone = ph;
      saveSettings();
      Modes.paint();
      haptic(6);
    },
    pick: function (id) {
      Modes.id = id;
      Modes.paint();
      $('#mode-picker').hidden = false;
    },
    close: function () { $('#mode-picker').hidden = true; },
    choose: function (card) {
      var mode = Modes.resolve(card);
      Modes.close();
      Modes.apply(mode);
      // primeira gravacao (fora dos aparelhos da Robertha): pergunta onde guardar os videos
      if (settings.record && SaveAsk.needed()) { SaveAsk.show(Modes.id); return; }
      // vai gravar: renova o login do Google agora se faltar pouco (no meio da gravacao nao da)
      if (settings.record && Up.refreshBeforeRecording({ do: 'present', id: Modes.id })) return;
      Prompter.open(Modes.id);
    }
  };
  $('#mode-picker').addEventListener('click', function (ev) {
    var o = ev.target.closest('[data-orient]');
    if (o) { Modes.setPhone(o.dataset.orient); return; }
    var b = ev.target.closest('[data-mode]');
    if (b) { Modes.choose(b.dataset.mode); return; }
    if (ev.target === this) Modes.close();
  });
  $('#btn-mode-cancel').addEventListener('click', Modes.close);

  /* ---- camera da frente: "deixe o celular de cabeca para baixo" ----
     A lente fica embaixo, colada no texto. O acelerometro diz quando o celular virou: o aviso
     some sozinho e a tela inverte (para quem esta na frente, fica em pe). Se o celular ja estiver
     virado ao abrir, o aviso nem aparece. Sem sensor, o botao "Já está" faz o mesmo. */
  var Flip = {
    on: false,
    since: 0,
    decideTimer: 0,
    needed: function () { return Prompter.isOpen() && settings.mode === 'front' && !!settings.record && settings.recScreen === 'portrait-secondary'; },
    isShown: function () { return !$('#flipwarn').hidden; },
    start: function () {
      Flip.stop();
      if (!Flip.needed()) return;
      Flip.on = true;
      Flip.since = 0;
      window.addEventListener('devicemotion', Flip.motion);
      Flip.decideTimer = setTimeout(Flip.show, 700);     // espera a primeira leitura do sensor
    },
    show: function () {
      if (!Flip.on) return;
      $('#flipwarn').hidden = false;
      // enquanto o celular esta em pe, o aviso fica legivel (tela normal)
      if (screen.orientation && screen.orientation.lock) safe(function () { return screen.orientation.lock('portrait-primary'); });
    },
    motion: function (ev) {
      var g = ev.accelerationIncludingGravity;
      if (!g || g.y == null) return;
      if (g.y < -5) {                                    // de cabeca para baixo (a gravidade aponta para o topo do aparelho)
        if (!Flip.since) Flip.since = now();
        if (now() - Flip.since > 350) Flip.done();
      } else Flip.since = 0;
    },
    done: function () {
      var was = Flip.isShown();
      Flip.stop();
      Rec.lockScreen();
      if (was) Prompter.flash('i-check', 'Pronto');
    },
    stop: function () {
      Flip.on = false;
      clearTimeout(Flip.decideTimer);
      window.removeEventListener('devicemotion', Flip.motion);
      $('#flipwarn').hidden = true;
    }
  };
  $('#btn-flip-ok').addEventListener('click', function (ev) { ev.stopPropagation(); Flip.done(); });

  /* ---- celular deitado (v9.6): "Deite o celular" e o lado da lente ----
     Modos front-h e rear-h, video horizontal. Abrindo com o celular em pe, o aviso pede para deitar
     e some sozinho pelo acelerometro (a gravidade passa para o eixo x do aparelho); sem sensor, o
     botao "Já está". Se a tela ja estiver deitada ao abrir, o aviso nem aparece.
     Lado da lente da frente pelo screen.orientation.type: landscape-primary = topo do aparelho a
     esquerda = lente a esquerda (a maioria dos Android); landscape-secondary = lente a direita.
     Layout (classes em #app, porque o aviso/toast fica fora do prompter):
     - tp-lf (frente deitada) + tp-lens-l/r: o texto numa coluna encostada no lado da lente, a linha
       de leitura perto do meio da altura (onde a lente esta); imagem, controles e avisos no lado oposto.
     - tp-lr (traseira deitada): texto na largura toda, imagem e som numa coluna no canto, controles embaixo.
     Com a tela ainda em pe nada disso entra: fica o layout em pe de sempre. */
  var Lay = {
    on: false,
    since: 0,
    decideTimer: 0,
    needed: function () { return Prompter.isOpen() && landMode() && !!settings.record; },
    isShown: function () { return !$('#laywarn').hidden; },
    type: function () { var o = screen.orientation; return o && typeof o.type === 'string' ? o.type : ''; },
    // a tela esta deitada?
    flat: function () {
      var t = Lay.type();
      return t ? /^landscape/.test(t) : window.innerWidth > window.innerHeight;
    },
    // lado da lente da frente: 'l' (landscape-primary) ou 'r' (landscape-secondary)
    side: function () {
      var t = Lay.type();
      if (t) return t === 'landscape-secondary' ? 'r' : 'l';
      return window.orientation === -90 || window.orientation === 270 ? 'r' : 'l';
    },
    start: function () {
      Lay.stop();
      if (!Lay.needed() || Lay.flat()) return;
      Lay.on = true;
      Lay.since = 0;
      window.addEventListener('devicemotion', Lay.motion);
      Lay.decideTimer = setTimeout(Lay.show, 700);     // espera a primeira leitura do sensor
    },
    show: function () {
      if (!Lay.on) return;
      $('#laywarn').hidden = false;
      // a tela segue o sensor enquanto o aviso esta na tela: deitando, o sistema pode girar sozinho (Lay.check)
      if (screen.orientation && screen.orientation.unlock) safe(function () { screen.orientation.unlock(); });
    },
    motion: function (ev) {
      var g = ev.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      if (Math.abs(g.x) > 6 && Math.abs(g.x) > Math.abs(g.y || 0)) {   // deitado: a gravidade no eixo x do aparelho
        if (!Lay.since) Lay.since = now();
        if (now() - Lay.since > 350) Lay.done();
      } else Lay.since = 0;
    },
    // a tela deitou (o sistema girou com o aviso na tela): o aviso sai
    check: function () { if (Lay.on && Lay.flat()) Lay.done(); },
    done: function () {
      var was = Lay.isShown();
      Lay.stop();
      Rec.lockScreen();
      Lay.paint();
      if (was) Prompter.flash('i-check', 'Pronto');
    },
    stop: function () {
      Lay.on = false;
      clearTimeout(Lay.decideTimer);
      window.removeEventListener('devicemotion', Lay.motion);
      $('#laywarn').hidden = true;
    },
    paint: function () {
      var app = $('#app');
      var land = Prompter.isOpen() && landMode() && Lay.flat();
      var front = land && settings.camFacing === 'user';
      var r = front && Lay.side() === 'r';
      app.classList.toggle('tp-lf', front);
      app.classList.toggle('tp-lr', land && !front);
      app.classList.toggle('tp-lens-l', front && !r);
      app.classList.toggle('tp-lens-r', r);
      Lay.measure();
    },
    // altura do painel de controles e largura da imagem: o aviso (toast) fica acima do painel, fora da imagem
    measure: function () {
      var app = $('#app');
      if (!app.classList.contains('tp-lf') && !app.classList.contains('tp-lr')) {
        app.style.removeProperty('--dockh');
        app.style.removeProperty('--camw');
        return;
      }
      app.style.setProperty('--dockh', $('#dock').offsetHeight + 'px');
      // tela cheia (v10.0): a imagem nao ocupa coluna (o lugar do aviso e do CSS)
      app.style.setProperty('--camw', ($('#cam').hidden || VIEWS.prompter.classList.contains('cam-full') ? 0 : $('#cam').offsetWidth) + 'px');
    },
    clear: function () {
      ['tp-lf', 'tp-lr', 'tp-lens-l', 'tp-lens-r', 'tp-full', 'tp-fctl'].forEach(function (c) { $('#app').classList.remove(c); });
      Lay.measure();
    }
  };
  $('#btn-lay-ok').addEventListener('click', function (ev) { ev.stopPropagation(); Lay.done(); });
  // a tela girou (deitada para o outro lado antes de gravar, ou deitou com o aviso na tela): o layout acompanha
  function onTurn() {
    if (!Prompter.isOpen()) return;
    Lay.check();
    Lay.paint();
    Rec.paint();
  }
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onTurn);
  window.addEventListener('orientationchange', onTurn);

  /* ============================ Filtros de imagem (v10.0) ============================
     Pedido do Claudio (11/11/2026): "permitir colocar filtros leves de melhoria de rosto, imagem". Valem no
     ARQUIVO, nao so na tela: o que aparece na tela e o mesmo canvas que vai para a gravacao.
     - Desligado (padrao) ou tudo em zero: nada disto existe. A camera vai direto para o MediaRecorder, como
       ate a v9.8: sem canvas, sem WebGL, sem laco extra.
     - Ligado: um passe de shader WebGL (luz, contraste, cor, temperatura e pele suave por desfoque que
       preserva bordas, so onde a cor e de pele, mascara em YCbCr: olhos, boca e cabelo ficam nitidos) num
       canvas fora da tela; um canvas 2D copia o resultado. O 2D e o que fica na tela e o que a gravacao
       captura (captureStream + o som da camera). So desenha quadro novo (requestVideoFrameCallback).
     - Com filtro, no maximo Full HD: a camera e pedida em 1080 e o canvas nunca passa de 1920x1080 (4K num
       canvas esquenta demais).
     - Falhou (WebGL perdido) ou nao acompanha a camera (abaixo de ~20 quadros/s perdendo quadros por 3 s):
       o filtro desliga com aviso. Gravando, o 2D passa a copiar a imagem crua: a gravacao segue no mesmo
       arquivo, sem corte; acabou a gravacao, o caminho volta a ser o direto.
     - A camera ociosa (nap) e sair do prompter param o laco (Rec.release -> Fx.stop).
     - Ajustes por modo (MODE_KEYS 'fx'): a frente e a traseira pedem ajustes diferentes. Faixas limitadas
       para ficar leve (nada de cara de plastico). */
  /* v10.1 (pedido do Claudio, "pode colocar"): "Luz no rosto" e "Tom uniforme", com a MESMA mascara de pele da
     Pele suave (sem deteccao de rosto nem modelo novo) e no mesmo passe do shader. */
  var FX_KEYS = ['skin', 'face', 'even', 'light', 'contrast', 'sat', 'temp'];
  var FX_RANGE = { skin: [0, 100], face: [0, 100], even: [0, 100], light: [-50, 50], contrast: [-50, 50], sat: [-50, 50], temp: [-50, 50] };
  var FX_LABEL = { skin: 'Pele suave', face: 'Luz no rosto', even: 'Tom uniforme', light: 'Luz', contrast: 'Contraste', sat: 'Cor', temp: 'Temperatura' };
  var FX_PRESETS = {
    off: { skin: 0, face: 0, even: 0, light: 0, contrast: 0, sat: 0, temp: 0 },
    // (multiplos de 5: o passo das reguas)
    natural: { skin: 0, face: 0, even: 0, light: 10, contrast: 5, sat: 10, temp: 5 },      // um toque de luz e cor
    soft: { skin: 50, face: 20, even: 20, light: 10, contrast: 0, sat: 5, temp: 0 },       // pele suave leve + luz (v10.1: um pouco de luz no rosto e tom uniforme)
    warm: { skin: 0, face: 0, even: 0, light: 5, contrast: 5, sat: 10, temp: 30 }          // mais quente
  };
  var FX_NAME = { off: 'Desligado', natural: 'Natural', soft: 'Suave', warm: 'Quente' };
  function fxNorm(f) {
    f = f && typeof f === 'object' ? f : {};
    var o = { p: Object.prototype.hasOwnProperty.call(FX_PRESETS, f.p) || f.p === 'custom' ? f.p : 'off' };
    FX_KEYS.forEach(function (k) { o[k] = clamp(Math.round(Number(f[k]) || 0), FX_RANGE[k][0], FX_RANGE[k][1]); });
    return o;
  }
  // algum ajuste fora do zero? Tudo em zero = desligado (o caminho direto de sempre)
  function fxAny(f) { var n = fxNorm(f); return FX_KEYS.some(function (k) { return n[k] !== 0; }); }

  var FX_VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  var FX_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 uv;uniform sampler2D tex;uniform vec2 off[16];uniform vec2 offw[8];',
    'uniform float skin,face,even,gam,con,sat,tmp;',
    // pele: Cb 77..127 e Cr 133..173 (em 0..255), com bordas suaves; nem muito escuro nem estourado
    'float skinMask(vec3 c){',
    ' float y=dot(c,vec3(.299,.587,.114));',
    ' float cb=.5-.168736*c.r-.331264*c.g+.5*c.b, cr=.5+.5*c.r-.418688*c.g-.081312*c.b;',
    ' return smoothstep(.282,.306,cb)*(1.-smoothstep(.494,.518,cb))*smoothstep(.51,.534,cr)*(1.-smoothstep(.67,.694,cr))',
    '  *smoothstep(.1,.18,y)*(1.-smoothstep(.93,.99,y));}',
    'void main(){',
    ' vec3 c=texture2D(tex,uv).rgb;',
    ' if(skin>0.||face>0.||even>0.){float m=skinMask(c);',
    // 16 amostras em dois aneis: desfoque que preserva bordas (peso pela diferenca de cor) e a cor media da pele em volta
    '  if(m>.02){vec3 s=c;float ws=1.;vec3 L=vec3(.299,.587,.114);',
    '   for(int i=0;i<16;i++){vec3 q=texture2D(tex,uv+off[i]).rgb;vec3 d=q-c;float w=exp(-dot(d,d)*90.);s+=q*w;ws+=w;}',
    '   c=mix(c,s/ws,m*skin);',
    // tom uniforme: so a cor (a luz fica) puxa para o tom medio da pele num anel largo em volta (maior que uma
    // mancha), contando so o que e pele; disfarca vermelhidao e manchas. So calcula com a regua ligada
    '   if(even>0.){vec3 a=vec3(0.);float wa=.001;',
    '    for(int i=0;i<8;i++){vec3 q=texture2D(tex,uv+offw[i]).rgb;float mq=skinMask(q);a+=q*mq;wa+=mq;}',
    '    if(wa>.5){a/=wa;c+=((a-dot(a,L))-(c-dot(c,L)))*m*even;}}',
    // luz no rosto: clareia so a pele, como luz suave de frente; o que ja e claro nao estoura
    '   c+=(1.-c)*face*m*(1.-smoothstep(.7,.92,dot(c,L)));}}',
    ' c=pow(max(c,vec3(0.)),vec3(gam));',
    ' c=(c-.5)*con+.5;',
    ' float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,sat);',
    ' c*=vec3(1.+tmp,1.+tmp*.2,1.-tmp);',
    ' gl_FragColor=vec4(clamp(c,0.,1.),1.);}'
  ].join('\n');

  var Fx = {
    gl: null, prog: null, tex: null, U: null,
    glc: null,            // canvas do WebGL (fora da tela)
    out: null, ctx: null, // canvas 2D: na tela e na gravacao
    running: false,
    broken: '',           // falhou nesta rodada: 'gl' | 'slow' (gravando, o 2D copia a imagem crua)
    vfc: 0, w: 0, h: 0, vw: 0, vh: 0,
    win: null, fps: 0,
    frames: 0,            // quadros desenhados (para os testes)
    slowTest: 0,          // gancho de teste: atraso artificial por quadro (ms)
    MIN_FPS: 20, SLOW_S: 3,

    supported: function () {
      return typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype
        && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    },
    // o filtro deve rodar? (gravacao ligada, imagem na tela, algum ajuste fora do zero)
    wanted: function () { return Rec.enabled() && !!settings.camPreview && fxAny(settings.fx) && Fx.supported(); },

    /* liga ou desliga o laco conforme os ajustes, a camera e a gravacao. Gravando, o caminho nao muda (o filtro
       e decidido ao comecar a gravar); so sai o laco que a gravacao nao usa. */
    sync: function () {
      if (Rec.active()) {
        if (Fx.running && !Rec.fxRec) Fx.stop();
        Fx.paint();
        return;
      }
      var want = Fx.wanted() && !!Rec.stream && Prompter.isOpen();
      if (want && !Fx.running) Fx.start();
      else if (!want && Fx.running) Fx.stop();
      // 4K escolhido: com filtro a camera vem em Full HD, sem filtro volta ao 4K (so fora da gravacao)
      if (Rec.stream && !Rec.starting && Prompter.isOpen() && Rec.streamBig !== Rec.big()) { Rec.release(true); Rec.prepare(); }
      Fx.paint();
    },
    paint: function () {
      $('#cam').classList.toggle('fx-on', Fx.running);
      FxUI.sync();
    },

    init: function () {
      if (Fx.gl && !Fx.gl.isContextLost()) return true;
      Fx.gl = null;
      try {
        if (!Fx.ctx) { Fx.out = $('#cam-fx'); Fx.ctx = Fx.out.getContext('2d', { alpha: false }); }
        if (!Fx.ctx) return false;
        var c = Fx.glc = document.createElement('canvas');
        c.width = 2; c.height = 2;
        // o sistema derrubou o WebGL (placa de video ocupada, memoria): desliga o filtro, a gravacao segue
        c.addEventListener('webglcontextlost', function (ev) {
          ev.preventDefault();
          if (Fx.glc !== c) return;
          Fx.gl = null;
          if (Fx.running) Fx.fail('gl');
        });
        var gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
        if (!gl) return false;
        var sh = function (type, src) {
          var x = gl.createShader(type);
          gl.shaderSource(x, src); gl.compileShader(x);
          if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) || 'shader');
          return x;
        };
        var prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, FX_VS));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FX_FS));
        gl.bindAttribLocation(prog, 0, 'p');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.uniform1i(gl.getUniformLocation(prog, 'tex'), 0);
        Fx.U = {};
        ['off', 'offw', 'skin', 'face', 'even', 'gam', 'con', 'sat', 'tmp'].forEach(function (k) { Fx.U[k] = gl.getUniformLocation(prog, k); });
        Fx.gl = gl; Fx.prog = prog; Fx.tex = tex;
        Fx.w = Fx.h = 0;
        return true;
      } catch (e) { Fx.gl = null; return false; }
    },
    // tamanho do canvas = o do quadro da camera, no maximo Full HD (o maior lado 1920, o menor 1080)
    size: function () {
      var v = $('#cam-video'), vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return false;
      Fx.vw = vw; Fx.vh = vh;
      var k = Math.min(1, 1920 / Math.max(vw, vh), 1080 / Math.min(vw, vh));
      var w = Math.max(2, Math.round(vw * k / 2) * 2), h = Math.max(2, Math.round(vh * k / 2) * 2);
      if (w === Fx.w && h === Fx.h) return true;
      Fx.w = w; Fx.h = h;
      Fx.out.width = w; Fx.out.height = h;
      if (Fx.glc) { Fx.glc.width = w; Fx.glc.height = h; }
      if (Fx.gl) Fx.gl.viewport(0, 0, w, h);
      return true;
    },
    // ajustes da tela -> uniformes do shader (faixas limitadas: o maximo de cada regua continua leve)
    uniforms: function () {
      if (Fx.uFor === settings.fx && Fx.uW === Fx.w && Fx.uH === Fx.h && Fx.uGl === Fx.gl) return;   // nada mudou
      Fx.uFor = settings.fx; Fx.uW = Fx.w; Fx.uH = Fx.h; Fx.uGl = Fx.gl;
      var gl = Fx.gl, f = fxNorm(settings.fx), U = Fx.U;
      gl.uniform1f(U.skin, 0.7 * f.skin / 100);
      gl.uniform1f(U.face, 0.22 * f.face / 100);         // no maximo ~22% do caminho ate o branco, so na pele
      gl.uniform1f(U.even, 0.6 * f.even / 100);          // no maximo 60% do caminho ate o tom medio
      gl.uniform1f(U.gam, Math.pow(2, -0.45 * f.light / 50));
      gl.uniform1f(U.con, 1 + 0.3 * f.contrast / 50);
      gl.uniform1f(U.sat, 1 + 0.4 * f.sat / 50);
      gl.uniform1f(U.tmp, 0.08 * f.temp / 50);
      var r = Math.max(1.5, Math.min(Fx.w, Fx.h) * 0.0045), o = [];
      for (var i = 0; i < 16; i++) {
        var a = (i % 8) * Math.PI / 4 + (i >= 8 ? Math.PI / 8 : 0), rr = i >= 8 ? r * 2 : r;
        o.push(Math.cos(a) * rr / Fx.w, Math.sin(a) * rr / Fx.h);
      }
      gl.uniform2fv(U.off, new Float32Array(o));
      var ow = [];                                       // anel largo do Tom uniforme: 8 vezes o raio do desfoque
      for (var j = 0; j < 8; j++) { var b = j * Math.PI / 4 + Math.PI / 8; ow.push(Math.cos(b) * r * 8 / Fx.w, Math.sin(b) * r * 8 / Fx.h); }
      gl.uniform2fv(U.offw, new Float32Array(ow));
    },

    start: function () {
      if (Fx.running) return true;
      Fx.broken = '';
      if (!Fx.supported() || !Fx.init()) { Fx.running = true; Fx.fail('gl'); return false; }
      Fx.running = true;
      Fx.win = null;
      Fx.size();
      Fx.loop();
      Fx.paint();
      return true;
    },
    stop: function () {
      var v = $('#cam-video');
      if (Fx.vfc && v.cancelVideoFrameCallback) safe(function () { v.cancelVideoFrameCallback(Fx.vfc); });
      Fx.vfc = 0;
      if (!Fx.running) return;
      Fx.running = false;
      Fx.win = null;
      Fx.broken = '';
      // devolve a memoria dos quadros grandes
      if (Fx.out) { Fx.out.width = Fx.out.height = 2; }
      if (Fx.glc) { Fx.glc.width = Fx.glc.height = 2; }
      Fx.w = Fx.h = 0;
      Fx.paint();
    },
    loop: function () {
      if (!Fx.running) return;
      var v = $('#cam-video');
      Fx.vfc = v.requestVideoFrameCallback(Fx.frame);
    },
    // um quadro novo da camera: desenha e mede se esta acompanhando
    frame: function (t, meta) {
      Fx.vfc = 0;
      if (!Fx.running) return;
      Fx.loop();
      try { Fx.draw(); } catch (e) { if (!Fx.broken) Fx.fail('gl'); }
      Fx.watch(t, meta);
    },
    draw: function () {
      var v = $('#cam-video');
      if (!v.videoWidth || !v.videoHeight) return;
      if (Fx.slowTest) { var until = performance.now() + Fx.slowTest; while (performance.now() < until) { /* teste: celular lento */ } }
      // gravando, o tamanho nao muda (o arquivo tem um tamanho so)
      if ((v.videoWidth !== Fx.vw || v.videoHeight !== Fx.vh || !Fx.w) && !(Rec.active() && Rec.fxRec && Fx.w)) Fx.size();
      if (Fx.broken || !Fx.gl || Fx.gl.isContextLost()) {
        if (!Fx.broken) Fx.fail('gl');
        Fx.ctx.drawImage(v, 0, 0, Fx.w, Fx.h);
        Fx.frames++;
        return;
      }
      var gl = Fx.gl;
      gl.bindTexture(gl.TEXTURE_2D, Fx.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, v);
      Fx.uniforms();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      Fx.ctx.drawImage(Fx.glc, 0, 0, Fx.w, Fx.h);
      Fx.frames++;
    },
    /* esta acompanhando a camera? Janelas de 1 s: abaixo de MIN_FPS desenhados E perdendo quadros que a
       camera entregou (camera lenta no escuro, 15 quadros/s todos desenhados, nao conta) por SLOW_S janelas */
    watch: function (t, meta) {
      if (Fx.broken) return;
      if (document.visibilityState !== 'visible') { Fx.win = null; return; }
      var pf = meta && typeof meta.presentedFrames === 'number' ? meta.presentedFrames : null, w = Fx.win;
      if (!w) { Fx.win = { t0: t, p0: pf, n: 0, bad: 0 }; return; }
      w.n++;
      if (t - w.t0 < 1000) return;
      var secs = (t - w.t0) / 1000, drawn = w.n / secs, shown = pf !== null && w.p0 !== null ? (pf - w.p0) / secs : drawn;
      Fx.fps = Math.round(drawn);
      var slow = drawn < Fx.MIN_FPS && drawn < shown * 0.8;
      var bad = slow ? w.bad + 1 : 0;
      Fx.win = { t0: t, p0: pf, n: 0, bad: bad };
      if (bad >= Fx.SLOW_S) Fx.fail('slow');
    },
    /* o filtro sai: aviso, ajustes zerados (a pessoa liga de novo quando quiser). Gravando pelo canvas, o 2D
       copia a imagem crua ate a gravacao acabar (mesmo arquivo, sem corte); fora da gravacao, o laco para. */
    fail: function (why) {
      if (Fx.broken) return;
      Fx.broken = why;
      settings.fx = fxNorm(null);
      saveSettings();
      var rec = Rec.active();
      Toast.show((why === 'slow' ? 'O filtro deixava o celular lento e foi desligado.' : 'O filtro de imagem parou de funcionar neste celular e foi desligado.')
        + (rec ? ' A gravação continua.' : ''), null, null, 8000);
      if (!(rec && Rec.fxRec)) setTimeout(Fx.sync, 0);
      FxUI.sync();
    },
    // faixa de video do canvas para uma gravacao (o MediaRecorder grava esta faixa com o som da camera)
    track: function () {
      if (!Fx.out || !Fx.w) return null;
      try { return Fx.out.captureStream(30).getVideoTracks()[0] || null; } catch (e) { return null; }
    },
    // "Antes": segurando, a tela mostra a imagem sem filtro (o arquivo nao muda)
    before: function (on) { $('#cam').classList.toggle('fx-before', !!on); }
  };

  /* controles dos filtros: os mesmos na folha da varinha (por cima da imagem ao vivo) e em Ajustes > Imagem */
  var FxUI = {
    roots: [],
    build: function (root) {
      var chips = el('div', 'chips fx-presets');
      chips.setAttribute('role', 'radiogroup');
      chips.setAttribute('aria-label', 'Filtro pronto');
      Object.keys(FX_PRESETS).forEach(function (k) {
        var b = el('button', 'chip', FX_NAME[k]);
        b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.fxp = k;
        chips.appendChild(b);
      });
      root.appendChild(chips);
      FX_KEYS.forEach(function (k) {
        var row = el('label', 'fx-row');
        row.appendChild(el('span', 'fx-name', FX_LABEL[k]));
        var inp = el('input');
        inp.type = 'range'; inp.min = String(FX_RANGE[k][0]); inp.max = String(FX_RANGE[k][1]); inp.step = '5'; inp.dataset.fx = k;
        inp.setAttribute('aria-label', FX_LABEL[k]);
        row.appendChild(inp);
        row.appendChild(el('output', 'fx-val'));
        root.appendChild(row);
      });
      root.appendChild(el('p', 'hint fx-note fx-4k', 'Com filtro, o vídeo sai em Full HD.'));
      root.appendChild(el('p', 'hint fx-note fx-recnote', 'Pare a gravação para mudar os filtros.'));
      root.appendChild(el('p', 'hint fx-note fx-nocam', 'Com a imagem da câmera escondida, o vídeo sai sem filtro.'));
      root.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-fxp]');
        if (!b || Rec.active()) return;
        FxUI.set(Object.assign({ p: b.dataset.fxp }, FX_PRESETS[b.dataset.fxp]));
        haptic(6);
      });
      root.addEventListener('input', function (ev) {
        var t = ev.target;
        if (!t.dataset || !t.dataset.fx || Rec.active()) return;
        var f = fxNorm(settings.fx);
        f[t.dataset.fx] = Number(t.value);
        f.p = 'custom';
        Object.keys(FX_PRESETS).forEach(function (k) {
          if (FX_KEYS.every(function (x) { return FX_PRESETS[k][x] === f[x]; })) f.p = k;
        });
        FxUI.set(f, true);
      });
      root.addEventListener('change', function (ev) { if (ev.target.dataset && ev.target.dataset.fx) saveSettings(); });
      FxUI.roots.push(root);
    },
    // ajustes novos: sempre um objeto novo (a memoria do modo guarda o anterior)
    set: function (f, live) {
      settings.fx = fxNorm(f);
      if (!live) saveSettings();
      Fx.sync();
      FxUI.sync();
    },
    sync: function () {
      var f = fxNorm(settings.fx), rec = Rec.active(), on = fxAny(f);
      var hd = on && settings.recQuality === '4k', noCam = on && !settings.camPreview;
      FxUI.roots.forEach(function (root) {
        Array.prototype.forEach.call(root.querySelectorAll('[data-fxp]'), function (b) {
          var sel = b.dataset.fxp === (on ? f.p : 'off');
          b.setAttribute('aria-checked', String(sel));
          b.classList.toggle('on', sel);
          b.disabled = rec;
        });
        Array.prototype.forEach.call(root.querySelectorAll('input[data-fx]'), function (inp) {
          var k = inp.dataset.fx, v = f[k];
          if (Number(inp.value) !== v) inp.value = String(v);
          inp.disabled = rec;
          var o = inp.parentNode.querySelector('output');
          if (o) o.textContent = (v > 0 && FX_RANGE[k][0] < 0 ? '+' : '') + v;
        });
        root.querySelector('.fx-4k').hidden = !hd;
        root.querySelector('.fx-recnote').hidden = !rec;
        root.querySelector('.fx-nocam').hidden = !noCam;
      });
    }
  };

  /* folha dos filtros (varinha): pequena, por cima da imagem ao vivo; roteiro e controles saem da frente
     enquanto ela esta aberta. Toque fora dela ou o pedal fecham (o pedal tambem executa o comando). */
  var FxSheet = {
    isOpen: function () { return !$('#fx-sheet').hidden; },
    open: function () {
      if (Rec.active() || !Prompter.isOpen()) return;
      Peek.hide(true);
      Prompter.pause(true);
      FxUI.sync();
      $('#fx-sheet').hidden = false;
      VIEWS.prompter.classList.add('fx-open');
      Prompter.showUI();
    },
    close: function () {
      if ($('#fx-sheet').hidden) return;
      $('#fx-sheet').hidden = true;
      VIEWS.prompter.classList.remove('fx-open');
      Fx.before(false);
      saveSettings();
      blurActive();
      if (Prompter.isOpen()) Prompter.showUI();
    },
    toggle: function () { if (FxSheet.isOpen()) FxSheet.close(); else FxSheet.open(); }
  };

  /* "Ver imagem" (olho, v10.0): roteiro, barra do topo, painel e avisos saem para conferir a imagem limpa.
     Qualquer toque ou pedal traz tudo de volta e NAO inicia nada nesse toque (o mesmo cuidado do "Fechar"
     da ultima gravacao, v8.7). O texto pausa ao entrar. */
  var Peek = {
    on: false,
    show: function () {
      if (!Rec.stream || !VIEWS.prompter.classList.contains('cam-full') || !Prompter.isOpen()) return;
      FxSheet.close();
      Prompter.pause(true);
      Peek.on = true;
      $('#peek-hint').textContent = cue('Pise ou toque na tela para voltar', 'Toque na tela para voltar');
      VIEWS.prompter.classList.add('peek');
      Rec.poke();
    },
    hide: function (silent) {
      if (!Peek.on) return;
      Peek.on = false;
      VIEWS.prompter.classList.remove('peek');
      if (!silent && Prompter.isOpen()) { Prompter.showUI(); Rec.poke(); }
    }
  };

  /* ---- botoes do operador ---- */

  /* segurar repete, com aceleracao; um toque so dispara uma vez.
     O primeiro passo espera 90 ms e cancela se a ponta andar: o deslize do pedal em modo de
     toque pode comecar em cima de um botao (com o celular deitado ele cruza os controles). */
  function holdRepeat(btn, fn) {
    var t1 = 0, t2 = 0, startAt = 0, sx = 0, sy = 0, state = 0;   // 0 parado, 1 esperando, 2 repetindo
    var stop = function () { clearTimeout(t1); clearInterval(t2); t1 = t2 = 0; state = 0; };
    var loop = function (ms) {
      clearInterval(t2);
      t2 = setInterval(function () {
        fn(true);
        if (ms > 55 && now() - startAt > 1400) loop(55);
      }, ms);
    };
    btn.addEventListener('pointerdown', function (ev) {
      if (ev.button > 0) return;
      ev.preventDefault();
      stop();
      state = 1; sx = ev.clientX; sy = ev.clientY; startAt = now();
      safe(function () { btn.setPointerCapture(ev.pointerId); });
      t1 = setTimeout(function () {
        if (state !== 1) return;
        state = 2; fn(false); haptic(6);
        t1 = setTimeout(function () { loop(110); }, 330);
      }, 90);
    });
    btn.addEventListener('pointermove', function (ev) {
      if (state && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) stop();
    });
    btn.addEventListener('pointerup', function () {
      if (state === 1) { fn(false); haptic(6); }      // toque curto: vale ao soltar
      stop();
    });
    ['pointercancel', 'lostpointercapture'].forEach(function (n) { btn.addEventListener(n, stop); });
    window.addEventListener('blur', stop);
    // teclado e leitor de tela chegam como click sem ponteiro (detail 0)
    btn.addEventListener('click', function (ev) { if (ev.detail === 0) fn(false); });
  }

  function opButton(id, fn) {
    $(id).addEventListener('click', function (ev) {
      fn(ev);
      haptic(8);
      // foco em botao + tecla Enter/Espaco do pedal = clique fantasma; o foco nunca fica num botao
      this.blur();
      Prompter.showUI();
    });
  }
  opButton('#pc-exit', function () { Prompter.exit(); });
  opButton('#pc-play', function () { Prompter.toggle(); });
  opButton('#pc-prev', function () { Prompter.back(); });
  opButton('#pc-next', function () { Prompter.forward(); });
  opButton('#pc-mic', function () { Voice.toggle(); });
  opButton('#pc-stop', function () { Prompter.pause(true); Rec.stop(); });
  opButton('#pc-last', function () { Player.open(); });
  // o selo de REC fica na tela o tempo todo da gravacao: tocar nele para
  opButton('#rec-badge', function () { Prompter.pause(true); Rec.stop(); });
  opButton('#pc-rec', function () {
    if (Rec.active()) { Prompter.pause(true); Rec.stop(); }
    else if (Prompter.playing) Rec.start();
    else Prompter.toggle();
  });
  opButton('#pc-settings', function () { Settings.open(); });
  // v10.0, tela cheia: filtros (varinha) e "Ver imagem" (olho); em pe ficam no painel, deitado na barra do topo
  opButton('#pc-fx', function () { FxSheet.toggle(); });
  opButton('#pt-fx', function () { FxSheet.toggle(); });
  opButton('#pc-peek', function () { Peek.show(); });
  opButton('#pt-peek', function () { Peek.show(); });
  $('#btn-fx-close').addEventListener('click', function (ev) { ev.stopPropagation(); FxSheet.close(); });
  (function () {
    var b = $('#btn-fx-before');
    var on = function (ev) { if (ev.button > 0) return; ev.preventDefault(); Fx.before(true); safe(function () { b.setPointerCapture(ev.pointerId); }); };
    var off = function () { Fx.before(false); };
    b.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach(function (n) { b.addEventListener(n, off); });
    b.addEventListener('keydown', function (ev) { if (ev.key === ' ' || ev.key === 'Enter') Fx.before(true); });
    b.addEventListener('keyup', off);
    b.addEventListener('blur', off);
    b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  })();
  FxUI.build($('#fx-ctl'));
  FxUI.build($('#s-fx'));
  opButton('#pc-mirror', function () {
    settings.mirrorH = !settings.mirrorH;
    saveSettings();
    Settings.applyToPrompter();
    Settings.syncControls();
    Toast.show(settings.mirrorH ? 'Texto espelhado para o vidro.' : 'Espelho desligado.');
  });
  holdRepeat($('#pc-slower'), function () { Prompter.changeSpeed(-5); Prompter.showUI(); });
  holdRepeat($('#pc-faster'), function () { Prompter.changeSpeed(5); Prompter.showUI(); });

  /* ---- regua de velocidade: arrastar na horizontal ---- */

  var Dial = {
    dragging: false,
    session: null,      // ultimo arrasto: se era o pedal passando por cima, desfaz
    PX_PER_WPM: 3,
    paint: function () {
      $('#dial-num').textContent = String(settings.wpm);
      $('#dial-ruler').style.backgroundPosition = (-settings.wpm * Dial.PX_PER_WPM) + 'px 0,' + (-settings.wpm * Dial.PX_PER_WPM) + 'px 0';
      var d = $('#dial');
      d.setAttribute('aria-valuenow', String(settings.wpm));
      d.setAttribute('aria-valuetext', settings.wpm + ' palavras por minuto');
    },
    bind: function () {
      var d = $('#dial'), start = null;
      d.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0 || start) return;          // um segundo dedo nao sequestra o arrasto
        start = { id: ev.pointerId, x: ev.clientX, wpm: settings.wpm, moved: false, lastTick: settings.wpm };
        safe(function () { d.setPointerCapture(ev.pointerId); });
        Prompter.showUI();
      });
      d.addEventListener('pointermove', function (ev) {
        if (!start || ev.pointerId !== start.id) return;
        var dx = ev.clientX - start.x;
        if (!start.moved && Math.abs(dx) < 6) return;  // limiar antes de comecar
        if (!start.moved) { start.moved = true; Dial.dragging = true; d.classList.add('drag'); }
        var v = clamp(Math.round(start.wpm + dx / Dial.PX_PER_WPM), 60, 260);
        if (Math.floor(v / 5) !== Math.floor(start.lastTick / 5)) { haptic(4); start.lastTick = v; }
        Prompter.setWpm(v, false);
      });
      var end = function (ev) {
        if (!start || (ev && ev.pointerId != null && ev.pointerId !== start.id)) return;
        var moved = start.moved;
        if (moved) Dial.session = { from: start.wpm, at: now() };
        start = null;
        Dial.dragging = false;
        d.classList.remove('drag');
        if (moved) { saveSettings(); Prompter.showUI(); }
      };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { d.addEventListener(n, end); });
      window.addEventListener('blur', function () { end(null); });
    }
  };
  Dial.bind();
  Dial.undoIfRecent = function () {
    var s = Dial.session;
    if (s && now() - s.at < 250) { Dial.session = null; Prompter.setWpm(s.from, true); }
  };

  /* ---- barra de posicao: arrastar para achar o trecho ---- */

  var Scrub = {
    dragging: false,
    session: null,
    bind: function () {
      var s = $('#scrub'), id = null, sx = 0, sy = 0, from = 0, engaged = false, cancelled = false;
      var setFrom = function (x) {
        var r = $('.scrub-track').getBoundingClientRect();
        var pct = clamp((x - r.left) / Math.max(1, r.width), 0, 1);
        Prompter.anim = null;
        Prompter.offset = pct * Prompter.maxOffset;
        Prompter.unend();
        Prompter.lastPara = Prompter.paraIndexAt(Prompter.offset);
        Prompter.lastSec = Prompter.sectionAt(Prompter.offset);
        Prompter.paint();
        Prompter.updateMeta(true);
      };
      s.addEventListener('pointerdown', function (ev) {
        if (ev.button > 0 || id !== null) return;
        id = ev.pointerId; sx = ev.clientX; sy = ev.clientY;
        from = Prompter.offset; engaged = false; cancelled = false;
        Scrub.dragging = true;
        safe(function () { s.setPointerCapture(ev.pointerId); });
        Prompter.showUI();
      });
      s.addEventListener('pointermove', function (ev) {
        if (ev.pointerId !== id || cancelled) return;
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!engaged) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { cancelled = true; return; }  // atravessou: nao e arrasto da barra
          if (Math.abs(dx) < 6) return;
          engaged = true;
        }
        setFrom(ev.clientX);
      });
      var end = function (ev) {
        if (id === null || (ev && ev.pointerId != null && ev.pointerId !== id)) return;
        if (ev && ev.type === 'pointerup' && !engaged && !cancelled) { setFrom(ev.clientX); engaged = true; }  // toque parado: pula para o ponto
        if (engaged) Scrub.session = { from: from, at: now() };
        id = null;
        Scrub.dragging = false;
        Prompter.showUI();
      };
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { s.addEventListener(n, end); });
    }
  };
  Scrub.bind();
  Scrub.undoIfRecent = function () {
    var s = Scrub.session;
    if (s && now() - s.at < 250) {
      Scrub.session = null;
      Prompter.anim = null;
      Prompter.offset = clamp(s.from, 0, Prompter.maxOffset);
      Prompter.paint();
    }
  };

  // toque na tela: inicia/pausa. Com os controles escondidos, tocar na faixa deles so os mostra.
  VIEWS.prompter.addEventListener('click', function (ev) {
    // o video da ultima gravacao fica dentro desta tela: tocar nele (ou no Fechar) nao pode iniciar uma gravacao
    if (ev.target.closest('.p-top,.dock,.rec-badge,.player,.flipwarn') || Player.isOpen() || Flip.isShown() || Lay.isShown()) return;
    // v10.0: folha dos filtros aberta: tocar fora dela so fecha (nao inicia nada)
    if (FxSheet.isOpen()) { if (!ev.target.closest('.fx-card')) FxSheet.close(); return; }
    // "Ver imagem": o toque so traz o roteiro e os controles de volta (nao inicia nem grava)
    if (Peek.on) { Peek.hide(); return; }
    if (Prompter.sheetOpen()) return;
    if (now() - Gestures.swipeAt < 450) return;
    if (Prompter.uiHidden()) {
      var dockTop = $('#dock').getBoundingClientRect().top;
      var y = ev.clientY;
      if (y >= dockTop || y <= $('#p-top').getBoundingClientRect().bottom) { Prompter.showUI(); return; }
    }
    Prompter.toggle();
  });
  VIEWS.prompter.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  VIEWS.prompter.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'mouse' && Prompter.uiHidden()) Prompter.showUI();
  });

  window.addEventListener('resize', function () { onTurn(); Prompter.relayout(); });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { Prompter.relayout(); });
    ro.observe($('#stage'));
    ro.observe($('#content'));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { Prompter.relayout(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    // de volta ao app: o envio retoma (e a tela volta a ficar acesa enquanto envia)
    if (Up.running) Up.wake(); else if (Up.pending()) Up.run();
    if (!Prompter.isOpen()) return;
    safe(Prompter.requestWakeLock);
    Prompter.ensureLoop();
    Voice.resumeIfWanted();
    Rec.poke();          // voltou ao app: a pessoa esta ali
  });
  // camera ociosa: qualquer toque, tecla, pedal ou rolagem zera a contagem (antes de tudo, sem bloquear nada)
  ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (k) {
    window.addEventListener(k, function () { if (Prompter.isOpen()) Rec.poke(); }, { capture: true, passive: true });
  });

  /* ============================ Entrada: pedal, teclado, toque ============================ */

  // aceita varios candidatos (code e key da tecla, ou o nome do gesto)
  function actionForTokens(cands) {
    for (var i = 0; i < ACTIONS.length; i++) {
      var arr = keymap[ACTIONS[i].id] || [];
      for (var j = 0; j < cands.length; j++) if (cands[j] && arr.indexOf(cands[j]) !== -1) return ACTIONS[i];
    }
    return null;
  }

  var Input = {
    lastRun: {},
    lastSignal: 0,
    capture: null,      // funcao que recebe os sinais enquanto o assistente ou a captura estao abertos

    // um sinal chegou (tecla, deslize ou roda). Devolve true se virou acao.
    signal: function (tokens, rec, ev) {
      Input.lastSignal = now();
      Pedal.blink();
      var a = actionForTokens(tokens);
      rec.action = a ? a.id : null;
      // tecla com comando = pedal (no celular nao ha teclado); tecla de midia pode ser o fone de ouvido
      if (a && rec.kind === 'key' && !/^Media/.test(rec.code || rec.key || '')) pedalSeen();
      Pedal.record(rec);
      if (Input.capture) { if (ev && ev.cancelable) ev.preventDefault(); Input.capture(tokens, rec); return true; }
      if (current === 'pedal' && a) { if (ev && ev.cancelable) ev.preventDefault(); return true; }
      if (UpLeave.isShown()) {             // aviso do envio ao Drive: nada grava nem rola por tras; o pedal da direita fecha o aviso
        if (!a) return false;
        if (ev && ev.cancelable) ev.preventDefault();
        if (!rec.repeat && a.id === 'playPause') UpLeave.stay();
        return true;
      }
      if (!Prompter.isOpen()) return false;
      if (Flip.isShown()) {                // aviso de virar o celular: o pedal da direita confirma, nada grava
        if (!a) return false;
        if (ev && ev.cancelable) ev.preventDefault();
        if (!rec.repeat && a.id === 'playPause') Flip.done();
        return true;
      }
      if (Lay.isShown()) {                 // aviso de deitar o celular: o mesmo
        if (!a) return false;
        if (ev && ev.cancelable) ev.preventDefault();
        if (!rec.repeat && a.id === 'playPause') Lay.done();
        return true;
      }
      if (Player.isOpen()) {
        if (!a) return false;
        if (ev && ev.cancelable) ev.preventDefault();
        if (!rec.repeat) { if (a.id === 'playPause') Player.toggle(); else if (a.id === 'back') Player.close(); }
        return true;
      }
      if (Peek.on) {                       // "Ver imagem" (v10.0): o pedal so traz o roteiro de volta, nada inicia nem grava
        if (!a) return false;
        if (ev && ev.cancelable) ev.preventDefault();
        if (!rec.repeat) Peek.hide();
        return true;
      }
      if (Prompter.sheetOpen()) {
        if (!a) return false;            // tecla comum segue para o controle da folha
        Prompter.closeSheets();          // pisada no pedal: volta para a leitura e executa
      }
      if (ev && ev.cancelable) ev.preventDefault();
      if (!a) {
        if (rec.kind !== 'key') Prompter.flash('i-pedal', tokenLabel(tokens[0]) + ': sem ação', true);
        return false;
      }
      if (rec.repeat && !a.pulse) return true;      // iniciar/pausar ignora a autorrepeticao
      Input.run(a.id, rec.kind);
      return true;
    },

    /* Trava contra comando duplo: a mesma acao vinda de qualquer fonte dentro da janela
       e ignorada. Um pedal que manda tecla + deslize, ou um Bluetooth que repete o pacote,
       nao vira pausa-e-volta. */
    run: function (id, source) {
      var a = ACTION_BY_ID[id];
      if (!a) return false;
      var t = now(), last = Input.lastRun[id];
      var win = last && last.src !== source ? Math.max(a.gap, 420) : a.gap;
      if (last && t - last.t < win) return false;
      Input.lastRun[id] = { t: t, src: source };
      Prompter.quiet = true;
      try {
        if (id === 'playPause') Prompter.toggle();
        else if (id === 'back') Prompter.back();
        else if (id === 'forward') Prompter.forward();
        else if (id === 'faster') Prompter.changeSpeed(5, true);
        else if (id === 'slower') Prompter.changeSpeed(-5, true);
        else if (id === 'top') Prompter.toTop();
      } finally { Prompter.quiet = false; }
      return true;
    }
  };

  var NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Enter', 'Tab'];

  function isEditable(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable) return true;
    if (t.tagName === 'TEXTAREA') return true;
    if (t.tagName !== 'INPUT') return false;
    return !/^(checkbox|radio|range|button|submit|reset|color|file)$/i.test(t.type || 'text');
  }

  // Um listener global, na fase de captura: no prompter, foco em botao ou checkbox escondido nao rouba o pedal.
  window.addEventListener('keydown', function (ev) {
    var tokens = [ev.code, ev.key === ' ' ? 'Space' : ev.key].filter(Boolean);
    var rec = { kind: 'key', key: ev.key, code: ev.code, keyCode: ev.keyCode, repeat: !!ev.repeat, tokens: tokens };

    if (Input.capture) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'Escape') { Pedal.cancelCapture(); return; }
      if (!ev.repeat) Input.signal(tokens, rec, ev);
      return;
    }

    var editing = isEditable(ev.target) && !Prompter.isOpen();
    if (editing) return;                              // digitacao no editor fica com o editor

    if (Prompter.isOpen()) {
      if (Prompter.sheetOpen()) {
        if (ev.key === 'Escape') { ev.preventDefault(); Prompter.closeSheets(); return; }
        if (!actionForTokens(tokens)) return;           // Tab, setas nos controles da folha etc.
        ev.stopPropagation();
        Input.signal(tokens, rec, ev);                  // fecha a folha e executa (preventDefault dentro)
        return;
      }
      if (ev.key === 'Escape') { ev.preventDefault(); if (UpLeave.isShown()) UpLeave.stay(); else if (Peek.on) Peek.hide(); else Prompter.exit(); return; }
      ev.stopPropagation();
      var handled = Input.signal(tokens, rec, ev);
      if (!handled && NAV_KEYS.indexOf(ev.key) !== -1) ev.preventDefault();
      return;
    }
    if (!ev.repeat) Input.signal(tokens, rec, ev);
  }, true);

  // botao tocado nao guarda foco: Espaco/Enter do pedal (modo 4) nao o aciona de novo em nenhuma tela
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('button');
    if (b && ev.detail > 0) setTimeout(function () { if (document.activeElement === b) b.blur(); }, 0);
  }, true);

  // Espaco ativa botao no keyup: no prompter, nenhuma tecla mapeada chega a um botao
  window.addEventListener('keyup', function (ev) {
    if (!Prompter.isOpen() || Prompter.sheetOpen()) return;
    if (actionForTokens([ev.code, ev.key === ' ' ? 'Space' : ev.key]) || NAV_KEYS.indexOf(ev.key) !== -1) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  /* ---- pedal em modo de toque, e dedo ----
     O Cube Turner em modo de toque desenha um deslize perfeitamente reto em ~185 ms (medido
     no S25 FE: x de 150 a 1100 com y parado). Dedo nunca anda em linha reta perfeita, entao:
     linha reta = pedal (vira comando); qualquer outro arrasto = dedo (rola o texto). */

  // converte o vetor da tela para o referencial do celular em pe (angulo da rotacao da tela)
  function screenAngle() {
    var a = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
    else if (typeof window.orientation === 'number') a = window.orientation;
    return ((a % 360) + 360) % 360;
  }
  function toNatural(dx, dy) {
    var a = screenAngle();
    if (a === 90) return [-dy, dx];
    if (a === 180) return [-dx, -dy];
    if (a === 270) return [dy, -dx];
    return [dx, dy];
  }
  function swipeToken(dx, dy) {
    var n = toNatural(dx, dy), ax = Math.abs(n[0]), ay = Math.abs(n[1]);
    return ay >= ax ? (n[1] > 0 ? 'SwipeDown' : 'SwipeUp') : (n[0] > 0 ? 'SwipeRight' : 'SwipeLeft');
  }

  var K_PROFILE = 'tp.pedalTouch';

  var Gestures = {
    touches: {},
    swipeAt: 0,
    lastWheel: 0,
    MIN_SWIPE: 40,      // px: abaixo disso e toque
    PEDAL_MIN: 120,     // px: deslize reto mais curto que isso e dedo (o do pedal cruza ~80% da tela)
    STRAIGHT: 2.5,      // px de desvio maximo para ser o pedal
    FINGER_DEV: 6,      // px de desvio que provam que e dedo
    WHEEL_GAP: 350,
    /* Sem regra de tempo: um celular ocupado atrasa eventos e um deslize do pedal de 185 ms
       pode chegar "lento". So a geometria decide. O raio do toque do pedal, aprendido no
       assistente, ajuda a reconhecer o dedo logo no primeiro milimetro. */
    profile: Store.read(K_PROFILE, null),

    fingerByRadius: function (g) {
      var pr = Gestures.profile;
      return !!(pr && typeof pr.rx === 'number' && g.rx > pr.rx + 3);
    },
    // sobre um controle, so vale como pedal o deslize reto e LONGO (o Cube Turner cruza ~80% da tela)
    controlMin: function () {
      var pr = Gestures.profile;
      return pr && pr.dist ? Math.max(80, pr.dist * 0.7) : 160;
    },
    pedalMin: function () {
      var pr = Gestures.profile;
      return pr && pr.dist ? Math.max(80, Math.min(Gestures.PEDAL_MIN, pr.dist * 0.7)) : Gestures.PEDAL_MIN;
    },
    learn: function (rec) {
      if (!rec || rec.kind !== 'swipe' || !rec.geom) return;
      var pr = Gestures.profile || { rx: 0, n: 0 };
      pr.rx = Math.max(pr.n ? pr.rx : 0, rec.rx || 0);
      pr.dist = pr.dist ? Math.min(pr.dist, rec.dist) : rec.dist;
      pr.n = (pr.n || 0) + 1;
      Gestures.profile = pr;
      Store.write(K_PROFILE, pr);
    },

    interested: function () {
      return !!Input.capture || current === 'pedal' || (Prompter.isOpen() && !Player.isOpen());
    },
    // o prompter so rola na mao fora do arrasto do pedal
    manualAllowed: function () { return Prompter.isOpen() && !Prompter.sheetOpen() && !Player.isOpen() && !Input.capture && !Peek.on; },

    onStart: function (ev) {
      if (!Gestures.interested()) return;
      // o pedal pode comecar o deslize em cima de qualquer controle; o dedo, nao rola o texto de la
      var onControl = !!(ev.target.closest && ev.target.closest('button,input,textarea,select,a,[role="slider"],.dock,.p-top,.sheet,.wiz-box,.overlay'));
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i];
        Gestures.touches[t.identifier] = {
          x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: now(), onControl: onControl,
          inSheet: !!(ev.target.closest && ev.target.closest('.sheet-card')),
          dev: 0, manual: false, rx: t.radiusX || 0, ry: t.radiusY || 0, force: t.force || 0
        };
      }
    },
    onMove: function (ev) {
      var any = false;
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i], g = Gestures.touches[t.identifier];
        if (!g) continue;
        if (!g.inSheet) any = true;      // dentro da folha de ajustes o dedo rola a folha
        var px = g.x, py = g.y;
        g.x = t.clientX; g.y = t.clientY;
        g.rx = Math.max(g.rx, t.radiusX || 0);
        // desvio perpendicular a reta do inicio ao ponto atual
        var dx = g.x - g.x0, dy = g.y - g.y0, len = Math.hypot(dx, dy);
        if (len > 8) {
          var dev = Math.abs(dx) >= Math.abs(dy) ? Math.abs(dy) : Math.abs(dx);
          if (dev > g.dev) g.dev = dev;
        }
        if (Gestures.manualAllowed() && !g.onControl) {
          if (!g.manual && len > 10 && (g.dev > Gestures.FINGER_DEV || Gestures.fingerByRadius(g))) {
            g.manual = true;
            Prompter.nudge(-(g.y - g.y0) * (settings.mirrorV ? -1 : 1));   // alcanca o que ja andou
          } else if (g.manual) {
            Prompter.nudge(-(g.y - py) * (settings.mirrorV ? -1 : 1));
          }
        }
      }
      // sem isto o Chrome puxa o "arrastar para atualizar" e recarrega no meio da gravacao
      if (any && (Prompter.isOpen() || Input.capture) && ev.cancelable) ev.preventDefault();
    },
    onEnd: function (ev) {
      for (var i = 0; i < ev.changedTouches.length; i++) {
        var t = ev.changedTouches[i], g = Gestures.touches[t.identifier];
        if (!g) continue;
        delete Gestures.touches[t.identifier];
        if (ev.type === 'touchcancel') continue;
        var dx = t.clientX - g.x0, dy = t.clientY - g.y0;
        var dist = Math.round(Math.max(Math.abs(dx), Math.abs(dy)));
        if (g.manual) { Gestures.swipeAt = now(); continue; }   // foi dedo rolando o texto
        if (dist < Gestures.MIN_SWIPE) continue;                 // toque simples: o click cuida
        var geom = g.dev <= Gestures.STRAIGHT;                       // reta: assinatura do pedal
        var straight = geom && !Gestures.fingerByRadius(g) && dist >= (g.onControl ? Gestures.controlMin() : Gestures.pedalMin());
        if (Input.capture) straight = geom;                          // no assistente vale so a geometria (aprende o resto)
        if (g.onControl && !straight) continue;                      // dedo usando um controle
        Gestures.swipeAt = now();
        var token = swipeToken(dx, dy);
        var rec = {
          kind: 'swipe', token: token, dist: dist, ms: now() - g.t0, dev: Math.round(g.dev * 10) / 10,
          rx: Math.round(g.rx * 10) / 10, straight: straight, geom: geom, angle: screenAngle()
        };
        if (!straight) {
          if (Gestures.manualAllowed()) Prompter.nudge(-dy * (settings.mirrorV ? -1 : 1));
          else { rec.action = null; Pedal.record(rec); }    // dedo fora da leitura: aparece no monitor, sem acao
          continue;
        }
        // era o pedal: desfaz o que um controle no caminho possa ter feito
        Dial.undoIfRecent();
        Scrub.undoIfRecent();
        Input.signal([token], rec, ev);
      }
    },

    onWheel: function (ev) {
      if (!Gestures.interested()) return;
      var dx = ev.deltaX || 0, dy = ev.deltaY || 0;
      if (ev.deltaMode === 1) { dx *= 40; dy *= 40; }
      var wheelMapped = ACTIONS.some(function (a) { return (keymap[a.id] || []).some(function (t) { return /^Wheel/.test(t); }); });
      if (!wheelMapped && !Input.capture && current !== 'pedal') {
        if (Prompter.isOpen() && !Prompter.sheetOpen()) { ev.preventDefault(); Prompter.nudge(dy); }
        return;
      }
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      var t = now();
      if (t - Gestures.lastWheel < Gestures.WHEEL_GAP) { if (ev.cancelable) ev.preventDefault(); return; }
      Gestures.lastWheel = t;
      var token = Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'WheelDown' : 'WheelUp') : (dx > 0 ? 'WheelRight' : 'WheelLeft');
      Input.signal([token], { kind: 'wheel', token: token, dx: Math.round(dx), dy: Math.round(dy) }, ev);
    }
  };

  /* Deslize horizontal numa pagina sem rolagem lateral = "voltar" do Chrome. No app instalado
     isso fecha o teleprompter; com o pedal em modo 6 acontecia em toda tela que nao era a de
     leitura. Nenhuma tela aqui rola na horizontal, entao o gesto lateral e bloqueado em todas. */
  var NavGuard = { x: 0, y: 0 };
  document.addEventListener('touchstart', function (ev) {
    if (ev.touches.length === 1) { NavGuard.x = ev.touches[0].clientX; NavGuard.y = ev.touches[0].clientY; }
  }, { passive: true, capture: true });
  document.addEventListener('touchmove', function (ev) {
    if (ev.touches.length !== 1 || !ev.cancelable) return;
    var t = ev.touches[0];
    // a regua (input range, v10.0: filtros e transparencia) e arrastada de lado: nao bloqueia
    if (Math.abs(t.clientX - NavGuard.x) > Math.abs(t.clientY - NavGuard.y) && !isEditable(ev.target) && ev.target.type !== 'range') ev.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener('touchstart', Gestures.onStart, { passive: true });
  document.addEventListener('touchmove', Gestures.onMove, { passive: false });
  // touchend nao pode ser passivo: cancela o clique sintetico do deslize
  document.addEventListener('touchend', Gestures.onEnd, { passive: false });
  document.addEventListener('touchcancel', Gestures.onEnd, { passive: true });
  document.addEventListener('wheel', Gestures.onWheel, { passive: false });

  // o que o sinal diz sobre o modo do M-VAVE Cube Turner (LEDs 1 a 7)
  function pedalMode(tok) {
    if (/^Arrow(Left|Right)$/.test(tok)) return { n: 1, name: 'setas ← →', ok: true };
    if (/^Arrow(Up|Down)$/.test(tok)) return { n: 2, name: 'setas ↑ ↓', ok: true };
    if (/^Page(Up|Down)$/.test(tok)) return { n: 3, name: 'Page Up / Page Down', ok: true };
    if (/^(Space|Enter|NumpadEnter| )$/.test(tok)) return { n: 4, name: 'Espaço / Enter', ok: true };
    if (/^Media|^AudioVolume/.test(tok)) return { n: 5, name: 'teclas de mídia', ok: false };
    if (/^Swipe(Left|Right)$/.test(tok)) return { n: 6, name: 'deslize ← →', ok: 'swipe' };
    if (/^Swipe(Up|Down)$/.test(tok)) return { n: 7, name: 'deslize ↑ ↓', ok: 'swipe' };
    return null;
  }

  /* ============================ Tela do pedal ============================ */

  var Pedal = {
    log: [],
    statusTimer: 0,
    wiz: null,

    enter: function () {
      Pedal.renderFeed();
      Pedal.renderMonitor();
      Pedal.renderMapping();
      Pedal.renderStatus();
      clearInterval(Pedal.statusTimer);
      Pedal.statusTimer = setInterval(Pedal.renderStatus, 1000);
    },
    leave: function () {
      clearInterval(Pedal.statusTimer);
      Pedal.cancelCapture();
    },

    blink: function () {
      var led = $('#lib-led');
      led.classList.add('hit');
      clearTimeout(Pedal.ledTimer);
      Pedal.ledTimer = setTimeout(function () { led.classList.remove('hit'); }, 350);
    },
    hitKey: function (side) {
      ['#pk-' + side, '#wk-' + side].forEach(function (s) {
        var k = $(s);
        k.classList.add('hit');
        setTimeout(function () { k.classList.remove('hit'); }, 300);
      });
    },

    record: function (rec) {
      rec.t = new Date();
      Pedal.log.unshift(rec);
      if (Pedal.log.length > 30) Pedal.log.length = 30;
      if (current !== 'pedal') return;
      if (rec.action === 'playPause') Pedal.hitKey('right');
      else if (rec.action === 'back') Pedal.hitKey('left');
      Pedal.renderFeed();
      Pedal.renderMonitor();
      Pedal.renderStatus();
    },

    renderStatus: function () {
      var s = $('#pedal-status'), m = $('#pedal-mode');
      if (!Input.lastSignal) {
        s.textContent = 'Pise no pedal para testar.'; s.className = 'pedal-status';
        m.hidden = true;
        return;
      }
      var ago = Math.round((now() - Input.lastSignal) / 1000);
      s.textContent = ago < 2 ? 'Sinal recebido agora' : 'Último sinal há ' + (ago < 60 ? ago + ' s' : Math.round(ago / 60) + ' min');
      s.className = 'pedal-status ' + (ago < 30 ? 'ok' : 'warn');
      var last = Pedal.log[0];
      var mode = last && pedalMode(last.kind === 'key' ? (last.code || last.key) : last.token);
      if (!mode) { m.hidden = true; return; }
      m.hidden = false;
      m.className = 'pedal-mode ' + (mode.ok === true ? 'good' : mode.ok ? 'meh' : 'bad');
      m.textContent = mode.ok === true
        ? 'Pedal no modo ' + mode.n + ' (' + mode.name + '). Ótimo: modo de tecla é o mais firme.'
        : mode.ok
          ? 'Pedal no modo ' + mode.n + ' (' + mode.name + '). Funciona, mas o mais firme é o modo 3: toque no botão Mode do pedal até acender o 3º LED e refaça os 2 passos.'
          : 'Pedal no modo 5 (' + mode.name + '): o celular pode tocar música sozinho. Toque no botão Mode até o 3º LED.';
    },

    describe: function (r) {
      if (r.kind === 'key') return tokenLabel(r.code || r.key);
      if (r.kind === 'swipe' && !r.straight) return tokenLabel(r.token) + ' do dedo (não é comando)';
      return tokenLabel(r.token) + (r.kind === 'swipe' ? ' do pedal' : '');
    },

    renderFeed: function () {
      var box = $('#pedal-feed');
      box.innerHTML = '';
      var items = Pedal.log.slice(0, 6);
      if (!items.length) { box.appendChild(el('li', 'empty-feed', 'Nada ainda. Pise no pedal.')); return; }
      items.forEach(function (r, i) {
        var li = el('li', i === 0 ? 'fresh' : null);
        li.appendChild(el('span', 't', fmtClock(r.t)));
        var w = el('div', 'what');
        var a = r.action ? ACTION_BY_ID[r.action] : null;
        w.appendChild(el('div', 'act' + (a ? '' : ' none'), a ? a.name : 'Sem ação'));
        w.appendChild(el('div', 'tok', Pedal.describe(r)));
        li.appendChild(w);
        box.appendChild(li);
      });
    },

    renderMonitor: function () {
      var box = $('#key-monitor');
      box.innerHTML = '';
      if (!Pedal.log.length) { box.appendChild(el('p', 'hint', 'Aguardando teclas e gestos.')); return; }
      Pedal.log.slice(0, 12).forEach(function (r) {
        var line = el('div', 'k-line');
        line.appendChild(el('span', 'k-dim', fmtClock(r.t)));
        if (r.kind === 'wheel') {
          line.appendChild(el('span', null, 'wheel dY ' + r.dy + ' dX ' + r.dx + ' → ' + r.token));
        } else if (r.kind === 'swipe') {
          line.appendChild(el('span', null, 'swipe ' + r.token + ' ' + r.dist + 'px ' + r.ms + 'ms desvio ' + r.dev + ' raio ' + r.rx + ' rot ' + r.angle + '°' + (r.straight ? ' (reto)' : '')));
        } else {
          line.appendChild(el('span', null, 'key ' + (r.key === ' ' ? '(espaço)' : r.key) + ' · code ' + (r.code || '—') + ' · ' + r.keyCode + (r.repeat ? ' · repete' : '')));
        }
        box.appendChild(line);
      });
    },

    renderMapping: function () {
      var wrap = $('#mapping-list');
      wrap.innerHTML = '';
      ACTIONS.forEach(function (a) {
        var item = el('div', 'map-item');
        var head = el('div', 'map-head');
        head.appendChild(el('div', 'map-name', a.name));
        var add = el('button', 'btn', 'Adicionar');
        add.type = 'button';
        add.addEventListener('click', function () { Pedal.startCapture(a); });
        head.appendChild(add);
        item.appendChild(head);
        var keys = el('div', 'keys');
        var arr = keymap[a.id] || [];
        if (!arr.length) keys.appendChild(el('span', 'hint', 'Sem comando.'));
        arr.forEach(function (code) {
          var tag = el('span', 'key-tag' + (isGesture(code) ? ' gesture' : ''));
          tag.appendChild(el('span', null, tokenLabel(code)));
          var x = el('button', null, '×');
          x.type = 'button';
          x.setAttribute('aria-label', 'Remover ' + tokenLabel(code) + ' de ' + a.name);
          x.addEventListener('click', function () {
            keymap[a.id] = (keymap[a.id] || []).filter(function (c) { return c !== code; });
            saveKeys(); Pedal.renderMapping();
          });
          tag.appendChild(x);
          keys.appendChild(tag);
        });
        item.appendChild(keys);
        wrap.appendChild(item);
      });
    },

    // um comando so pode pertencer a uma acao
    assign: function (actionId, tokens) {
      ACTIONS.forEach(function (a) {
        keymap[a.id] = (keymap[a.id] || []).filter(function (t) { return tokens.indexOf(t) === -1; });
      });
      tokens.forEach(function (t) { if (keymap[actionId].indexOf(t) === -1) keymap[actionId].unshift(t); });
      saveKeys();
    },

    /* ---- captura manual (Adicionar) ---- */
    startCapture: function (action) {
      $('#capture-action').textContent = 'Para: ' + action.name;
      $('#capture-overlay').hidden = false;
      Input.capture = function (tokens) {
        Pedal.cancelCapture();
        pedalSeen();
        Pedal.assign(action.id, [tokens[0]]);
        Pedal.renderMapping();
        Toast.show(tokenLabel(tokens[0]) + ' agora faz: ' + action.name + '.');
      };
    },
    cancelCapture: function () {
      Input.capture = null;
      $('#capture-overlay').hidden = true;
      if (Pedal.wiz) Pedal.wizEnd(false);
    },

    /* ---- assistente de 2 passos ---- */
    wizStart: function () {
      Pedal.wiz = { step: 1, right: [], left: [], timer: 0 };
      $('#wizard').hidden = false;
      Pedal.wizPaint();
      Input.capture = Pedal.wizInput;
    },
    wizPaint: function () {
      var w = Pedal.wiz;
      var right = w.step === 1;
      $('#wiz-step').textContent = 'Passo ' + w.step + ' de 2';
      $('#wiz-title').textContent = right ? 'Pise no pedal da DIREITA' : 'Agora o pedal da ESQUERDA';
      $('#wiz-hint').textContent = right ? 'Ele vai iniciar e pausar a rolagem.' : 'Ele vai voltar para o começo do parágrafo.';
      $('#wk-right').classList.toggle('expect', right);
      $('#wk-left').classList.toggle('expect', !right);
      var got = $('#wiz-got');
      got.textContent = '';
      got.className = 'wiz-got';
    },
    // junta os sinais de uma mesma pisada (alguns modos mandam tecla e deslize juntos)
    wizInput: function (tokens, rec) {
      var w = Pedal.wiz;
      if (!w || w.done) return;
      if (rec && rec.kind === 'swipe') {
        if (!rec.geom) {               // dedo na tela durante o assistente: ignora
          $('#wiz-got').textContent = 'Isso foi o dedo na tela. Use o pedal.';
          $('#wiz-got').className = 'wiz-got err';
          return;
        }
        Gestures.learn(rec);
      }
      var bucket = w.step === 1 ? w.right : w.left;
      var tok = tokens[0];
      if (bucket.indexOf(tok) === -1) bucket.push(tok);
      Pedal.hitKey(w.step === 1 ? 'right' : 'left');
      clearTimeout(w.timer);
      w.timer = setTimeout(Pedal.wizCommit, 350);
    },
    wizCommit: function () {
      var w = Pedal.wiz;
      if (!w) return;
      var got = $('#wiz-got');
      if (w.step === 1) {
        got.textContent = 'Recebido: ' + w.right.map(tokenLabel).join(' + ');
        got.className = 'wiz-got ok';
        w.done = true;
        setTimeout(function () { if (Pedal.wiz !== w) return; w.step = 2; w.done = false; Pedal.wizPaint(); }, 900);
        return;
      }
      var same = w.left.filter(function (t) { return w.right.indexOf(t) !== -1; });
      if (same.length) {
        got.textContent = 'Os dois pedais mandaram o mesmo sinal (' + tokenLabel(same[0]) + '). Troque o modo do pedal e tente de novo, ou fique só com iniciar e pausar.';
        got.className = 'wiz-got err';
        w.left = [];
        Pedal.wizOffer();
        return;
      }
      got.textContent = 'Recebido: ' + w.left.map(tokenLabel).join(' + ');
      got.className = 'wiz-got ok';
      w.done = true;
      Pedal.assign('playPause', w.right);
      Pedal.assign('back', w.left);
      setTimeout(function () { Pedal.wizEnd(true); }, 800);
    },
    // os dois pedais iguais: oferece usar um pedal so para iniciar e pausar
    wizOffer: function () {
      var acts = $('#wizard .wiz-actions');
      if (acts.querySelector('[data-one]')) return;
      var one = el('button', 'btn primary', 'Usar só iniciar e pausar');
      one.type = 'button';
      one.setAttribute('data-one', '1');
      one.addEventListener('click', function () {
        Pedal.assign('playPause', Pedal.wiz.right);
        Pedal.wizEnd(true);
      });
      acts.appendChild(one);
    },
    wizEnd: function (ok) {
      var w = Pedal.wiz;
      if (w) clearTimeout(w.timer);
      Pedal.wiz = null;
      Input.capture = null;
      $('#wizard').hidden = true;
      var extra = document.querySelector('#wizard [data-one]');
      if (extra) extra.remove();
      $('#wk-right').classList.remove('expect');
      $('#wk-left').classList.remove('expect');
      if (ok && w) {
        pedalSeen();
        Pedal.renderMapping();
        Toast.show('Pedal configurado. Pise para testar: a luz acende no lado certo.');
      }
    }
  };

  $('#btn-open-pedal').addEventListener('click', function () { show('pedal'); });
  $('#btn-pedal-back').addEventListener('click', function () { show('library'); });
  $('#btn-wizard').addEventListener('click', function () { Pedal.wizStart(); });
  $('#btn-wiz-cancel').addEventListener('click', function () { Pedal.cancelCapture(); });
  $('#btn-capture-cancel').addEventListener('click', function () { Pedal.cancelCapture(); });
  $('#btn-reset-keys').addEventListener('click', function () {
    var before = JSON.stringify(keymap);
    keymap = defaultKeys();
    saveKeys();
    Pedal.renderMapping();
    Toast.show('Comandos de fábrica restaurados.', 'Desfazer', function () {
      keymap = JSON.parse(before); saveKeys(); Pedal.renderMapping();
    });
  });

  /* ============================ Ajustes ============================ */

  var FAMILIES = {
    hyper: '"Atkinson Hyperlegible Next",system-ui,sans-serif',
    system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    serif: 'Georgia,"Noto Serif","Times New Roman",serif'
  };

  var Settings = {
    open: function () {
      $('#panel-settings').hidden = false;
      Settings.syncControls();
      if (Prompter.isOpen()) Prompter.showUI();
      setTimeout(function () { safe(function () { $('#btn-settings-close').focus({ preventScroll: true }); }); }, 30);
    },
    close: function () {
      if ($('#panel-settings').hidden) return;
      $('#panel-settings').hidden = true;
      blurActive();                     // nada focado fica escondido esperando uma tecla do pedal
      if (Prompter.isOpen()) Prompter.showUI();
    },

    applyToPrompter: function () {
      var c = $('#content'), st = $('#stage');
      c.style.setProperty('--fsize', settings.font + 'px');
      c.style.setProperty('--lheight', (settings.line / 100).toFixed(2));
      c.style.setProperty('--tcolor', settings.color);
      c.style.setProperty('--tfamily', FAMILIES[settings.family] || FAMILIES.hyper);
      c.style.setProperty('--talign', settings.textAlign === 'center' ? 'center' : 'left');
      $('#scroller').style.setProperty('--pad', settings.margin + '%');
      VIEWS.prompter.style.setProperty('--ui-a', (settings.uiAlpha / 100).toFixed(2));   // v10.0: fundo escuro da tela cheia
      st.classList.toggle('mirror-h', !!settings.mirrorH);
      st.classList.toggle('mirror-v', !!settings.mirrorV);
      // camera frontal (ou linha de leitura embaixo): todos os controles no alto; a parte de baixo,
      // perto da lente, fica so para a leitura. Deitado (v9.6) quem decide e o layout deitado (Lay)
      VIEWS.prompter.classList.toggle('ctl-top', !landMode() && (settings.guidePos >= 60 || (!!settings.record && settings.camFacing === 'user')));
      Lay.paint();
      $('#guide').hidden = !settings.guide;
      $('#readfade').hidden = !settings.dimRead;
      var m = $('#pc-mirror');
      m.setAttribute('aria-pressed', String(!!settings.mirrorH));
      Dial.paint();
      Rec.paint();
      if (Prompter.isOpen()) Prompter.relayout();
    },

    syncControls: function () {
      Array.prototype.forEach.call(document.querySelectorAll('.stepper'), function (s) {
        var v = s.querySelector('.st-val');
        if (v) v.firstChild.textContent = String(settings[s.dataset.key]);
      });
      var radio = function (sel, attr, val) {
        Array.prototype.forEach.call($(sel).children, function (b) {
          var on = String(b.dataset[attr]) === String(val);
          b.setAttribute('aria-checked', String(on));
          b.classList.toggle('on', on);
        });
      };
      radio('#s-family', 'family', settings.family);
      radio('#s-color', 'color', settings.color);
      radio('#s-guidepos', 'pos', settings.guidePos);
      radio('#s-countdown', 'cd', settings.countdown);
      radio('#s-recq', 'q', settings.recQuality);
      radio('#s-camfacing', 'facing', settings.camFacing);
      radio('#s-camrot', 'rot', settings.camRotate);
      radio('#s-recscreen', 'scr', settings.recScreen);
      radio('#s-campos', 'cpos', settings.camPos);
      radio('#s-talign', 'align', settings.textAlign);
      // deitado, a imagem fica em tela cheia ou no canto do layout deitado (Lay): "no alto" e "acima da linha" nao valem
      Array.prototype.forEach.call(document.querySelectorAll('#s-campos [data-cpos="top"],#s-campos [data-cpos="line"]'), function (b) { b.hidden = landMode(); });
      $('#s-uialpha').value = String(settings.uiAlpha);
      $('#s-uialpha-val').textContent = settings.uiAlpha + '%';
      $('#s-uialpha-row').hidden = settings.camPos !== 'full';
      FxUI.sync();
      $('#s-record').checked = !!settings.record;
      $('#s-drive').checked = !!settings.driveUpload;
      $('#s-campreview').checked = !!settings.camPreview;
      Array.prototype.forEach.call($('#s-presets').children, function (b) {
        b.classList.toggle('on', Number(b.dataset.wpm) === settings.wpm);
      });
      $('#s-mirror-h').checked = !!settings.mirrorH;
      $('#s-mirror-v').checked = !!settings.mirrorV;
      $('#s-guide').checked = !!settings.guide;
      $('#s-dimread').checked = !!settings.dimRead;
      $('#s-autopause').checked = !!settings.autoPause;
      $('#s-follow').checked = !!settings.follow;
      $('#s-wake').checked = !!settings.wake;
      $('#s-fullscreen').checked = !!settings.fullscreen;
      $('#s-haptics').checked = !!settings.haptics;
      Folder.paint();
    },

    buildSteppers: function () {
      Array.prototype.forEach.call(document.querySelectorAll('.stepper'), function (s) {
        var key = s.dataset.key, step = Number(s.dataset.step), min = Number(s.dataset.min), max = Number(s.dataset.max);
        var label = s.dataset.label, unit = s.dataset.unit;
        s.appendChild(el('span', 'st-label', label));
        var minus = el('button', 'btn');
        minus.type = 'button';
        minus.setAttribute('aria-label', label + ': diminuir');
        minus.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-minus"></use></svg>';
        var val = el('span', 'st-val');
        val.setAttribute('aria-live', 'polite');
        val.appendChild(document.createTextNode(String(settings[key])));
        val.appendChild(el('small', null, unit));
        var plus = el('button', 'btn');
        plus.type = 'button';
        plus.setAttribute('aria-label', label + ': aumentar');
        plus.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-plus"></use></svg>';
        s.appendChild(minus); s.appendChild(val); s.appendChild(plus);
        var change = function (dir) {
          var v = clamp(Math.round((settings[key] + dir * step) / step) * step, min, max);
          if (v === settings[key]) return;
          if (key === 'wpm') { Prompter.setWpm(v, true); return; }
          settings[key] = v;
          saveSettings();
          Settings.applyToPrompter();
          Settings.syncControls();
        };
        holdRepeat(minus, function () { change(-1); });
        holdRepeat(plus, function () { change(1); });
      });
    },

    bind: function () {
      Settings.buildSteppers();
      var flag = function (id, key, after) {
        $(id).addEventListener('change', function () {
          settings[key] = this.checked;
          saveSettings();
          Settings.applyToPrompter();
          haptic(6);
          if (after) after(this.checked);
        });
      };
      flag('#s-mirror-h', 'mirrorH');
      flag('#s-mirror-v', 'mirrorV');
      flag('#s-guide', 'guide');
      flag('#s-dimread', 'dimRead');
      flag('#s-autopause', 'autoPause');
      flag('#s-follow', 'follow', function (on) {
        if (!Prompter.isOpen()) return;
        if (on) { Voice.stop(); Follow.start(); } else Follow.stop();
      });
      flag('#s-fullscreen', 'fullscreen');
      flag('#s-haptics', 'haptics');
      flag('#s-wake', 'wake', function (on) { if (on) Prompter.requestWakeLock(); else Prompter.releaseWakeLock(); });

      var chips = function (sel, attr, key, num) {
        $(sel).addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-' + attr + ']'); if (!b) return;
          settings[key] = num ? Number(b.dataset[attr]) : b.dataset[attr];
          saveSettings(); Settings.applyToPrompter(); Settings.syncControls(); haptic(6);
        });
      };
      chips('#s-family', 'family', 'family', false);
      chips('#s-color', 'color', 'color', false);
      chips('#s-guidepos', 'pos', 'guidePos', true);
      chips('#s-countdown', 'cd', 'countdown', true);
      chips('#s-recq', 'q', 'recQuality', false);
      $('#s-recq').addEventListener('click', function (ev) {
        if (ev.target.closest('[data-q]') && !settings.recQualityPicked) { settings.recQualityPicked = true; saveSettings(); }
      });
      chips('#s-camrot', 'rot', 'camRotate', true);
      chips('#s-recscreen', 'scr', 'recScreen', false);
      chips('#s-campos', 'cpos', 'camPos', false);
      chips('#s-talign', 'align', 'textAlign', false);
      $('#s-recscreen').addEventListener('click', function (ev) { if (ev.target.closest('[data-scr]')) Rec.lockScreen(); });
      chips('#s-camfacing', 'facing', 'camFacing', false);
      // qualidade ou camera nova: religa a camera (so fora de uma gravacao)
      ['#s-recq', '#s-camfacing'].forEach(function (sel) {
        $(sel).addEventListener('click', function (ev) {
          if (ev.target.closest('[data-q],[data-facing]') && Rec.stream && !Rec.active()) { Rec.release(); Rec.prepare(); }
        });
      });
      flag('#s-record', 'record', function (on) {
        if (!Prompter.isOpen()) return;
        if (on) Rec.prepare(); else Rec.release();
        Prompter.updateUI();
      });
      flag('#s-campreview', 'camPreview', function () { Fx.sync(); });
      // v10.0: transparencia do fundo da tela cheia (opacidade 20 a 90%), lembrada
      $('#s-uialpha').addEventListener('input', function () {
        settings.uiAlpha = clamp(Math.round(Number(this.value) || 55), 20, 90);
        VIEWS.prompter.style.setProperty('--ui-a', (settings.uiAlpha / 100).toFixed(2));
        $('#s-uialpha-val').textContent = settings.uiAlpha + '%';
      });
      $('#s-uialpha').addEventListener('change', function () { saveSettings(); haptic(6); });
      flag('#s-drive', 'driveUpload', function (on) {
        if (on) Up.run();
        Up.paint(true);
        // v9.5: ligar sem login leva ao login (gravando, so depois: sair da pagina perderia o video)
        if (!on || LOCALHOST || GDocs.canWrite() || !navigator.onLine) return;
        if (Rec.active()) { Toast.show('Depois de gravar, entre no Google para os vídeos subirem para o Drive.'); return; }
        GDocs.login(Prompter.isOpen() ? { do: 'present', id: Prompter.id } : { do: 'upload' });
      });
      $('#s-presets').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-wpm]'); if (!b) return;
        Prompter.setWpm(Number(b.dataset.wpm), true); haptic(6);
      });

      $('#btn-open-settings').addEventListener('click', Settings.open);
      $('#btn-settings-close').addEventListener('click', Settings.close);
      $('#panel-settings').addEventListener('click', function (ev) { if (ev.target === this) Settings.close(); });
      $('#btn-settings-pedal').addEventListener('click', function () { Settings.close(); show('pedal'); });
      $('#btn-backup').addEventListener('click', Files.backup);
      $('#btn-restore').addEventListener('click', function () { Files.pick('restore'); });
      $('#app-version').textContent = 'Versão ' + APP_VERSION + '. Funciona sem internet depois da primeira abertura.';
    }
  };
  Settings.bind();

  /* ============================ Acompanhar a voz ============================
     Rola so enquanto a pessoa fala e espera nas pausas. Mede a energia do microfone no
     proprio aparelho: sem internet, sem enviar audio para lugar nenhum. O piso de ruido
     se ajusta sozinho (desce rapido, sobe devagar e so no silencio). */

  var Follow = {
    on: false,
    starting: false,
    stream: null,
    ctx: null,
    an: null,
    buf: null,
    floor: 0.004,
    lastVoice: 0,
    speaking: false,
    HANG: 650,          // ms que a rolagem segue depois da ultima silaba
    gen: 0,             // geracao do pedido de microfone: resposta atrasada de pedido antigo e descartada

    active: function () { return Follow.on && Prompter.isOpen(); },

    start: function () {
      if (Follow.on || Follow.starting) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) {
        Toast.show('Este aparelho não deixa o app ouvir o microfone. A rolagem segue normal.');
        return;
      }
      Voice.stop();
      Follow.starting = true;
      var gen = ++Follow.gen;
      // gravando, pede o microfone igual a gravacao: o mesmo microfone com outro tratamento mudaria o som do video
      navigator.mediaDevices.getUserMedia({ audio: Rec.enabled() ? Rec.audio() : { echoCancellation: false, noiseSuppression: true, autoGainControl: false } })
        .then(function (stream) {
          if (gen !== Follow.gen || !settings.follow || !Prompter.isOpen()) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          Follow.starting = false;
          var Ctx = window.AudioContext || window.webkitAudioContext;
          var ctx = new Ctx();
          var src = ctx.createMediaStreamSource(stream);
          var an = ctx.createAnalyser();
          an.fftSize = 1024;
          src.connect(an);
          Follow.stream = stream; Follow.ctx = ctx; Follow.an = an;
          Follow.buf = new Float32Array(an.fftSize);
          Follow.on = true;
          Follow.lastVoice = 0;
          Follow.speaking = false;
          if (ctx.state === 'suspended' && ctx.resume) safe(function () { return ctx.resume(); });
          Voice.paint('Seguindo a voz');
          Follow.paint();
        })
        .catch(function () {
          if (gen !== Follow.gen) return;
          Follow.starting = false;
          settings.follow = false; saveSettings(); Settings.syncControls();
          Toast.show('Sem permissão de microfone: acompanhar a voz ficou desligado.');
        });
    },

    stop: function () {
      Follow.gen++;
      Follow.starting = false;
      if (Follow.stream) Follow.stream.getTracks().forEach(function (t) { safe(function () { t.stop(); }); });
      if (Follow.ctx && Follow.ctx.close) safe(function () { return Follow.ctx.close(); });
      Follow.stream = Follow.ctx = Follow.an = null;
      var was = Follow.on;
      Follow.on = false;
      Follow.speaking = false;
      Follow.paint();
      if (was && !Voice.wanted) Voice.paint(null);
    },

    // chamado a cada quadro pelo laco do prompter
    sample: function () {
      if (!Follow.on || !Follow.an) return;
      var b = Follow.buf, sum = 0;
      Follow.an.getFloatTimeDomainData(b);
      for (var i = 0; i < b.length; i++) sum += b[i] * b[i];
      var rms = Math.sqrt(sum / b.length);
      var thr = Math.max(Follow.floor * 3.2, 0.008);
      if (rms > thr) Follow.lastVoice = now();
      else if (rms < Follow.floor) Follow.floor = Follow.floor * 0.9 + rms * 0.1;
      else Follow.floor = Follow.floor * 0.995 + rms * 0.005;
      var sp = now() - Follow.lastVoice < Follow.HANG;
      if (sp !== Follow.speaking) { Follow.speaking = sp; Follow.paint(); }
    },

    // no vidro: as setas da linha apagam enquanto o texto espera a voz
    paint: function () {
      $('#guide').classList.toggle('waiting', Follow.on && !Follow.speaking);
    }
  };

  /* ============================ Comando de voz ============================ */

  var Voice = {
    rec: null,
    wanted: false,
    supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    flagTimer: 0,
    retryTimer: 0,
    startedAt: 0,
    curtas: 0,        // quedas seguidas em menos de SHORT_LIFE

    init: function () {
      $('#voice-support').textContent = Voice.supported
        ? 'Comando de voz disponível neste aparelho. Exige internet e permissão de microfone.'
        : 'Este navegador não tem reconhecimento de voz. Use o pedal ou os botões.';
      if (!Voice.supported) $('#pc-mic').disabled = true;
    },

    toggle: function () {
      if (!Voice.supported) return;
      if (Voice.wanted) { Voice.stop(); return; }
      if (Rec.active()) { Toast.show('Gravando: o comando de voz fica desligado para não atrapalhar o som.'); return; }
      if (Follow.on || Follow.starting) {
        Follow.stop();
        settings.follow = false; saveSettings(); Settings.syncControls();
        Toast.show('Acompanhar a voz desligado: o microfone fica com os comandos de voz.');
      }
      Voice.wanted = true; Voice.curtas = 0; Voice.spawn(); Voice.paint('Voz ativa');
    },

    /* No Chrome do Android a sessao continua morre sozinha ("aborted", "no-speech"), as vezes
       em menos de um segundo. Enquanto a voz estiver ligada e o prompter aberto, religamos:
       350 ms no caso normal, 2 s se a sessao anterior nem durou 1 s. */
    RETRY_FAST: 350,
    RETRY_SLOW: 2000,
    SHORT_LIFE: 1000,

    spawn: function () {
      if (!Voice.supported || !Voice.wanted) return;
      clearTimeout(Voice.retryTimer);
      var antiga = Voice.rec;
      Voice.rec = null;
      if (antiga) safe(function () { return antiga.abort ? antiga.abort() : antiga.stop(); });

      var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      var r;
      try { r = new Ctor(); } catch (e) { Voice.scheduleRestart(Voice.RETRY_SLOW); return; }
      r.lang = 'pt-BR';
      r.continuous = true;
      r.interimResults = true;   // no Chrome Android o resultado final pode nunca chegar
      r.maxAlternatives = 1;
      r.onresult = function (ev) {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var res = ev.results[i];
          Voice.handle(res[0].transcript || '', res.isFinal, i);
        }
      };
      r.onerror = function (ev) {
        var motivo = ev && ev.error;
        if (motivo === 'not-allowed' || motivo === 'service-not-allowed') {
          Voice.wanted = false;
          clearTimeout(Voice.retryTimer);
          Voice.paint('Voz bloqueada');
        }
      };
      r.onend = function () {
        if (Voice.rec !== r) return;
        if (now() - Voice.startedAt < Voice.SHORT_LIFE) Voice.curtas++; else Voice.curtas = 0;
        Voice.scheduleRestart(Voice.curtas >= 2 ? Voice.RETRY_SLOW : Voice.RETRY_FAST);
      };
      Voice.rec = r;
      Voice.startedAt = now();
      try { r.start(); } catch (e) { Voice.scheduleRestart(Voice.RETRY_SLOW); }
    },

    scheduleRestart: function (delay) {
      clearTimeout(Voice.retryTimer);
      if (!Voice.wanted || !Prompter.isOpen()) return;
      Voice.retryTimer = setTimeout(function () {
        if (!Voice.wanted || !Prompter.isOpen()) return;
        Voice.spawn();
      }, delay);
    },
    resumeIfWanted: function () {
      if (!Voice.wanted || !Prompter.isOpen()) return;
      if (Voice.rec && now() - Voice.startedAt < Voice.SHORT_LIFE) return;
      Voice.scheduleRestart(Voice.RETRY_FAST);
    },
    stop: function () {
      Voice.wanted = false;
      Voice.cancelPending();
      clearTimeout(Voice.retryTimer);
      var r = Voice.rec;
      Voice.rec = null;
      if (r) safe(function () { return r.abort ? r.abort() : r.stop(); });
      Voice.paint(null);
    },
    paint: function (text) {
      var f = $('#voice-flag');
      $('#pc-mic').setAttribute('aria-pressed', String(Voice.wanted));
      if (!text) { f.hidden = true; return; }
      f.hidden = false;
      f.textContent = text;
    },
    flashFlag: function (text) {
      Voice.paint(text);
      clearTimeout(Voice.flagTimer);
      Voice.flagTimer = setTimeout(function () { Voice.paint(Voice.wanted ? 'Voz ativa' : null); }, 1200);
    },
    norm: function (s) {
      return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    },
    // ordem importa: frases mais especificas antes das genericas
    RULES: [
      { act: 'faster', words: ['mais rapido', 'acelera', 'acelerar'] },
      { act: 'slower', words: ['mais devagar', 'devagar', 'desacelera', 'mais lento'] },
      { act: 'top', words: ['do inicio', 'recomecar', 'recomeca', 'voltar ao inicio', 'ir ao inicio'] },
      { act: 'pause', words: ['pausar', 'pausa', 'parar'] },
      { act: 'back', words: ['voltar'] },
      { act: 'play', words: ['iniciar', 'comecar', 'continuar', 'play'] }
    ],
    /* So a frase EXATA do comando, falada sozinha. O resultado parcial de qualquer frase lida
       comeca curto ("voltar", "comecar"...), entao no parcial a acao espera 650 ms: se a frase
       continuar ("voltar ao passado"), e roteiro, nao comando. */
    pending: null,
    match: function (t) {
      for (var i = 0; i < Voice.RULES.length; i++) {
        var w = Voice.RULES[i].words;
        for (var j = 0; j < w.length; j++) if (t === w[j]) return { act: Voice.RULES[i].act, label: w[j] };
      }
      return null;
    },
    cancelPending: function () { if (Voice.pending) { clearTimeout(Voice.pending.timer); Voice.pending = null; } },
    handle: function (raw, isFinal, idx) {
      if (!Prompter.isOpen()) return;
      var t = Voice.norm(raw);
      var m = t ? Voice.match(t) : null;
      if (isFinal) {
        Voice.cancelPending();
        if (m) Voice.run(m.act, m.label);
        return;
      }
      if (!m) { if (Voice.pending && Voice.pending.idx === idx) Voice.cancelPending(); return; }
      if (Voice.pending && Voice.pending.idx === idx && Voice.pending.act === m.act) return;
      Voice.cancelPending();
      Voice.pending = { idx: idx, act: m.act, timer: setTimeout(function () { Voice.pending = null; Voice.run(m.act, m.label); }, 650) };
    },
    lastAct: '', lastAt: 0,
    run: function (act, label) {
      // interim e final da mesma fala chegam duas vezes; nao repete o comando
      var t = now();
      if (act === Voice.lastAct && t - Voice.lastAt < 1500) return;
      Voice.lastAct = act; Voice.lastAt = t;
      Rec.poke();                       // comando de voz tambem e interacao (camera ociosa)
      Prompter.quiet = true;
      try {
        if (act === 'play') Prompter.play();
        else if (act === 'pause') Prompter.pause();
        else if (act === 'faster') Prompter.changeSpeed(5, true);
        else if (act === 'slower') Prompter.changeSpeed(-5, true);
        else if (act === 'back') Prompter.back();
        else if (act === 'top') Prompter.toTop();
      } finally { Prompter.quiet = false; }
      Voice.flashFlag('Voz: ' + label);
    }
  };
  Voice.init();

  /* ============================ Compartilhar com o Prompter (v10.1) ============================
     Pedido do Claudio (11/11): "Ainda ta muito ruim de encontrar os roteiros no google docs / drive" e
     "Quero so uma solucao, que nao confunda o usuario". O caminho unico no celular: no app do Docs, abrir
     o roteiro > Compartilhar e exportar > Enviar uma copia > Word (.docx) > Prompter. O roteiro abre pronto.
     - O manifesto declara um share_target POST (multipart). O service worker recebe o POST em
       ./compartilhar, guarda titulo, texto, link e arquivo no cache 'tp-share' e redireciona para
       ./?compartilhado=1; aqui a pagina le e apaga (Share.take).
     - .docx: lido no proprio app, sem login e sem biblioteca de fora (Docx.read: ZIP + DecompressionStream).
     - .txt / .md / texto puro: vira roteiro como esta.
     - Link de Google Docs: a janela do Google (Picker) abre so naquele documento (o caminho que ja existia);
       sem conta conectada, pede o login uma vez e volta para ele.
     - PDF: aviso dizendo para mandar como Word (ler texto de PDF exigiria uma biblioteca grande).
     - O mesmo arquivo mandado de novo atualiza o roteiro que ja estava aqui (mesmo nome), sem duplicar. */
  var Docx = {
    W: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    // descompacta uma entrada do ZIP (guardada ou deflate) pelo proprio navegador
    entry: function (buf, want) {
      var dv = new DataView(buf), n = buf.byteLength, eocd = -1;
      for (var i = n - 22; i >= Math.max(0, n - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
      if (eocd < 0) return Promise.reject(new Error('zip'));
      var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true);
      var dec = new TextDecoder('utf-8');
      for (var k = 0; k < count && p + 46 <= n; k++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
        var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
        var local = dv.getUint32(p + 42, true);
        var name = dec.decode(new Uint8Array(buf, p + 46, nlen));
        p += 46 + nlen + xlen + clen;
        if (name !== want) continue;
        if (dv.getUint32(local, true) !== 0x04034b50) return Promise.reject(new Error('zip'));
        var start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
        var data = new Uint8Array(buf, start, csize);
        if (method === 0) return Promise.resolve(dec.decode(data));
        if (method !== 8 || typeof DecompressionStream !== 'function') return Promise.reject(new Error('deflate'));
        var ds = new DecompressionStream('deflate-raw');
        return new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return dec.decode(b); });
      }
      return Promise.reject(new Error('sem ' + want));
    },
    /* texto do roteiro: um paragrafo do Word = um paragrafo do teleprompter (como na importacao do Docs);
       Titulo/Titulo 1-6 vira "# bloco"; negrito vira **enfase**; quebra de linha vira paragrafo. */
    read: function (buf) {
      return Docx.entry(buf, 'word/document.xml').then(function (xml) {
        var doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
        var W = Docx.W, out = [];
        var on = function (n) { if (!n) return false; var v = n.getAttributeNS(W, 'val') || n.getAttribute('w:val'); return !/^(0|false|none)$/i.test(v || ''); };
        Array.prototype.forEach.call(doc.getElementsByTagNameNS(W, 'p'), function (p) {
          var ppr = p.getElementsByTagNameNS(W, 'pPr')[0], st = ppr && ppr.getElementsByTagNameNS(W, 'pStyle')[0];
          var style = st ? (st.getAttributeNS(W, 'val') || st.getAttribute('w:val') || '') : '';
          var head = /^(title|heading\d|t[ií]?tulo\d?)$/i.test(style.replace(/[\s_-]/g, ''));
          var segs = [];
          Array.prototype.forEach.call(p.getElementsByTagNameNS(W, 'r'), function (r) {
            if (r.parentNode && r.parentNode.localName === 'del') return;               // texto apagado em revisao
            var rpr = r.getElementsByTagNameNS(W, 'rPr')[0], b = !!(rpr && on(rpr.getElementsByTagNameNS(W, 'b')[0]));
            Array.prototype.forEach.call(r.childNodes, function (c) {
              if (c.namespaceURI !== W) return;
              var t = c.localName === 't' ? c.textContent : c.localName === 'tab' ? ' ' : (c.localName === 'br' || c.localName === 'cr') ? '\n' : '';
              if (!t) return;
              var last = segs[segs.length - 1];
              if (last && last.b === b) last.t += t; else segs.push({ t: t, b: b });
            });
          });
          var line = segs.map(function (s) {
            if (!s.b || head || !s.t.trim()) return s.t;
            var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.t);
            return m[1] + m[2].split('\n').map(function (x) { return x.trim() ? '**' + x + '**' : x; }).join('\n') + m[3];
          }).join('').replace(/[ \t]+$/gm, '');
          if (!line.trim()) return;
          out.push(head ? '# ' + line.replace(/\s+/g, ' ').trim() : line);
        });
        return Script.linesToParas(out.join('\n'));
      });
    }
  };

  var Share = {
    CACHE: 'tp-share',
    DOCX: /\.docx$|wordprocessingml\.document/i,
    // so o celular tem "Compartilhar" (Android): no PC a tela do Docs mostra a escolha no Google
    phone: function () { return /Android/i.test(navigator.userAgent || ''); },
    url: function (k) { return new URL('__compartilhado/' + k, location.href.split(/[?#]/)[0]).href; },
    // a pagina abriu por um compartilhamento: le o que o service worker guardou e apaga
    take: function () {
      if (!/[?&]compartilhado=1/.test(location.search)) return Promise.resolve(null);
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* sem historico */ }
      if (!window.caches) return Promise.resolve(null);
      return caches.open(Share.CACHE).then(function (c) {
        return c.match(Share.url('meta')).then(function (r) { return r ? r.json() : null; }).then(function (meta) {
          if (!meta) return null;
          var file = meta.file ? c.match(Share.url('arquivo')).then(function (r) { return r ? r.blob() : null; }) : Promise.resolve(null);
          return file.then(function (blob) {
            meta.blob = blob;
            return Promise.all([c.delete(Share.url('meta')), c.delete(Share.url('arquivo'))]).then(function () { return meta; });
          });
        });
      }).catch(function () { return null; });
    },
    receive: function (d) {
      if (!d) return Promise.resolve();
      var f = d.file, name = f && f.name || '', type = f && f.type || '';
      var nl = function (x) { return String(x || '').replace(/\r\n?/g, '\n').trim(); };
      var title = nl(d.title), text = nl(d.text), link = nl(d.url);
      if (f && d.blob) {
        var base = name.replace(/\.[^.]+$/, '').trim() || title || 'Roteiro compartilhado';
        if (Share.DOCX.test(name) || Share.DOCX.test(type)) {
          return d.blob.arrayBuffer().then(Docx.read).then(function (t) { Share.ready(base, t, 'docx'); }, function () {
            Toast.show('Não consegui ler esse arquivo do Word. No Docs, use Enviar uma cópia > Word (.docx) de novo.', null, null, 9000);
          });
        }
        if (/\.pdf$/i.test(name) || /pdf/i.test(type)) {
          show('docs');
          Toast.show('Chegou um PDF, e o app não lê PDF. No Docs: Enviar uma cópia > escolha Word (.docx) > Prompter.', null, null, 12000);
          return Promise.resolve();
        }
        if (/^text\//i.test(type) || /\.(txt|md|markdown)$/i.test(name)) {
          return d.blob.text().then(function (t) { Share.ready(base, /\.(md|markdown)$/i.test(name) ? Script.fromDoc(t, true) : Script.linesToParas(t.replace(/\r\n?/g, '\n')), 'texto'); });
        }
        Toast.show('Esse tipo de arquivo o app não lê. No Docs: Enviar uma cópia > Word (.docx) > Prompter.', null, null, 9000);
        return Promise.resolve();
      }
      // link de um Google Docs: a janela do Google abre so nele
      var id = GDocs.linkId(link) || GDocs.linkId(text);
      if (id) { Share.docLink(id, link + ' ' + text); return Promise.resolve(); }
      if (link && text.indexOf(link) === -1) text = text ? text + '\n\n' + link : link;
      if (!text) { Toast.show('Não chegou nenhum texto.'); return Promise.resolve(); }
      Share.ready(title || text.split('\n')[0].slice(0, 60) || 'Roteiro compartilhado', Script.linesToParas(text), 'texto');
      return Promise.resolve();
    },
    // roteiro pronto: o mesmo nome mandado de novo atualiza o que ja estava aqui; abre a escolha do modo
    ready: function (title, text, kind) {
      if (!String(text || '').trim()) { Toast.show('O arquivo chegou vazio: não achei texto nele.', null, null, 8000); return; }
      var s = null;
      for (var i = 0; i < scripts.length; i++) if (scripts[i].source && scripts[i].source.type === 'share' && scripts[i].title === title) { s = scripts[i]; break; }
      var again = !!s;
      if (s) { s.text = text; s.updated = now(); s.source.at = now(); }
      else {
        s = { id: newId(), title: title, text: text, created: now(), updated: now(), source: { type: 'share', kind: kind, at: now() } };
        scripts.push(s);
      }
      saveScripts();
      Storage.persist();
      show('library');
      Modes.pick(s.id);
      Toast.show((again ? 'Roteiro atualizado: “' : 'Roteiro pronto: “') + title + '”.');
    },
    docLink: function (id, raw) {
      // link de um arquivo do Word aberto no Google Docs: a janela do Google so mostra Google Docs
      if (/[?&]rtpof=true/.test(raw || '')) { Toast.show('Esse link é de um arquivo do Word. No Docs: Enviar uma cópia > Word (.docx) > Prompter.', null, null, 10000); return; }
      show('docs');
      Share.more(true);
      var acct = GDocs.cur();
      if (acct) { GDocs.choose(acct, id); return; }
      // nenhuma conta neste aparelho: a pessoa entra uma vez e a janela volta ja no documento
      GDocs.pendingFile = id;
      $('#docs-status').textContent = '';
      Toast.show('Para trazer pelo link, entre com a conta Google onde está o roteiro.', null, null, 9000);
    },
    // o caminho de reserva (escolher no Google) dentro do "Não aparece o Prompter?"; aberto fica lembrado
    more: function (open) {
      var d = $('#docs-more');
      if (open && !d.open) d.open = true;
      Store.write('tp.docsMore', !!d.open);
    },
    paint: function () {
      var ph = Share.phone(), d = $('#docs-more');
      VIEWS.docs.classList.toggle('docs-pc', !ph);
      $('#docs-how').hidden = !ph;
      if (!ph) d.open = true;
      else if (Store.read('tp.docsMore', false)) d.open = true;
    }
  };
  $('#docs-more').addEventListener('toggle', function () { if (Share.phone()) Store.write('tp.docsMore', this.open); });

  /* ============================ Atualizacao do app ============================ */

  var Update = {
    pending: false,
    hadController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    // a versao nova so entra fora do prompter, nunca no meio de uma gravacao
    offer: function () {
      Update.pending = false;
      Toast.show('Versão nova do teleprompter pronta.', 'Atualizar', function () {
        if (current === 'editor') Editor.saveNow();
        location.reload();
      }, 15000);
    }
  };

  /* ============================ Inicio ============================ */

  Settings.syncControls();
  Settings.applyToPrompter();
  Library.render();

  // volta do login do Google (o token chega no fragmento da URL)
  GDocs.resume(GDocs.handleRedirect());

  // texto compartilhado de outro app (WhatsApp, Notas, Docs) vira roteiro novo
  (function () {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var text = q.get('share_text') || '', url = q.get('share_url') || '', title = q.get('share_title') || '';
    if (!text && !url) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* sem historico */ }
    if (url && text.indexOf(url) === -1) text = text ? text + '\n\n' + url : url;
    if (!title) title = text.split('\n')[0].slice(0, 60) || 'Roteiro compartilhado';
    Editor.create(title, text);
    Toast.show('Roteiro criado a partir do texto compartilhado.');
  })();

  // v10.1: roteiro que chegou pelo Compartilhar do Android (o service worker guardou; ver Share)
  Share.take().then(Share.receive).catch(function () { Toast.show('Não consegui abrir o que foi compartilhado. Tente de novo.'); });

  // primeiro uso: convite para ensinar o pedal ao app
  var K_ONBOARD = 'tp.pedalSetupSeen';
  function onboardPaint() { $('#onboard').hidden = !!Store.read(K_ONBOARD, false); }
  $('#btn-onboard-go').addEventListener('click', function () { Store.write(K_ONBOARD, true); onboardPaint(); show('pedal'); Pedal.wizStart(); });
  $('#btn-onboard-skip').addEventListener('click', function () { Store.write(K_ONBOARD, true); onboardPaint(); });
  onboardPaint();

  // videos que ficaram na fila do Drive (app fechado, sem internet, login vencido) continuam a subir;
  // com video esperando login, a rodada termina renovando o login sozinha (tela inicial)
  Up.all().then(function () { Up.paint(true); setTimeout(Up.run, 1200); }, function () { /* sem IndexedDB */ });
  Folder.load();          // pasta PROMPTER escolhida antes (v9.5)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!Update.hadController) { Update.hadController = true; return; }   // primeira instalacao
      if (current === 'prompter') Update.pending = true; else Update.offer();
    });
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* sem offline */ });
    });
  }

  // gancho para teste automatizado (nao afeta o uso)
  window.__tp = { Share: Share, Docx: Docx, Fx: Fx, FxUI: FxUI, FxSheet: FxSheet, Peek: Peek, Lay: Lay, SndSpot: SndSpot, Toast: Toast, Prompter: Prompter, Rec: Rec, Up: Up, UpLeave: UpLeave, Guard: Guard, Modes: Modes, Flip: Flip, Folder: Folder, SaveAsk: SaveAsk, Player: Player, Input: Input, Voice: Voice, GDocs: GDocs, Sound: Sound, Gestures: Gestures, settings: settings, keymap: function () { return keymap; }, toNatural: toNatural, swipeToken: swipeToken, Script: Script };
})();

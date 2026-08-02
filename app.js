/* Teleprompter - aplicativo estatico, sem dependencias.
   Organizacao: Store (persistencia), Views (navegacao), Library, Editor,
   Prompter (rolagem), Keys (pedal e teclado), Voice (comandos de voz). */
(function () {
  'use strict';

  var APP_VERSION = 'v4';
  var K_SCRIPTS = 'tp.scripts';
  var K_SETTINGS = 'tp.settings';
  var K_KEYS = 'tp.keys';

  var $ = function (sel) { return document.querySelector(sel); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };

  /* ============================ Store ============================ */

  var Store = {
    read: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    write: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* cota cheia ou modo privado */ }
    }
  };

  var DEFAULT_SETTINGS = {
    speed: 60,        // px/s
    font: 56,         // px
    line: 140,        // % (1.40)
    margin: 6,        // % de margem lateral
    jump: 300,        // px por pulso de avanco ou retorno
    color: '#ffffff',
    countdown: 3,     // 0, 3 ou 5 segundos
    mirrorH: false,
    mirrorV: false,
    guide: true,
    wake: true,
    fullscreen: true
  };

  /* Cada acao aceita varios "comandos". Um comando e o code (ou key) de uma tecla,
     ou um dos gestos abaixo, para quando o pedal esta em modo de toque. */
  var DEFAULT_KEYS = {
    playPause: ['PageDown', 'ArrowDown', 'ArrowRight', 'Space', 'Enter',
      'SwipeDown', 'SwipeLeft', 'WheelDown', 'WheelLeft'],
    back: ['PageUp', 'ArrowUp', 'ArrowLeft',
      'SwipeUp', 'SwipeRight', 'WheelUp', 'WheelRight'],
    forward: [],
    faster: ['Equal', 'NumpadAdd'],
    slower: ['Minus', 'NumpadSubtract'],
    top: ['Home']
  };

  var GESTURE_LABEL = {
    SwipeUp: 'Swipe para cima', SwipeDown: 'Swipe para baixo',
    SwipeLeft: 'Swipe para a esquerda', SwipeRight: 'Swipe para a direita',
    WheelUp: 'Roda para cima', WheelDown: 'Roda para baixo',
    WheelLeft: 'Roda para a esquerda', WheelRight: 'Roda para a direita'
  };
  function tokenLabel(t) { return GESTURE_LABEL[t] || t; }

  var ACTIONS = [
    { id: 'playPause', name: 'Iniciar e pausar', pulse: false },
    { id: 'back', name: 'Voltar (pulo)', pulse: true },
    { id: 'forward', name: 'Avancar (pulo)', pulse: true },
    { id: 'faster', name: 'Mais rapido', pulse: true },
    { id: 'slower', name: 'Mais devagar', pulse: true },
    { id: 'top', name: 'Ir ao inicio', pulse: false }
  ];

  // copia profunda: os arrays do padrao nunca podem ser compartilhados com o mapa em uso
  function defaultKeys() { return JSON.parse(JSON.stringify(DEFAULT_KEYS)); }

  var settings = Object.assign({}, DEFAULT_SETTINGS, Store.read(K_SETTINGS, {}));
  var keymap = Object.assign(defaultKeys(), Store.read(K_KEYS, {}));
  var scripts = Store.read(K_SCRIPTS, null);

  function saveSettings() { Store.write(K_SETTINGS, settings); }
  function saveKeys() { Store.write(K_KEYS, keymap); }
  function saveScripts() { Store.write(K_SCRIPTS, scripts); }

  var EXAMPLE = [
    'Bem vindo ao teleprompter.',
    '',
    'Este texto de exemplo pode ser apagado. Ele serve para voce testar a leitura e os controles antes de gravar.',
    '',
    'Pedal Bluetooth: um toque inicia e pausa a rolagem. O toque do outro lado volta um trecho. Isso vale para os modos de tecla e para os modos de toque, em que o pedal simula deslize na tela. Se o seu pedal estiver em outro modo, abra a tela Pedal e veja ao vivo o que ele envia.',
    '',
    'Voz: toque no microfone e fale iniciar, pausar, mais rapido, mais devagar, voltar ou recomecar.',
    '',
    'Ajustes: tamanho da fonte, altura de linha, margem, cor e espelhamento. Ligue o espelho horizontal quando usar o teleprompter fisico com vidro.',
    '',
    'Boa gravacao.'
  ].join('\n');

  if (!Array.isArray(scripts)) {
    scripts = [{
      id: 'exemplo',
      title: 'Como usar o teleprompter',
      text: EXAMPLE,
      created: Date.now(),
      updated: Date.now()
    }];
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
  function newId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function fmtDate(ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ============================ Navegacao ============================ */

  var current = 'library';
  var VIEWS = { library: $('#view-library'), editor: $('#view-editor'), prompter: $('#view-prompter'), pedal: $('#view-pedal') };

  function show(name) {
    if (current === 'prompter' && name !== 'prompter') Prompter.leave();
    if (current === 'pedal' && name !== 'pedal') Pedal.leave();
    Object.keys(VIEWS).forEach(function (k) { VIEWS[k].classList.toggle('is-active', k === name); });
    current = name;
    if (name === 'library') Library.render();
    if (name === 'pedal') Pedal.enter();
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
        var card = el('button', 'card');
        card.type = 'button';
        card.innerHTML = '<svg class="ic"><use href="#i-doc"></use></svg>';
        var main = el('div', 'card-main');
        main.appendChild(el('div', 'card-title', s.title || 'Sem titulo'));
        var preview = (s.text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        main.appendChild(el('div', 'card-sub', fmtDate(s.updated) + (preview ? '  ' + preview : '')));
        card.appendChild(main);
        card.addEventListener('click', function () { Editor.open(s.id); });

        var go = el('button', 'card-go');
        go.type = 'button';
        go.title = 'Apresentar';
        go.setAttribute('aria-label', 'Apresentar');
        go.innerHTML = '<svg class="ic"><use href="#i-play"></use></svg>';
        go.addEventListener('click', function (ev) { ev.stopPropagation(); Prompter.open(s.id); });

        var row = el('div', 'card-row');
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
    timer: null,
    open: function (id) {
      var s = findScript(id);
      if (!s) return;
      Editor.id = id;
      $('#editor-title').value = s.title || '';
      $('#editor-text').value = s.text || '';
      $('#save-state').textContent = 'Salvo';
      show('editor');
    },
    queueSave: function () {
      $('#save-state').textContent = 'Salvando';
      clearTimeout(Editor.timer);
      Editor.timer = setTimeout(Editor.saveNow, 500);
    },
    saveNow: function () {
      clearTimeout(Editor.timer);
      var s = findScript(Editor.id);
      if (!s) return;
      s.title = $('#editor-title').value.trim() || 'Sem titulo';
      s.text = $('#editor-text').value;
      s.updated = Date.now();
      saveScripts();
      $('#save-state').textContent = 'Salvo';
    },
    create: function () {
      var s = { id: newId(), title: 'Novo roteiro', text: '', created: Date.now(), updated: Date.now() };
      scripts.push(s);
      saveScripts();
      Editor.open(s.id);
      setTimeout(function () { $('#editor-title').select(); }, 60);
    },
    duplicate: function () {
      Editor.saveNow();
      var s = findScript(Editor.id);
      if (!s) return;
      var copy = { id: newId(), title: s.title + ' (copia)', text: s.text, created: Date.now(), updated: Date.now() };
      scripts.push(copy);
      saveScripts();
      Editor.open(copy.id);
    },
    remove: function () {
      var s = findScript(Editor.id);
      if (!s) return;
      if (!confirm('Apagar o roteiro "' + s.title + '"? Nao da para desfazer.')) return;
      scripts = scripts.filter(function (x) { return x.id !== s.id; });
      saveScripts();
      show('library');
    }
  };

  $('#btn-new').addEventListener('click', Editor.create);
  $('#btn-editor-back').addEventListener('click', function () { Editor.saveNow(); show('library'); });
  $('#btn-duplicate').addEventListener('click', Editor.duplicate);
  $('#btn-delete').addEventListener('click', Editor.remove);
  $('#editor-title').addEventListener('input', Editor.queueSave);
  $('#editor-text').addEventListener('input', Editor.queueSave);
  $('#btn-present').addEventListener('click', function () { Editor.saveNow(); Prompter.open(Editor.id); });

  /* ============================ Prompter ============================ */

  var Prompter = {
    id: null,
    raf: 0,
    lastT: 0,
    offset: 0,
    cur: 0,          // velocidade instantanea (com suavizacao)
    playing: false,
    maxOffset: 1,
    wakeLock: null,
    pendingPlay: false,
    playAt: 0,
    cdShown: -1,

    /* Fonte unica de verdade: o prompter esta aberto se a view esta na tela.
       Nao existe mais um booleano paralelo que possa dessincronizar e desligar
       teclado, gestos e voz em silencio. */
    isOpen: function () { return VIEWS.prompter.classList.contains('is-active'); },

    open: function (id) {
      var s = findScript(id) || mostRecentScript();
      if (!s) { Editor.create(); return; }          // biblioteca vazia: leva para o editor
      Prompter.id = s.id;
      $('#scroller').textContent = (s.text || '').length ? s.text : 'Roteiro vazio. Volte e escreva o texto.';
      Prompter.offset = 0;
      Prompter.cur = 0;
      Prompter.playing = false;

      // 1) primeiro o essencial, na ordem em que depende do layout
      show('prompter');
      safe(Settings.applyToPrompter);
      Prompter.measure();
      Prompter.paint();
      Prompter.updatePlayIcon();
      Prompter.startLoop();
      Prompter.countdownThenPlay();
      // segunda medicao depois do primeiro quadro, quando a view ja tem altura real
      requestAnimationFrame(function () {
        if (!Prompter.isOpen()) return;
        Prompter.measure();
        Prompter.paint();
      });

      // 2) so entao o que pode falhar no aparelho (TWA, permissao, navegador antigo).
      //    Falhar aqui nunca pode impedir a rolagem, a contagem ou o pedal.
      safe(Prompter.requestFullscreen);
      safe(Prompter.requestWakeLock);
    },

    leave: function () {
      Prompter.playing = false;
      Prompter.pendingPlay = false;
      Prompter.stopLoop();
      $('#countdown').hidden = true;
      Prompter.cdShown = -1;
      Voice.stop();
      safe(Prompter.releaseWakeLock);
      safe(Prompter.exitFullscreen);
    },

    measure: function () {
      var sc = $('#scroller'), st = $('#stage');
      Prompter.maxOffset = Math.max(1, sc.offsetHeight - st.clientHeight);
      if (Prompter.offset > Prompter.maxOffset) Prompter.offset = Prompter.maxOffset;
    },

    paint: function () {
      $('#scroller').style.transform = 'translate3d(0,' + (-Prompter.offset) + 'px,0)';
      var pct = Math.max(0, Math.min(1, Prompter.offset / Prompter.maxOffset));
      $('#progress-bar').style.width = (pct * 100).toFixed(2) + '%';
    },

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
    ensureLoop: function () {
      if (Prompter.isOpen() && !Prompter.raf) Prompter.startLoop();
    },

    tick: function (t) {
      if (!Prompter.isOpen()) { Prompter.raf = 0; return; }
      if (!Prompter.lastT) Prompter.lastT = t;
      var dt = Math.min(0.05, (t - Prompter.lastT) / 1000);
      Prompter.lastT = t;

      // o layout pode nao estar pronto no primeiro quadro; insiste ate ter altura real
      if (Prompter.maxOffset <= 2) Prompter.measure();

      /* Contagem regressiva e play automatico moram aqui, no laco de animacao,
         em vez de um setTimeout: assim nao dependem de temporizador que o sistema
         possa atrasar ou engolir, e o play automatico sempre acontece. */
      if (Prompter.pendingPlay) {
        var left = Prompter.playAt - Date.now();
        if (left <= 0) {
          Prompter.pendingPlay = false;
          Prompter.cdShown = -1;
          $('#countdown').hidden = true;
          Prompter.play();
        } else {
          var secs = Math.ceil(left / 1000);
          if (secs !== Prompter.cdShown) {
            Prompter.cdShown = secs;
            $('#countdown-num').textContent = String(secs);
          }
        }
      }

      var target = Prompter.playing ? settings.speed : 0;
      // aceleracao e desaceleracao suaves, independentes da taxa de quadros.
      // Pausar leva cerca de 0,7 s e escorrega poucos pixels, sem parada seca.
      var k = Prompter.playing ? 4.5 : 6;
      Prompter.cur += (target - Prompter.cur) * (1 - Math.exp(-k * dt));
      if (Math.abs(target - Prompter.cur) < 1.5) Prompter.cur = target;

      if (Prompter.cur !== 0) {
        Prompter.offset += Prompter.cur * dt;
        if (Prompter.offset >= Prompter.maxOffset) {
          Prompter.offset = Prompter.maxOffset;
          Prompter.playing = false;
          Prompter.cur = 0;
          Prompter.updatePlayIcon();
        }
        if (Prompter.offset < 0) Prompter.offset = 0;
        Prompter.paint();
      }
      Prompter.raf = requestAnimationFrame(Prompter.tick);
    },

    play: function () {
      if (!Prompter.isOpen()) return;   // sem prompter na tela, nada de estado fantasma
      Prompter.cancelCountdown();
      Prompter.ensureLoop();
      if (Prompter.playing) return;
      if (Prompter.maxOffset <= 2) Prompter.measure();
      if (Prompter.offset >= Prompter.maxOffset) Prompter.offset = 0;
      Prompter.playing = true;
      Prompter.updatePlayIcon();
    },
    pause: function () {
      if (!Prompter.isOpen()) return;
      Prompter.cancelCountdown();
      Prompter.ensureLoop();
      if (!Prompter.playing) return;
      Prompter.playing = false;
      Prompter.updatePlayIcon();
    },
    toggle: function () {
      if (Prompter.playing) Prompter.pause(); else Prompter.play();
    },
    cancelCountdown: function () {
      Prompter.pendingPlay = false;
      Prompter.cdShown = -1;
      $('#countdown').hidden = true;
    },
    jump: function (px) {
      if (!Prompter.isOpen()) return;
      Prompter.offset = Math.max(0, Math.min(Prompter.maxOffset, Prompter.offset + px));
      Prompter.paint();
    },
    toTop: function () {
      if (!Prompter.isOpen()) return;
      Prompter.offset = 0;
      Prompter.cur = 0;
      Prompter.paint();
    },
    changeSpeed: function (delta) {
      settings.speed = Math.max(10, Math.min(300, settings.speed + delta));
      saveSettings();
      Settings.syncControls();
      Prompter.updateSpeedTag();
    },
    updateSpeedTag: function () { $('#speed-tag').textContent = settings.speed + ' px/s'; },
    updatePlayIcon: function () {
      $('#pc-play').innerHTML = '<svg class="ic"><use href="#' + (Prompter.playing ? 'i-pause' : 'i-play') + '"></use></svg>';
      $('#prompter-controls').classList.toggle('dim', Prompter.playing);
    },

    countdownThenPlay: function () {
      var n = settings.countdown | 0;
      if (!(n > 0)) { Prompter.cancelCountdown(); Prompter.play(); return; }
      Prompter.pendingPlay = true;
      Prompter.playAt = Date.now() + n * 1000;
      Prompter.cdShown = n;
      $('#countdown-num').textContent = String(n);
      $('#countdown').hidden = false;
      Prompter.ensureLoop();
    },

    requestWakeLock: function () {
      if (!settings.wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
      var p = navigator.wakeLock.request('screen');
      if (!p || !p.then) return;
      p.then(function (lock) {
        Prompter.wakeLock = lock;
        if (lock && lock.addEventListener) {
          lock.addEventListener('release', function () { Prompter.wakeLock = null; });
        }
      }).catch(function () { /* negado, sem bateria, ou aparelho sem suporte */ });
    },
    releaseWakeLock: function () {
      var lock = Prompter.wakeLock;
      Prompter.wakeLock = null;
      if (lock && lock.release) safe(function () { return lock.release(); });
    },

    // Instalado como PWA em modo fullscreen (a TWA do Android), o pedido explicito
    // falha e devolve promessa rejeitada. Nao pedimos nesse caso, e se pedirmos,
    // a rejeicao e engolida: fullscreen nunca e pre requisito para nada.
    alreadyImmersive: function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) return true;
      if (!window.matchMedia) return false;
      return window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: standalone)').matches;
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

  $('#pc-exit').addEventListener('click', function () { show('library'); });
  $('#pc-top').addEventListener('click', function () { Prompter.toTop(); });
  $('#pc-slower').addEventListener('click', function () { Prompter.changeSpeed(-10); });
  $('#pc-faster').addEventListener('click', function () { Prompter.changeSpeed(10); });
  $('#pc-play').addEventListener('click', function () { Prompter.toggle(); });
  $('#pc-mic').addEventListener('click', function () { Voice.toggle(); });
  $('#pc-settings').addEventListener('click', function () { Prompter.pause(); Settings.open(); });

  // toque na tela alterna play e pausa (fora dos controles).
  // Deslize nao conta como toque: quem trata e a camada de gestos.
  VIEWS.prompter.addEventListener('click', function (ev) {
    if (ev.target.closest('.prompter-controls')) return;
    if (!$('#panel-settings').hidden) return;
    if (Date.now() - Gestures.swipeAt < 350) return;
    Prompter.toggle();
  });

  window.addEventListener('resize', function () {
    if (Prompter.isOpen()) { Prompter.measure(); Prompter.paint(); }
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { if (Prompter.isOpen()) { Prompter.measure(); Prompter.paint(); } }, 250);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !Prompter.isOpen()) return;
    safe(Prompter.requestWakeLock);
    Prompter.ensureLoop();
    Voice.resumeIfWanted();
  });

  /* ============================ Ajustes ============================ */

  var Settings = {
    open: function () { $('#panel-settings').hidden = false; Settings.syncControls(); },
    close: function () { $('#panel-settings').hidden = true; },

    applyToPrompter: function () {
      var sc = $('#scroller'), st = $('#stage');
      sc.style.setProperty('--fsize', settings.font + 'px');
      sc.style.setProperty('--lheight', (settings.line / 100).toFixed(2));
      sc.style.setProperty('--pad', settings.margin + '%');
      sc.style.setProperty('--tcolor', settings.color);
      st.classList.toggle('mirror-h', !!settings.mirrorH);
      st.classList.toggle('mirror-v', !!settings.mirrorV);
      $('#guide').hidden = !settings.guide;
      Prompter.updateSpeedTag();
      if (Prompter.isOpen()) requestAnimationFrame(function () { Prompter.measure(); Prompter.paint(); });
    },

    syncControls: function () {
      $('#s-speed').value = settings.speed; $('#v-speed').textContent = settings.speed + ' px/s';
      $('#s-font').value = settings.font; $('#v-font').textContent = settings.font + ' px';
      $('#s-line').value = settings.line; $('#v-line').textContent = (settings.line / 100).toFixed(2);
      $('#s-margin').value = settings.margin; $('#v-margin').textContent = settings.margin + '%';
      $('#s-jump').value = settings.jump; $('#v-jump').textContent = settings.jump + ' px';
      $('#s-mirror-h').checked = !!settings.mirrorH;
      $('#s-mirror-v').checked = !!settings.mirrorV;
      $('#s-guide').checked = !!settings.guide;
      $('#s-wake').checked = !!settings.wake;
      $('#s-fullscreen').checked = !!settings.fullscreen;
      Array.prototype.forEach.call($('#s-color').children, function (b) {
        b.classList.toggle('on', b.dataset.color === settings.color);
      });
      Array.prototype.forEach.call($('#s-countdown').children, function (b) {
        b.classList.toggle('on', Number(b.dataset.cd) === Number(settings.countdown));
      });
    },

    bind: function () {
      var live = function (id, key, fmt) {
        $(id).addEventListener('input', function () {
          settings[key] = Number(this.value);
          saveSettings();
          Settings.applyToPrompter();
          Settings.syncControls();
          if (fmt) fmt();
        });
      };
      live('#s-speed', 'speed');
      live('#s-font', 'font');
      live('#s-line', 'line');
      live('#s-margin', 'margin');
      live('#s-jump', 'jump');

      var flag = function (id, key) {
        $(id).addEventListener('change', function () {
          settings[key] = this.checked;
          saveSettings();
          Settings.applyToPrompter();
          if (key === 'wake') { if (this.checked) Prompter.requestWakeLock(); else Prompter.releaseWakeLock(); }
        });
      };
      flag('#s-mirror-h', 'mirrorH');
      flag('#s-mirror-v', 'mirrorV');
      flag('#s-guide', 'guide');
      flag('#s-wake', 'wake');
      flag('#s-fullscreen', 'fullscreen');

      $('#s-color').addEventListener('click', function (ev) {
        var b = ev.target.closest('.chip'); if (!b) return;
        settings.color = b.dataset.color; saveSettings(); Settings.applyToPrompter(); Settings.syncControls();
      });
      $('#s-countdown').addEventListener('click', function (ev) {
        var b = ev.target.closest('.chip'); if (!b) return;
        settings.countdown = Number(b.dataset.cd); saveSettings(); Settings.syncControls();
      });

      $('#btn-open-settings').addEventListener('click', Settings.open);
      $('#btn-settings-close').addEventListener('click', Settings.close);
      $('#panel-settings').addEventListener('click', function (ev) {
        if (ev.target === this) Settings.close();
      });
      $('#btn-settings-pedal').addEventListener('click', function () {
        Settings.close();
        show('pedal');
      });
      $('#app-version').textContent = 'Versao ' + APP_VERSION + '. Funciona offline depois da primeira abertura.';
    }
  };
  Settings.bind();

  /* ============================ Pedal e teclado ============================ */

  function keyId(ev) { return ev.code || ev.key; }

  // aceita varios candidatos (code e key da tecla, ou o nome do gesto)
  function actionForToken() {
    var cands = Array.prototype.slice.call(arguments).filter(Boolean);
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i], arr = keymap[a.id] || [];
      for (var j = 0; j < arr.length; j++) {
        if (cands.indexOf(arr[j]) !== -1) return a;
      }
    }
    return null;
  }

  var Pedal = {
    log: [],
    capturing: null,

    enter: function () { Pedal.renderMonitor(); Pedal.renderMapping(); },
    leave: function () { Pedal.capturing = null; $('#capture-overlay').hidden = true; },

    push: function (rec) {
      rec.t = new Date();
      Pedal.log.unshift(rec);
      if (Pedal.log.length > 10) Pedal.log.length = 10;
      if (current === 'pedal') Pedal.renderMonitor();
    },

    renderMonitor: function () {
      var box = $('#key-monitor');
      box.innerHTML = '';
      if (!Pedal.log.length) { box.appendChild(el('p', 'hint', 'Aguardando teclas e gestos.')); return; }
      Pedal.log.forEach(function (r, i) {
        var line = el('div', 'k-line' + (i === 0 ? ' fresh' : ''));
        var hh = function (n) { return (n < 10 ? '0' : '') + n; };
        line.appendChild(el('span', 'k-dim', hh(r.t.getHours()) + ':' + hh(r.t.getMinutes()) + ':' + hh(r.t.getSeconds())));
        if (r.kind === 'wheel') {
          line.appendChild(el('span', null, 'wheel'));
          line.appendChild(el('span', null, 'deltaY: ' + (r.dy > 0 ? '+' : '') + r.dy));
          line.appendChild(el('span', null, 'deltaX: ' + (r.dx > 0 ? '+' : '') + r.dx));
          line.appendChild(el('span', null, 'comando: ' + r.token));
        } else if (r.kind === 'swipe') {
          line.appendChild(el('span', null, 'swipe'));
          line.appendChild(el('span', null, tokenLabel(r.token).toLowerCase()));
          line.appendChild(el('span', null, r.dist + ' px'));
          line.appendChild(el('span', null, 'comando: ' + r.token));
        } else {
          line.appendChild(el('span', null, 'key: ' + (r.key === ' ' ? '(espaco)' : r.key)));
          line.appendChild(el('span', null, 'code: ' + (r.code || 'sem code')));
          line.appendChild(el('span', null, 'keyCode: ' + r.keyCode));
          line.appendChild(el('span', r.repeat ? null : 'k-dim', 'repeat: ' + (r.repeat ? 'sim' : 'nao')));
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
        var add = el('button', 'btn', 'Definir comando');
        add.type = 'button';
        add.addEventListener('click', function () { Pedal.startCapture(a); });
        head.appendChild(add);
        item.appendChild(head);

        var keys = el('div', 'keys');
        var arr = keymap[a.id] || [];
        if (!arr.length) keys.appendChild(el('span', 'hint', 'Sem comando definido.'));
        arr.forEach(function (code) {
          var tag = el('span', 'key-tag' + (GESTURE_LABEL[code] ? ' gesture' : ''));
          tag.appendChild(el('span', null, tokenLabel(code)));
          var x = el('button', null, 'x');
          x.type = 'button';
          x.title = 'Remover';
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

    startCapture: function (action) {
      Pedal.capturing = action;
      $('#capture-action').textContent = 'Acao: ' + action.name;
      $('#capture-overlay').hidden = false;
    },
    endCapture: function (code) {
      var a = Pedal.capturing;
      Pedal.capturing = null;
      $('#capture-overlay').hidden = true;
      if (!a || !code) return;
      var arr = keymap[a.id] || (keymap[a.id] = []);
      if (arr.indexOf(code) === -1) arr.push(code);
      saveKeys();
      Pedal.renderMapping();
    }
  };

  $('#btn-open-pedal').addEventListener('click', function () { show('pedal'); });
  $('#btn-pedal-back').addEventListener('click', function () { show('library'); });
  $('#btn-clear-monitor').addEventListener('click', function () { Pedal.log = []; Pedal.renderMonitor(); });
  $('#btn-capture-cancel').addEventListener('click', function () { Pedal.endCapture(null); });
  $('#btn-reset-keys').addEventListener('click', function () {
    if (!confirm('Restaurar o mapeamento padrao do pedal?')) return;
    keymap = defaultKeys();
    saveKeys();
    Pedal.renderMapping();
  });

  // Um unico listener global de teclado para todo o aplicativo.
  document.addEventListener('keydown', function (ev) {
    if (Pedal.capturing) {
      ev.preventDefault();
      Pedal.push({ kind: 'key', key: ev.key, code: ev.code, keyCode: ev.keyCode, repeat: !!ev.repeat });
      if (ev.key === 'Escape') { Pedal.endCapture(null); return; }
      Pedal.endCapture(keyId(ev));
      return;
    }

    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // digitacao nao polui o monitor

    if (!ev.repeat) Pedal.push({ kind: 'key', key: ev.key, code: ev.code, keyCode: ev.keyCode, repeat: false });

    if (!Prompter.isOpen()) return;
    if (!$('#panel-settings').hidden) {
      if (ev.key === 'Escape') { ev.preventDefault(); Settings.close(); }
      return;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); show('library'); return; }

    var a = actionForToken(ev.code, ev.key);
    if (!a) return;
    if (ev.repeat && !a.pulse) return;   // toggles ignoram autorrepeticao
    ev.preventDefault();
    runAction(a.id);
  }, false);

  /* ---- Pedal em modo de toque: roda do mouse e deslizes na tela ----
     Alguns modos do Cube Turner nao mandam tecla, e sim rolagem ou swipe. */

  var Gestures = {
    lastWheel: 0,
    start: null,
    swipeAt: 0,          // marca o instante do ultimo swipe, para o toque simples nao alternar de novo
    MIN_SWIPE: 40,       // px
    MIN_WHEEL: 8,        // unidades de delta
    WHEEL_GAP: 350,      // ms entre dois comandos de roda

    interested: function () { return Prompter.isOpen() || current === 'pedal' || !!Pedal.capturing; },

    emit: function (token, rec, ev) {
      if (Pedal.capturing) {
        if (ev && ev.cancelable) ev.preventDefault();
        Pedal.push(rec);
        Pedal.endCapture(token);
        return;
      }
      Pedal.push(rec);
      if (!Prompter.isOpen()) return;
      if (!$('#panel-settings').hidden) return;
      var a = actionForToken(token);
      if (!a) return;
      if (ev && ev.cancelable) ev.preventDefault();
      Gestures.swipeAt = Date.now();
      runAction(a.id);
    },

    onWheel: function (ev) {
      if (!Gestures.interested()) return;
      var dx = ev.deltaX || 0, dy = ev.deltaY || 0;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (Math.max(ax, ay) < Gestures.MIN_WHEEL) return;
      var now = Date.now();
      if (now - Gestures.lastWheel < Gestures.WHEEL_GAP) {
        if (Prompter.isOpen() && ev.cancelable) ev.preventDefault();
        return;
      }
      Gestures.lastWheel = now;
      var token = ay >= ax ? (dy > 0 ? 'WheelDown' : 'WheelUp') : (dx > 0 ? 'WheelRight' : 'WheelLeft');
      Gestures.emit(token, { kind: 'wheel', token: token, dx: Math.round(dx), dy: Math.round(dy) }, ev);
    },

    onTouchStart: function (ev) {
      if (!Gestures.interested()) { Gestures.start = null; return; }
      if (!ev.touches || ev.touches.length !== 1) { Gestures.start = null; return; }
      var t = ev.touches[0];
      Gestures.start = { x: t.clientX, y: t.clientY, at: Date.now() };
    },

    onTouchMove: function (ev) {
      // Sem isto o navegador inicia o pull-to-refresh durante o arrasto do
      // pedal em modo toque e recarrega o app no meio da gravacao.
      if (!Gestures.start) return;
      if (!Prompter.isOpen() && !Pedal.capturing) return;
      if (Prompter.isOpen() && !$('#panel-settings').hidden) return;
      if (ev.cancelable) ev.preventDefault();
    },

    onTouchEnd: function (ev) {
      var s = Gestures.start;
      Gestures.start = null;
      if (!s || !ev.changedTouches || ev.changedTouches.length !== 1) return;
      var t = ev.changedTouches[0];
      var dx = t.clientX - s.x, dy = t.clientY - s.y;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      var dist = Math.round(Math.max(ax, ay));
      if (dist < Gestures.MIN_SWIPE) return;      // toque sem deslocamento continua sendo play e pausa
      Gestures.swipeAt = Date.now();
      var token = ay >= ax ? (dy > 0 ? 'SwipeDown' : 'SwipeUp') : (dx > 0 ? 'SwipeRight' : 'SwipeLeft');
      Gestures.emit(token, { kind: 'swipe', token: token, dist: dist }, ev);
    }
  };

  document.addEventListener('wheel', Gestures.onWheel, { passive: false });
  document.addEventListener('touchstart', Gestures.onTouchStart, { passive: true });
  document.addEventListener('touchmove', Gestures.onTouchMove, { passive: false });
  // touchend nao pode ser passivo: precisamos cancelar o clique sintetico do deslize
  document.addEventListener('touchend', Gestures.onTouchEnd, { passive: false });

  function runAction(id) {
    if (id === 'playPause') Prompter.toggle();
    else if (id === 'back') Prompter.jump(-settings.jump);
    else if (id === 'forward') Prompter.jump(settings.jump);
    else if (id === 'faster') Prompter.changeSpeed(10);
    else if (id === 'slower') Prompter.changeSpeed(-10);
    else if (id === 'top') Prompter.toTop();
  }

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
        ? 'Este navegador aceita comando de voz. Exige internet e permissao de microfone. O audio vai para o servico de reconhecimento do navegador.'
        : 'Este navegador nao oferece reconhecimento de voz. Use o pedal ou os botoes.';
      if (!Voice.supported) $('#pc-mic').disabled = true;
    },

    toggle: function () {
      if (!Voice.supported) return;
      if (Voice.wanted) Voice.stop(); else { Voice.wanted = true; Voice.curtas = 0; Voice.spawn(); Voice.paint('Voz ativa'); }
    },

    /* No Chrome do Android a sessao continua morre sozinha, quase sempre com
       "aborted" ou "no-speech", as vezes em menos de um segundo. Enquanto o usuario
       quiser voz e o prompter estiver aberto, religamos sempre. O backoff evita
       laco quente: 350 ms no caso normal, 2 s se a sessao anterior nem durou 1 s. */
    RETRY_FAST: 350,
    RETRY_SLOW: 2000,
    SHORT_LIFE: 1000,

    spawn: function () {
      if (!Voice.supported || !Voice.wanted) return;
      clearTimeout(Voice.retryTimer);
      // solta a sessao anterior antes de criar a nova, para o onend dela nao agendar nada
      var antiga = Voice.rec;
      Voice.rec = null;
      if (antiga) safe(function () { return antiga.abort ? antiga.abort() : antiga.stop(); });

      var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      var r;
      try { r = new Ctor(); } catch (e) { Voice.scheduleRestart(Voice.RETRY_SLOW); return; }
      r.lang = 'pt-BR';
      r.continuous = true;
      r.interimResults = true;   // no Chrome Android o resultado final pode nunca chegar; comandos valem no interim
      r.maxAlternatives = 1;

      r.onresult = function (ev) {
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var res = ev.results[i];
          Voice.handle(res[0].transcript || '', res.isFinal);
        }
      };
      r.onerror = function (ev) {
        var motivo = ev && ev.error;
        // so a falta de permissao e definitiva; o resto e recuperavel
        if (motivo === 'not-allowed' || motivo === 'service-not-allowed') {
          Voice.wanted = false;
          clearTimeout(Voice.retryTimer);
          Voice.paint('Voz bloqueada');
        }
      };
      r.onend = function () {
        if (Voice.rec !== r) return;                       // sessao velha, ignora
        // primeira queda religa rapido; so escalona para 2 s se estiver batendo em looping
        if (Date.now() - Voice.startedAt < Voice.SHORT_LIFE) Voice.curtas++; else Voice.curtas = 0;
        Voice.scheduleRestart(Voice.curtas >= 2 ? Voice.RETRY_SLOW : Voice.RETRY_FAST);
      };

      Voice.rec = r;
      Voice.startedAt = Date.now();
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

    // volta a ouvir ao trazer o aplicativo de volta para a frente
    resumeIfWanted: function () {
      if (!Voice.wanted || !Prompter.isOpen()) return;
      if (Voice.rec && Date.now() - Voice.startedAt < Voice.SHORT_LIFE) return;
      Voice.scheduleRestart(Voice.RETRY_FAST);
    },

    stop: function () {
      Voice.wanted = false;
      clearTimeout(Voice.retryTimer);
      var r = Voice.rec;
      Voice.rec = null;
      if (r) safe(function () { return r.abort ? r.abort() : r.stop(); });
      Voice.paint(null);
    },

    paint: function (text) {
      var f = $('#voice-flag');
      $('#pc-mic').classList.toggle('on', Voice.wanted);
      if (!text) { f.hidden = true; return; }
      f.hidden = false;
      f.textContent = text;
    },

    flash: function (text) {
      Voice.paint(text);
      clearTimeout(Voice.flagTimer);
      Voice.flagTimer = setTimeout(function () { Voice.paint(Voice.wanted ? 'Voz ativa' : null); }, 1200);
    },

    norm: function (s) {
      return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    },

    has: function (text, phrase) {
      var p = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      return new RegExp('(^|\\s)' + p + '($|\\s)').test(text);
    },

    // Ordem importa: frases mais especificas antes das genericas.
    RULES: [
      { act: 'faster', words: ['mais rapido', 'acelera', 'acelerar'] },
      { act: 'slower', words: ['mais devagar', 'devagar', 'desacelera', 'mais lento'] },
      { act: 'top', words: ['do inicio', 'recomecar', 'recomeca', 'voltar ao inicio', 'ir ao inicio'] },
      { act: 'pause', words: ['pausar', 'pausa', 'parar'] },
      { act: 'back', words: ['voltar'] },
      { act: 'play', words: ['iniciar', 'comecar', 'continuar', 'play'] }
    ],

    handle: function (raw, isFinal) {
      if (!Prompter.isOpen()) return;
      var t = Voice.norm(raw);
      if (!t) return;
      // so aceita frase curta e isolada, para o proprio roteiro nao virar comando
      // (interim e ainda mais curto, porque e o comeco de qualquer frase lida)
      if (t.split(' ').length > (isFinal ? 4 : 3)) return;
      for (var i = 0; i < Voice.RULES.length; i++) {
        var rule = Voice.RULES[i];
        for (var j = 0; j < rule.words.length; j++) {
          if (!Voice.has(t, rule.words[j])) continue;
          Voice.run(rule.act, rule.words[j]);
          return;
        }
      }
    },

    lastAct: '', lastAt: 0,

    run: function (act, label) {
      // interim e final da mesma fala chegam duas vezes; nao repete o comando
      var now = Date.now();
      if (act === Voice.lastAct && now - Voice.lastAt < 1500) return;
      Voice.lastAct = act; Voice.lastAt = now;
      if (act === 'play') Prompter.play();
      else if (act === 'pause') Prompter.pause();
      else if (act === 'faster') Prompter.changeSpeed(10);
      else if (act === 'slower') Prompter.changeSpeed(-10);
      else if (act === 'back') Prompter.jump(-settings.jump);
      else if (act === 'top') Prompter.toTop();
      Voice.flash('Voz: ' + label);
    }
  };
  Voice.init();

  /* ============================ Inicio ============================ */

  Settings.syncControls();
  Library.render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* sem offline */ });
    });
  }
})();

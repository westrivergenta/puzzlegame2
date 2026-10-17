/*! maruo-opening.js v1.0.0 — まるおゲーム共通オープニング
 *  「まるおゲーム」の文字ロゴが画面中央から大きくなって近づき、そのまま突き抜けて過ぎ去る演出。
 *  依存なし。<script src="maruo-opening.js"></script> で読み込み、MaruoOpening.play() を呼ぶ。
 *  このファイルの数値・挙動は仕様（AI_GUIDE.md 第3章）と一致させてあるので、改変しないこと。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var FONT_HREF = 'https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&display=swap';
  var playing = false;

  var CSS = [
    '.maruo-op{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;',
    'cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:none}',
    '.maruo-op.maruo-op-out{animation:maruoOpOut .45s ease forwards}',
    '@keyframes maruoOpOut{to{opacity:0;visibility:hidden}}',
    '.maruo-op-logo{font-family:var(--maruo-op-font);color:var(--maruo-op-color);',
    'font-size:min(12vw,14vh,72px);letter-spacing:.04em;white-space:nowrap;line-height:1.2;',
    '-webkit-text-stroke:min(.5vw,.5vh,3px) var(--maruo-op-stroke);paint-order:stroke fill;',
    'text-shadow:0 5px 0 var(--maruo-op-shadow);transform:scale(.02);opacity:0;will-change:transform,opacity}',
    '.maruo-op-logo.maruo-op-play{animation:maruoOpFly var(--maruo-op-dur) forwards}',
    '@keyframes maruoOpFly{',
    '0%{transform:scale(.02);opacity:0;animation-timing-function:linear}',
    '8%{opacity:1}',
    '45%{transform:scale(.55);animation-timing-function:linear}',
    '70%{transform:scale(1.1);opacity:1;animation-timing-function:ease-in}',
    '100%{transform:scale(16);opacity:0}}',
    '.maruo-op-skip{position:absolute;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));',
    'font:12px "M PLUS Rounded 1c",system-ui,sans-serif;color:rgba(255,248,236,.55)}',
    '@media (prefers-reduced-motion: reduce){',
    '@keyframes maruoOpFly{0%{transform:scale(1);opacity:0}25%,75%{transform:scale(1);opacity:1}100%{transform:scale(1);opacity:0}}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('maruo-op-css')) return;
    var st = document.createElement('style');
    st.id = 'maruo-op-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function injectFont() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) if ((links[i].href || '').indexOf('Mochiy+Pop+One') >= 0) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONT_HREF;
    document.head.appendChild(l);
  }
  function waitFont(family, maxMs) {
    var timeout = new Promise(function (r) { setTimeout(r, maxMs); });
    if (!document.fonts || !document.fonts.load) return timeout;
    return Promise.race([document.fonts.load('72px ' + family).catch(function () {}), timeout]);
  }

  /**
   * オープニングを再生する。終了（またはスキップ）後に解決される Promise を返す。
   * @param {Object} [opts]
   * @param {string} [opts.text='まるおゲーム'] ロゴの文字
   * @param {boolean} [opts.loadFont=true] Mochiy Pop One を Google Fonts から読み込む
   */
  function play(opts) {
    if (playing) return Promise.resolve();
    var o = {
      text: 'まるおゲーム',
      background: '#1a1238',
      color: '#fff8ec',
      stroke: '#e8242f',
      shadow: '#8f0f1b',
      fontFamily: '"Mochiy Pop One", "M PLUS Rounded 1c", system-ui, sans-serif',
      duration: 2800,
      fontWaitMax: 900,
      startDelay: 250,
      skipLabel: 'タップでスキップ',
      zIndex: 2147483000,
      loadFont: true
    };
    for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];

    playing = true;
    injectCss();
    if (o.loadFont) injectFont();

    return new Promise(function (resolve) {
      var root = document.createElement('div');
      root.className = 'maruo-op';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', o.text);
      root.style.background = o.background;
      root.style.zIndex = String(o.zIndex);
      root.style.setProperty('--maruo-op-font', o.fontFamily);
      root.style.setProperty('--maruo-op-color', o.color);
      root.style.setProperty('--maruo-op-stroke', o.stroke);
      root.style.setProperty('--maruo-op-shadow', o.shadow);
      root.style.setProperty('--maruo-op-dur', o.duration + 'ms');

      var logo = document.createElement('div');
      logo.className = 'maruo-op-logo';
      logo.textContent = o.text;
      root.appendChild(logo);
      if (o.skipLabel){
        var skip = document.createElement('div');
        skip.className = 'maruo-op-skip';
        skip.textContent = o.skipLabel;
        root.appendChild(skip);
      }
      document.body.appendChild(root);

      var done = false, fallback = null;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(fallback);
        window.removeEventListener('keydown', onKey, true);
        root.classList.add('maruo-op-out');
        setTimeout(function () {
          if (root.parentNode) root.parentNode.removeChild(root);
          playing = false;
          resolve();
        }, 450);
      }
      // オープニング中の入力は「スキップ」だけに使い、ゲーム側へは渡さない
      function onKey(e) { e.preventDefault(); e.stopPropagation(); finish(); }
      root.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); finish(); });
      window.addEventListener('keydown', onKey, true);

      waitFont(o.fontFamily.split(',')[0], o.fontWaitMax).then(function () {
        setTimeout(function () {
          if (done) return;
          logo.classList.add('maruo-op-play');
          logo.addEventListener('animationend', finish, { once: true });
          fallback = setTimeout(finish, o.duration + 600); // animationend が来ない環境の保険
        }, o.startDelay);
      });
    });
  }

  global.MaruoOpening = {
    VERSION: VERSION,
    play: play,
    isPlaying: function () { return playing; }
  };
})(window);

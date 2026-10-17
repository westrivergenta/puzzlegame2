/*! maruo-ranking.js v1.0.0 — まるおゲーム共通ランキング（Supabase＋オフライン同期）
 *  依存なし。<script src="maruo-ranking.js"></script> で読み込み、MaruoRanking.init({...}) を呼ぶ。
 *  1つの Supabase プロジェクトを複数のゲームで共有できる（gameId で区別）。
 *  このファイルの挙動は仕様（AI_GUIDE.md 第4章）と一致させてあるので、改変しないこと。
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var NAME_MAX = 12, SCORE_MAX = 10000000, LIST_LIMIT = 50, SHOW_TOP = 20;
  var SYNC_DELAY = 1500, RETRY_MS = 60000, TIMEOUT_MS = 8000;
  var FONT_HREF = 'https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&family=M+PLUS+Rounded+1c:wght@500;800&display=swap';

  // ---------- 小物 ----------
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (global.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PUB_RE = /^[0-9a-f]{12}$/;
  var GAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
  function cleanName(v) { return String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX); }
  function toInt(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function fmtTime(ms) {
    var d = new Date(ms);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- パネルの見た目 ----------
  var CSS = [
    '.maruo-rk-overlay{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;',
    'padding:16px;background:rgba(20,16,41,.45);-webkit-tap-highlight-color:transparent}',
    '.maruo-rk-card{--c-bg:var(--maruo-card-bg,#fff8ec);--c-ink:var(--maruo-ink,#2a1a12);--c-a1:var(--maruo-accent,#d6336c);',
    '--c-a2:var(--maruo-accent2,#f2b134);--c-a3:var(--maruo-accent3,#2b4a8a);',
    'position:relative;background:var(--c-bg);color:var(--c-ink);border-radius:22px;padding:22px 20px 18px;',
    'width:100%;max-width:360px;max-height:calc(100% - 8px);overflow-y:auto;text-align:center;',
    'box-shadow:0 6px 0 rgba(0,0,0,.25);font-family:"M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Yu Gothic",system-ui,sans-serif}',
    '.maruo-rk-card::before{content:"";position:absolute;left:0;right:0;top:0;height:12px;',
    'background:repeating-linear-gradient(90deg,var(--c-a1) 0 12px,var(--c-a2) 12px 18px,var(--c-a3) 18px 30px,var(--c-a2) 30px 36px)}',
    '.maruo-rk-card h2{font-family:"Mochiy Pop One",system-ui,sans-serif;font-weight:400;font-size:24px;margin:10px 0 8px}',
    '.maruo-rk-me{display:flex;justify-content:center;gap:14px;flex-wrap:wrap;font-size:15px;margin:6px 0}',
    '.maruo-rk-me b{font-family:"Mochiy Pop One",system-ui,sans-serif;font-weight:400;font-size:20px}',
    '.maruo-rk-name{display:flex;gap:8px;justify-content:center;align-items:center;margin:10px 0 4px;font-size:13px}',
    '.maruo-rk-name input{width:11em;font:inherit;font-size:15px;padding:7px 10px;border-radius:10px;',
    'border:2px solid rgba(127,127,127,.4);background:rgba(255,255,255,.7);color:#2a1a12}',
    '.maruo-rk-name input:focus{outline:none;border-color:var(--c-a1)}',
    '.maruo-rk-list{list-style:none;margin:8px 0 0;padding:0;text-align:left;font-size:14px}',
    '.maruo-rk-list li{display:grid;grid-template-columns:2.4em 1fr auto;gap:8px;align-items:center;padding:6px 10px;border-radius:10px}',
    '.maruo-rk-list li:nth-child(odd){background:rgba(127,127,127,.09)}',
    '.maruo-rk-list li.mine{background:rgba(214,51,108,.16);font-weight:800}',
    '.maruo-rk-list .rk{font-family:"Mochiy Pop One",system-ui,sans-serif;text-align:right}',
    '.maruo-rk-list .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.maruo-rk-list .sc{font-variant-numeric:tabular-nums}',
    '.maruo-rk-list .tag{font-size:11px;font-weight:500;opacity:.75;margin-left:4px}',
    '.maruo-rk-list li.sep{background:none;display:block;text-align:center;opacity:.5;padding:2px}',
    '.maruo-rk-status{font-size:12px;opacity:.75;margin:8px 0 0;line-height:1.5}',
    '.maruo-rk-close{margin-top:12px;border:2px solid var(--c-a3);background:transparent;color:inherit;cursor:pointer;',
    'font-family:"Mochiy Pop One",system-ui,sans-serif;font-size:16px;border-radius:16px;padding:10px 22px}',
    '.maruo-rk-close:focus-visible{outline:3px solid var(--c-a2);outline-offset:3px}'
  ].join('');
  function injectCss(loadFont) {
    if (!document.getElementById('maruo-rk-css')) {
      var st = document.createElement('style'); st.id = 'maruo-rk-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    if (loadFont && !document.getElementById('maruo-rk-font')) {
      var l = document.createElement('link'); l.id = 'maruo-rk-font'; l.rel = 'stylesheet'; l.href = FONT_HREF; document.head.appendChild(l);
    }
  }

  /**
   * ランキングを初期化する。
   * @param {Object} opts
   * @param {string} opts.gameId        ゲームID（半角英小文字・数字・ハイフン、1〜32文字。例 'llama-dash'）
   * @param {string} opts.supabaseUrl   Supabase の Project URL（空ならランキング無効・自己ベストのみ）
   * @param {string} opts.supabaseKey   公開用キー（sb_publishable_… または anon public）
   */
  function init(opts) {
    var o = {
      gameId: '', supabaseUrl: '', supabaseKey: '',
      storagePrefix: 'maruo', defaultNamePrefix: 'プレイヤー',
      importLegacy: null, autoSync: true, loadFont: true
    };
    for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (!GAME_RE.test(o.gameId)) throw new Error('MaruoRanking: gameId は半角英小文字・数字・ハイフンの1〜32文字にしてください');

    var URL_ = String(o.supabaseUrl || '').replace(/\/+$/, '');
    var KEY = String(o.supabaseKey || '');
    var enabled = !!(URL_ && KEY);
    var P = o.storagePrefix, G = P + ':' + o.gameId;
    var K = {
      playerId: P + '-player-id', pubId: P + '-pub-id', name: P + '-name',              // 全ゲーム共通（同じ人として扱う）
      best: G + ':best', syncedBest: G + ':synced-best', syncedName: G + ':synced-name', cache: G + ':board-cache' // ゲームごと
    };

    // 以前の保存キーからの引き継ぎ（共通キーがまだ無いときだけ）
    var L = o.importLegacy || {};
    [['playerId', L.playerId], ['pubId', L.pubId], ['name', L.name], ['best', L.best]].forEach(function (p) {
      if (p[1] && ls.get(K[p[0]], null) === null) { var v = ls.get(p[1], null); if (v !== null) ls.set(K[p[0]], v); }
    });

    var playerId = ls.get(K.playerId, '');
    if (!UUID_RE.test(playerId)) { playerId = uuid(); ls.set(K.playerId, playerId); }
    var pubId = ls.get(K.pubId, '');
    if (!PUB_RE.test(pubId)) { pubId = uuid().replace(/-/g, '').slice(0, 12); ls.set(K.pubId, pubId); }
    var name = cleanName(ls.get(K.name, ''));
    if (!name) { name = cleanName(o.defaultNamePrefix + (1000 + Math.floor(Math.random() * 9000))); ls.set(K.name, name); }
    var best = Math.max(0, toInt(ls.get(K.best, '0'), 0));
    var syncedBest = toInt(ls.get(K.syncedBest, '-1'), -1);
    var syncedName = ls.get(K.syncedName, '');
    var cache = null;
    try { cache = JSON.parse(ls.get(K.cache, 'null')); } catch (e) { cache = null; }
    var busy = false, failed = false, listeners = [], panel = null;

    function pending() { return enabled && best > 0 && (best > syncedBest || name !== syncedName); }
    function isOffline() { return navigator.onLine === false || failed; }

    function headers() {
      var h = { 'Content-Type': 'application/json', 'apikey': KEY };
      if (KEY.indexOf('eyJ') === 0) h['Authorization'] = 'Bearer ' + KEY; // 旧形式（JWT）の anon キー
      return h;
    }
    function rpc(fn, body) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
      return fetch(URL_ + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: headers(), body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then(function (t) { return t ? JSON.parse(t) : null; })
        .finally(function () { clearTimeout(timer); });
    }

    function emit() {
      var s = getSummary();
      listeners.slice().forEach(function (f) { try { f(s); } catch (e) {} });
      if (panel) renderPanel();
    }

    // 送信（未送信の自己ベスト・名前変更があれば）→ 最新ランキング取得
    function sync() {
      if (!enabled || busy) return Promise.resolve(getSummary());
      if (navigator.onLine === false) { failed = true; emit(); return Promise.resolve(getSummary()); }
      busy = true; failed = false; emit();
      var sendBest = best, sendName = name;
      var step = pending()
        ? rpc('maruo_submit_score', { p_game_id: o.gameId, p_player_id: playerId, p_pub_id: pubId, p_name: sendName, p_best: sendBest })
            .then(function () {
              syncedBest = Math.max(syncedBest, sendBest); syncedName = sendName;
              ls.set(K.syncedBest, String(syncedBest)); ls.set(K.syncedName, syncedName);
            })
        : Promise.resolve();
      return step
        .then(function () { return rpc('maruo_get_leaderboard', { p_game_id: o.gameId, p_limit: LIST_LIMIT }); })
        .then(function (list) {
          var myRankP = best > 0 ? rpc('maruo_get_rank', { p_game_id: o.gameId, p_best: best }) : Promise.resolve(null);
          return myRankP.then(function (myRank) {
            cache = { list: Array.isArray(list) ? list : [], myRank: myRank, rankFor: best, at: Date.now() };
            ls.set(K.cache, JSON.stringify(cache));
          });
        })
        .catch(function () { failed = true; })
        .then(function () { busy = false; emit(); return getSummary(); });
    }

    // サーバーのランキングに、まだ送れていない自分の記録を重ねて並べ直す
    function mergedList() {
      var list = (cache && cache.list ? cache.list : []).map(function (r) {
        return { pubId: r.pub_id, name: r.name, best: r.best, isMe: r.pub_id === pubId, unsent: false };
      });
      if (best > 0) {
        var mine = null;
        for (var i = 0; i < list.length; i++) if (list[i].isMe) mine = list[i];
        if (mine) { if (best > mine.best) { mine.best = best; mine.unsent = true; } mine.name = name; }
        else list.push({ pubId: pubId, name: name, best: best, isMe: true, unsent: pending() || !cache });
      }
      list.sort(function (a, b) { return b.best - a.best; });
      return list;
    }
    function rankOf(list) {
      for (var i = 0; i < list.length && i < LIST_LIMIT; i++) if (list[i].isMe) return i + 1;
      if (cache && cache.myRank && cache.rankFor === best) return cache.myRank;
      return null;
    }
    function statusText() {
      if (!enabled) return 'ランキングサーバーが未設定です（自己ベストのみ記録されます）';
      var parts = [];
      if (busy) parts.push('ランキングを更新中…');
      else if (isOffline()) parts.push(cache ? 'オフライン中：' + fmtTime(cache.at) + ' 時点のランキングを表示' : 'オフライン中：オンラインになるとランキングが表示されます');
      else if (cache) parts.push(fmtTime(cache.at) + ' に更新');
      if (pending() && !busy) parts.push('自己ベスト ' + best + ' は未送信です。オンラインになると自動で送信されます');
      return parts.join(' ／ ');
    }

    function getSummary() {
      var list = mergedList();
      return {
        enabled: enabled, gameId: o.gameId, name: name, best: best,
        rank: enabled ? rankOf(list) : null,
        pending: pending(), online: !isOffline(), syncing: busy,
        updatedAt: cache ? cache.at : null, status: statusText()
      };
    }

    function reportScore(score) {
      score = Math.max(0, Math.min(SCORE_MAX, Math.floor(Number(score) || 0)));
      var isBest = score > best;
      if (isBest) { best = score; ls.set(K.best, String(best)); }
      emit();
      if (o.autoSync) sync();
      return { score: score, best: best, isBest: isBest };
    }
    function setName(v) {
      var n = cleanName(v);
      if (!n) return false;
      if (n !== name) { name = n; ls.set(K.name, name); emit(); if (o.autoSync) sync(); }
      return true;
    }

    // ---------- ランキングパネル ----------
    function renderPanel() {
      if (!panel) return;
      var p = panel, list = mergedList(), rank = enabled ? rankOf(list) : null;
      p.me.textContent = '';
      var a = el('span'); a.appendChild(document.createTextNode('自己ベスト ')); a.appendChild(el('b', '', String(best))); p.me.appendChild(a);
      if (rank) { var c = el('span'); c.appendChild(document.createTextNode('全体 ')); c.appendChild(el('b', '', rank + '位')); p.me.appendChild(c); }
      if (document.activeElement !== p.input) p.input.value = name;
      p.list.textContent = '';
      function row(r, n) {
        var li = el('li', r.isMe ? 'mine' : '');
        var nm = el('span', 'nm', r.name);
        if (r.isMe) nm.appendChild(el('span', 'tag', r.unsent && enabled ? '（あなた・未送信）' : '（あなた）'));
        li.appendChild(el('span', 'rk', String(n))); li.appendChild(nm); li.appendChild(el('span', 'sc', String(r.best)));
        return li;
      }
      list.slice(0, SHOW_TOP).forEach(function (r, i) { p.list.appendChild(row(r, i + 1)); });
      var myIdx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].isMe) myIdx = i;
      if (myIdx >= SHOW_TOP && rank) { p.list.appendChild(el('li', 'sep', '⋯')); p.list.appendChild(row(list[myIdx], rank)); }
      if (!list.length) p.list.appendChild(el('li', 'sep', enabled ? 'まだ記録がありません' : '—'));
      p.status.textContent = statusText();
    }
    function openPanel() {
      if (panel) return panel.promise;
      injectCss(o.loadFont);
      var overlay = el('div', 'maruo-rk-overlay');
      var card = el('div', 'maruo-rk-card');
      card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'ランキング');
      card.appendChild(el('h2', '', '🏆 ランキング'));
      var me = el('div', 'maruo-rk-me');
      var nameRow = el('div', 'maruo-rk-name');
      var lab = el('label', '', 'ニックネーム'); var inputId = 'maruo-rk-name-' + o.gameId; lab.htmlFor = inputId;
      var input = el('input'); input.id = inputId; input.maxLength = NAME_MAX; input.autocomplete = 'off'; input.setAttribute('enterkeyhint', 'done');
      nameRow.appendChild(lab); nameRow.appendChild(input);
      var list = el('ol', 'maruo-rk-list'), status = el('p', 'maruo-rk-status');
      var close = el('button', 'maruo-rk-close', 'とじる'); close.type = 'button';
      [me, nameRow, list, status, close].forEach(function (n) { card.appendChild(n); });
      overlay.appendChild(card);

      var resolveFn; var promise = new Promise(function (r) { resolveFn = r; });
      panel = { onKey: null, overlay: overlay, me: me, input: input, list: list, status: status, promise: promise, resolve: resolveFn };

      input.addEventListener('change', function () { if (!setName(input.value)) input.value = name; });
      // パネル操作がゲームへ伝わらないようにする
      // 開いている間のキー入力はすべてパネルが受け取り、ゲームへは渡さない
      function onKey(e) {
        if (!overlay.contains(e.target)) { e.preventDefault(); }
        e.stopPropagation();
        if (e.key === 'Escape') closePanel();
        else if (e.key === 'Enter' && e.target === input) input.blur();
      }
      global.addEventListener('keydown', onKey, true);
      panel.onKey = onKey;
      ['pointerdown', 'pointerup', 'click', 'touchstart'].forEach(function (t) {
        overlay.addEventListener(t, function (e) { e.stopPropagation(); });
      });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
      close.addEventListener('click', closePanel);

      document.body.appendChild(overlay);
      renderPanel();
      sync();
      setTimeout(function () { try { close.focus({ preventScroll: true }); } catch (e) {} }, 0);
      return promise;
    }
    function closePanel() {
      if (!panel) return;
      var p = panel; panel = null;
      if (document.activeElement === p.input && !setName(p.input.value)) p.input.value = name;
      global.removeEventListener('keydown', p.onKey, true);
      if (p.overlay.parentNode) p.overlay.parentNode.removeChild(p.overlay);
      p.resolve();
    }

    // ---------- 自動同期 ----------
    global.addEventListener('online', function () { sync(); });
    global.addEventListener('offline', function () { failed = true; emit(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    setInterval(function () { if (pending()) sync(); }, RETRY_MS);
    if (o.autoSync) setTimeout(sync, SYNC_DELAY);

    return {
      reportScore: reportScore,
      getBest: function () { return best; },
      getName: function () { return name; },
      setName: setName,
      getSummary: getSummary,
      getLeaderboard: function () { return mergedList(); },
      sync: sync,
      openPanel: openPanel,
      closePanel: closePanel,
      isPanelOpen: function () { return !!panel; },
      onChange: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
      }
    };
  }

  global.MaruoRanking = { VERSION: VERSION, init: init };
})(window);

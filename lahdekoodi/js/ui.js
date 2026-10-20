/* Reittikartta – yleiset käyttöliittymäosat: kontekstivalikko, dialogit,
 * ilmoitukset, lukemat ja muokkausilmoitus. */
(function (global) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------- kontekstivalikko ----------
  var menuEl, backdrop;
  function isPhone() { return global.matchMedia('(max-width: 700px)').matches; }
  function isTouch() { return global.matchMedia('(pointer: coarse)').matches; }
  // Puhelimessa valikko on yläreunasta avautuva levy: otsikkorivillä Takaisin (alivalikoissa) ja Sulje,
  // taustan napautus sulkee, ja alareunan vihje kertoo, jos valintoja on näkyvän osan alapuolella.
  // opts.back: Takaisin-rivin toiminto. Kohteet: { label, action, checked, key, keepOpen, disabled, sub }, { sep }, { head }.
  function menu(x, y, items, title, opts) {
    opts = opts || {};
    menuEl = menuEl || $('ctxmenu');
    menuEl.innerHTML = '';
    var phone = isPhone(), touch = isTouch();
    menuEl.classList.toggle('sheet', phone);
    if (title || phone) {
      var h = document.createElement('div'); h.className = 'mh';
      if (phone && opts.back) {
        var bk = document.createElement('button'); bk.type = 'button'; bk.className = 'mh-back'; bk.textContent = '\u2039 Takaisin';
        bk.addEventListener('click', function (e) { e.stopPropagation(); opts.back(); });
        h.appendChild(bk);
      }
      var tt = document.createElement('span'); tt.className = 'mh-t'; tt.textContent = title || ''; h.appendChild(tt);
      if (phone) {
        var cx = document.createElement('button'); cx.type = 'button'; cx.className = 'mh-x'; cx.setAttribute('aria-label', 'Sulje'); cx.textContent = '\u2715';
        cx.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); });
        h.appendChild(cx);
      }
      menuEl.appendChild(h);
    }
    var hasChk = items.some(function (it) { return it && (it.checked === true || it.checked === false); });
    items.forEach(function (it) {
      if (!it) return;
      if (it.sep) { var s = document.createElement('div'); s.className = 'sep'; menuEl.appendChild(s); return; }
      if (it.head) { var hd = document.createElement('div'); hd.className = 'mhd'; hd.textContent = it.head; menuEl.appendChild(hd); return; }
      var b = document.createElement('button');
      b.type = 'button';
      if (it.checked === true) b.className = 'chk'; else if (it.checked === false) b.className = 'unchk'; else if (hasChk) b.className = 'nochk';
      var key = it.sub ? '\u203A' : (it.key && !touch ? it.key : '');
      b.innerHTML = '<span>' + esc(it.label) + '</span>' + (key ? '<span class="k">' + esc(key) + '</span>' : '');
      b.disabled = !!it.disabled;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!it.keepOpen) closeMenu();
        if (it.action) it.action();
        if (it.keepOpen) { b.className = b.className === 'chk' ? 'unchk' : 'chk'; }
      });
      menuEl.appendChild(b);
    });
    menuEl.hidden = false;
    if (phone) {
      menuEl.style.left = ''; menuEl.style.top = ''; menuEl.style.maxHeight = '';
      var more = document.createElement('div'); more.className = 'more'; more.textContent = 'Lisää valintoja alempana \u2193';
      menuEl.appendChild(more);
      var upd = function () { more.hidden = menuEl.scrollTop + menuEl.clientHeight >= menuEl.scrollHeight - 6; };
      menuEl.onscroll = upd; menuEl.scrollTop = 0; upd();
      if (!backdrop) {
        backdrop = document.createElement('div'); backdrop.id = 'menuBackdrop';
        backdrop.addEventListener('click', function (e) { e.stopPropagation(); closeMenu(); });
        document.body.appendChild(backdrop);
      }
      backdrop.hidden = false;
      return;
    }
    menuEl.onscroll = null;
    menuEl.style.maxHeight = '';
    var r = menuEl.getBoundingClientRect();
    var vx = Math.min(x, window.innerWidth - r.width - 6);
    var top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6));
    if (top < y && y < 60) top = y;            // ylävalikko pysyy valikkorivin alla ja vierii, jos se ei mahdu
    menuEl.style.left = Math.max(4, vx) + 'px';
    menuEl.style.top = top + 'px';
    menuEl.style.maxHeight = (window.innerHeight - top - 6) + 'px';
    var first = menuEl.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu() {
    if (menuEl) menuEl.hidden = true;
    if (backdrop) backdrop.hidden = true;
    document.querySelectorAll('.mi.open').forEach(function (m) { m.classList.remove('open'); });
  }
  document.addEventListener('mousedown', function (e) {
    if (menuEl && !menuEl.hidden && !menuEl.contains(e.target) && !(e.target.closest && (e.target.closest('.mi') || e.target.closest('#menuBackdrop')))) closeMenu();
  });
  window.addEventListener('blur', closeMenu);

  // ---------- dialogi ----------
  var modalOpen = false;
  function modal(opts) {
    var root = $('modalRoot');
    root.innerHTML = '';
    var m = document.createElement('div');
    m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<h2>' + esc(opts.title || '') + '</h2><div class="mb"></div><div class="mf"></div>';
    var body = m.querySelector('.mb');
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = m.querySelector('.mf');
    (opts.buttons || [{ label: 'Sulje' }]).forEach(function (bt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (bt.primary ? ' primary' : '') + (bt.approve ? ' approve' : '') + (bt.danger ? ' danger' : '');
      b.textContent = bt.label;
      b.addEventListener('click', function () {
        var keep = bt.action ? bt.action(m) === false : false;
        if (!keep) closeModal();
      });
      foot.appendChild(b);
    });
    root.appendChild(m);
    root.hidden = false;
    modalOpen = true;
    root.onmousedown = function (e) { if (e.target === root && opts.dismissable !== false) closeModal(); };
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && opts.enterButton != null) {
        e.preventDefault();
        foot.children[opts.enterButton].click();
      }
    });
    if (opts.onOpen) opts.onOpen(m);
    var f = m.querySelector('input:not([type=checkbox]), select, textarea, .btn.primary');
    if (f) setTimeout(function () { f.focus(); if (f.select && f.tagName === 'INPUT') f.select(); }, 20);
    return m;
  }
  function closeModal() { var root = $('modalRoot'); root.hidden = true; root.innerHTML = ''; modalOpen = false; }

  function confirmBox(text, okLabel, onOk, danger) {
    modal({
      title: 'Vahvista', body: '<p>' + esc(text) + '</p>',
      buttons: [{ label: 'Peruuta' }, { label: okLabel || 'OK', primary: !danger, danger: !!danger, action: function () { onOk(); } }]
    });
  }

  // ---------- ilmoitus ----------
  var toastT;
  function toast(text, bad) {
    var t = $('toast');
    t.textContent = text; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, bad ? 6000 : 3200);
  }

  // ---------- lukemat ----------
  var ro = { v: {} };
  function readout(o) {
    ro.mode = ro.mode || $('roMode');
    if ('mode' in o) ro.mode.textContent = isTouch() ? String(o.mode || '').replace(/klikkaa/g, 'napauta') : (o.mode || '');
    if ('brg' in o) $('roBrg').textContent = o.brg == null ? '–' : global.Geo.fmtBrg(o.brg, 1);
    if ('dist' in o) $('roDist').textContent = o.dist == null ? '–' : global.Geo.fmtNM(o.dist);
    if ('total' in o) $('roTotal').textContent = o.total == null ? '–' : global.Geo.fmtNM(o.total);
    if ('pos' in o) $('roPos').textContent = o.pos ? global.Geo.fmtPos(o.pos) : '–';
    if ('task' in o) {
      document.querySelectorAll('.ro-task').forEach(function (el) { el.hidden = !o.task; });
      if (o.task) $('roTask').textContent = o.task;
    }
    [['brg', 'roBrg'], ['dist', 'roDist'], ['total', 'roTotal']].forEach(function (p) {
      if (!(p[0] in o)) return;
      var v = $(p[1]), empty = o[p[0]] == null;
      v.classList.toggle('empty', empty);
      if (v.previousElementSibling) v.previousElementSibling.classList.toggle('empty', empty);
    });
    ['mode', 'brg', 'dist', 'total', 'task'].forEach(function (k) { if (k in o) ro.v[k] = k === 'mode' ? !!o.mode : o[k] != null && o[k] !== ''; });
    var busy = ro.v.mode || ro.v.brg || ro.v.dist || ro.v.total || ro.v.task;
    $('readout').classList.toggle('idle', !busy);
  }
  function clearMeasure() { readout({ brg: null, dist: null, total: null }); }
  function startClock() {
    var el = $('roClock');
    var tick = function () {
      var d = new Date();
      el.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (v) { return global.Geo.pad(v, 2); }).join(':');
    };
    tick(); setInterval(tick, 1000);
  }

  // ---------- muokkausilmoitus ----------
  function banner(opts) {
    var el = $('editBanner');
    if (!opts) { el.hidden = true; el.innerHTML = ''; return; }
    el.className = opts.kind || '';
    el.innerHTML = '<span class="eb-txt">' + esc(opts.text) + '</span>';
    (opts.buttons || []).forEach(function (b) {
      var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = b.label;
      bt.addEventListener('click', b.action); el.appendChild(bt);
    });
    el.hidden = false;
  }

  // ---------- tiedoston tallennus ----------
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function safeFile(s) { return String(s || 'reitti').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'reitti'; }

  global.UI = {
    $: $, esc: esc, menu: menu, closeMenu: closeMenu, modal: modal, closeModal: closeModal,
    isPhone: isPhone,
    isTouch: isTouch,
    confirm: confirmBox, toast: toast, readout: readout, clearMeasure: clearMeasure, startClock: startClock,
    banner: banner, download: download, safeFile: safeFile,
    get modalOpen() { return modalOpen; }
  };
})(window);

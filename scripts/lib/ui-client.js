/* Nexudus Audit Dashboard — browser client.
 *
 * Vanilla JS, no build step, no framework. Served verbatim at /client.js by
 * ui.js. Talks to the local JSON API (fetch) and the run stream (EventSource).
 * One module-level state object (S); every render reads from it. Kept dependency
 * free so it drops straight into the zero-install repo.
 */
(function () {
  'use strict';

  var S = {
    meta: null,
    type: 'account',            // 'account' | 'onboarding'
    businesses: [],             // [{id, name}]
    bizLoaded: false,
    bizAll: true,               // "All businesses" master toggle
    bizSelected: {},            // id -> true (used only when bizAll === false)
    level: 'medium',            // account depth preset
    useCustom: false,           // account: custom-checks mode
    customChecks: {},           // num(string) -> true
    cache: false,
    es: null,                   // EventSource for the active run
    run: null,                  // latest run snapshot
    sevByNum: {},               // account: check num -> severity
    piiUnlocked: false,         // CLI PII state; pessimistic (locked = slow) until /api/setup answers
    lastActivityAt: 0,          // ms of the last stream event (quiet-period detection)
    ticker: null,               // 1s interval while a run is live
  };

  // ---- tiny DOM helpers ----------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      for (var k in props) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k === 'html') n.innerHTML = props[k];
        else if (k === 'dataset') { for (var d in props[k]) n.dataset[d] = props[k][d]; }
        else if (k.slice(0, 2) === 'on' && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
        else if (props[k] != null) n.setAttribute(k, props[k]);
      }
    }
    if (kids != null) {
      if (!Array.isArray(kids)) kids = [kids];
      kids.forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    }
    return n;
  }
  function show(node, on) { if (node) node.classList[on ? 'remove' : 'add']('hidden'); }
  function fmtBytes(b) {
    if (b == null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function fmtStamp(stamp, mtime) {
    // stamp is "YYYY-MM-DD-HH-MM-SS"; fall back to mtime.
    var d = null;
    var m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(stamp || '');
    if (m) d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    else if (mtime) d = new Date(mtime);
    if (!d || isNaN(d.getTime())) return stamp || '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  // ---- API -----------------------------------------------------------------
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (body) {
        return { ok: r.ok, status: r.status, body: body };
      }).catch(function () {
        return { ok: r.ok, status: r.status, body: null };
      });
    });
  }

  // ---- Setup panel ---------------------------------------------------------
  function renderSetup(s) {
    var wrap = $('#setup-pills');
    clear(wrap);
    if (!s) {
      wrap.appendChild(el('span', { class: 'setup-pill', html: '<span class="dot"></span>Setup status unavailable' }));
      return;
    }
    if (s.busy) {
      wrap.appendChild(el('span', { class: 'setup-pill', html: '<span class="dot"></span>Setup check paused while an audit runs' }));
      return;
    }
    function pill(cls, main, sub) {
      return el('span', { class: 'setup-pill ' + cls }, [
        el('span', { class: 'dot' }),
        el('span', {}, [main, sub ? el('small', { text: '  ' + sub }) : null]),
      ]);
    }
    if (!s.cliFound) {
      wrap.appendChild(pill('bad', 'Nexudus CLI not found', 'contact your administrator'));
      return; // nothing else is meaningful without the CLI
    }
    wrap.appendChild(pill('ok', 'Nexudus CLI ready'));
    if (!s.loggedIn) {
      wrap.appendChild(pill('bad', 'Not signed in', 'run “nexudus login”, then Re-check'));
    } else {
      wrap.appendChild(pill('ok', 'Signed in'));
    }
    if (s.piiUnlocked) {
      wrap.appendChild(pill('amber', 'PII unlocked', 'reports will contain real personal data'));
    }
  }

  function loadSetup(refresh) {
    var wrap = $('#setup-pills');
    clear(wrap);
    wrap.appendChild(el('span', { class: 'setup-pill', html: '<span class="dot"></span>Checking setup…' }));
    api('/api/setup' + (refresh ? '?refresh=1' : '')).then(function (r) {
      var s = r.body;
      // {busy:true} (probe skipped mid-run, no cache) carries no piiUnlocked —
      // keep the last-known value. getSetup's mid-run cached path DOES include it.
      if (s && typeof s.piiUnlocked !== 'undefined') S.piiUnlocked = !!s.piiUnlocked;
      renderSetup(s);
      renderDepth();  // card estimates depend on PII state
    });
  }

  // ---- Businesses ----------------------------------------------------------
  function bizScopeValid() {
    return S.bizAll || Object.keys(S.bizSelected).length > 0;
  }
  function bizScopeString() {
    if (S.bizAll) return 'all';
    return Object.keys(S.bizSelected).join(',');
  }

  // Rebuilds the business picker from S plus the live search box. Full redraw
  // rather than patching rows: the list is short and every toggle can change
  // the master row's meaning (checking "All businesses" clears and disables the
  // individual rows), so re-rendering is simpler than reconciling.
  function renderBiz() {
    var list = $('#biz-list');
    clear(list);
    var filter = ($('#biz-search').value || '').toLowerCase();

    // Master row is always present so "all businesses" works before the list loads.
    var master = el('label', { class: 'biz-row master' }, [
      el('input', { type: 'checkbox' }),
      el('span', { text: 'All businesses' }),
    ]);
    var masterCb = master.querySelector('input');
    masterCb.checked = S.bizAll;
    masterCb.addEventListener('change', function () {
      S.bizAll = masterCb.checked;
      if (S.bizAll) S.bizSelected = {};
      renderBiz();
      syncRunButton();
    });
    list.appendChild(master);

    if (!S.bizLoaded) {
      list.appendChild(el('div', { class: 'banner-loading', text: 'Loading businesses…' }));
      return;
    }
    var shown = S.businesses.filter(function (b) {
      if (!filter) return true;
      return (b.name || '').toLowerCase().indexOf(filter) !== -1 || String(b.id).indexOf(filter) !== -1;
    });
    if (shown.length === 0) {
      list.appendChild(el('div', { class: 'banner-loading', text: 'No businesses match.' }));
      return;
    }
    shown.forEach(function (b) {
      var row = el('label', { class: 'biz-row' }, [
        el('input', { type: 'checkbox' }),
        el('span', { text: b.name || ('Business ' + b.id) }),
        el('span', { class: 'biz-id', text: '#' + b.id }),
      ]);
      var cb = row.querySelector('input');
      cb.checked = !S.bizAll && !!S.bizSelected[b.id];
      cb.disabled = S.bizAll;
      cb.addEventListener('change', function () {
        if (cb.checked) S.bizSelected[b.id] = true;
        else delete S.bizSelected[b.id];
        syncRunButton();
      });
      list.appendChild(row);
    });
  }

  // Fetches the business list. The server refuses to run CLI probes while an
  // audit is active (parallel redacted calls crash the CLI) and answers
  // {busy:true} instead, so this self-reschedules every 4s until the run ends
  // rather than leaving an empty picker behind. Any other failure resolves to
  // an empty list so the "All businesses" path still works.
  function loadBusinesses(refresh) {
    S.bizLoaded = false;
    renderBiz();
    api('/api/businesses' + (refresh ? '?refresh=1' : '')).then(function (r) {
      if (r.body && Array.isArray(r.body.businesses)) {
        S.businesses = r.body.businesses;
        S.bizLoaded = true;
      } else if (r.body && r.body.busy) {
        // A run is active; keep the loading banner and retry shortly.
        setTimeout(function () { loadBusinesses(false); }, 4000);
        return;
      } else {
        S.businesses = [];
        S.bizLoaded = true;
      }
      renderBiz();
    });
  }

  // ---- Depth (account only) ------------------------------------------------
  var SEV_ORDER = ['HIGH', 'MEDIUM', 'LOW', 'INSIGHT'];
  var SEV_LABEL = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', INSIGHT: 'Insight' };

  // Paints the depth-tier cards (plus the Custom card) and the active-selection
  // highlight. Re-run on every state change that can alter a card: type toggle,
  // tier click, and each /api/setup answer — the per-tier time estimate has a
  // locked and an unlocked variant (locked runs are minutes, not seconds) and
  // S.piiUnlocked starts pessimistic, so the first setup answer may flip all
  // three. Early-returns until /api/meta lands; whichever of meta/setup arrives
  // second re-renders with both in hand.
  function renderDepth() {
    show($('#depth-field'), S.type === 'account');
    if (S.type !== 'account' || !S.meta) return;
    var grid = $('#tier-grid');
    clear(grid);
    var counts = S.meta.account.tierCounts || {};
    var estimates = S.meta.account.tierEstimates || {};
    var piiKey = S.piiUnlocked ? 'unlocked' : 'locked';
    var tiers = [
      { key: 'quick', name: 'Quick', desc: 'light data' },
      { key: 'medium', name: 'Medium', desc: 'adds members & contracts' },
      { key: 'thorough', name: 'Thorough', desc: 'full data' },
    ];
    tiers.forEach(function (t) {
      // Omit the time suffix rather than print a blank one if meta predates
      // tierEstimates (e.g. a stale page held open across a server upgrade).
      var time = estimates[t.key] ? estimates[t.key][piiKey] : null;
      var desc = t.desc + (time ? ' · ' + time : '');
      var card = el('div', { class: 'tier-card' + (!S.useCustom && S.level === t.key ? ' active' : '') }, [
        el('div', { class: 'tier-name', text: t.name }),
        el('div', { class: 'tier-meta', text: (counts[t.key] != null ? counts[t.key] + ' checks · ' : '') + desc }),
      ]);
      card.addEventListener('click', function () {
        S.useCustom = false; S.level = t.key;
        show($('#custom-checks'), false);
        renderDepth(); syncRunButton();
      });
      grid.appendChild(card);
    });
    var custom = el('div', { class: 'tier-card' + (S.useCustom ? ' active' : '') }, [
      el('div', { class: 'tier-name', text: 'Custom' }),
      el('div', { class: 'tier-meta', text: 'pick individual checks' }),
    ]);
    custom.addEventListener('click', function () {
      S.useCustom = true;
      renderCustomChecks();
      show($('#custom-checks'), true);
      renderDepth(); syncRunButton();
    });
    grid.appendChild(custom);
  }

  // Builds the Custom tier's per-check picker, grouped by severity in
  // SEV_ORDER so the highest-impact checks are the ones the operator reads
  // first. Selection lives in S.customChecks (num -> true) and is preserved
  // across re-renders; the run button stays disabled while it is empty.
  function renderCustomChecks() {
    var box = $('#custom-checks');
    clear(box);
    if (!S.meta) return;
    var bySev = {};
    S.meta.account.checks.forEach(function (c) {
      var s = c.severity || 'INSIGHT';
      (bySev[s] = bySev[s] || []).push(c);
    });
    SEV_ORDER.forEach(function (sev) {
      if (!bySev[sev]) return;
      box.appendChild(el('div', { class: 'custom-group-title', text: SEV_LABEL[sev] + ' severity' }));
      bySev[sev].forEach(function (c) {
        var row = el('label', { class: 'check-row' }, [
          el('input', { type: 'checkbox' }),
          el('span', { class: 'cnum', text: '#' + c.num }),
          el('span', { text: c.name }),
        ]);
        var cb = row.querySelector('input');
        cb.checked = !!S.customChecks[c.num];
        cb.addEventListener('change', function () {
          if (cb.checked) S.customChecks[c.num] = true;
          else delete S.customChecks[c.num];
          syncRunButton();
        });
        box.appendChild(row);
      });
    });
  }

  // ---- Run button gating ---------------------------------------------------
  function runReady() {
    if (S.run && S.run.status === 'running') return false;
    if (!bizScopeValid()) return false;
    if (S.type === 'account' && S.useCustom && Object.keys(S.customChecks).length === 0) return false;
    return true;
  }
  function syncRunButton() {
    $('#run-btn').disabled = !runReady();
  }

  // ---- Progress rendering --------------------------------------------------
  // Returns {cls, label} for a per-check result pill. The two audits grade
  // differently: onboarding reports pass/warn/fail/skip per check, while the
  // account audit reports a count and takes its colour from the check's own
  // severity (S.sevByNum, populated from /api/meta) — a HIGH check with issues
  // must not look like a LOW one. Anything unrecognised falls through to Pass.
  function pillFor(check) {
    var st = check.status;
    if (st === 'error') return { cls: 'st-error', label: 'Error' };
    if (S.type === 'onboarding') {
      if (st === 'warn') return { cls: 'sev-medium', label: 'Warn' };
      if (st === 'fail') return { cls: 'sev-high', label: 'Fail' };
      if (st === 'skip') return { cls: 'sev-insight', label: 'Skip' };
      return { cls: 'sev-pass', label: 'Pass' };
    }
    // account
    if (st === 'issues' && check.count > 0) {
      var sev = S.sevByNum[check.num] || 'INSIGHT';
      var cls = 'sev-' + sev.toLowerCase();
      return { cls: cls, label: check.count + ' ' + (check.count === 1 ? 'issue' : 'issues') };
    }
    return { cls: 'sev-pass', label: 'Pass' };
  }

  // Replace-or-append by check index: the same check can arrive twice (a live
  // 'check' event, then again inside a reconnect snapshot), so keying the row
  // on its index and swapping it in place keeps the list from doubling up.
  function renderCheckItem(check) {
    var list = $('#check-list');
    var id = 'chk-' + check.index;
    var existing = document.getElementById(id);
    var p = pillFor(check);
    var node = el('div', { class: 'check-item', id: id }, [
      el('span', { class: 'ci-num', text: '#' + check.num }),
      el('span', { class: 'ci-name', text: check.name }),
      el('span', { class: 'pill ' + p.cls, text: p.label }),
    ]);
    if (existing) list.replaceChild(node, existing);
    else list.appendChild(node);
  }

  // "M:SS" since the run started, from the server's startedAt. Clamped at 0
  // because that timestamp is the server's clock and the browser's may be a
  // little behind it, which would otherwise render a negative clock.
  function elapsedStr() {
    if (!S.run || !S.run.startedAt) return '';
    var s = Math.floor((Date.now() - S.run.startedAt) / 1000);
    if (s < 0) s = 0;
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  // Repaints the counter and the bar. `total` is unknown until the first check
  // line is parsed (the audit prints "[i/N]" only once it starts checking), so
  // until then we show a bare done-count and a zero-width bar rather than
  // guessing a denominator.
  function updateProgressBar() {
    var run = S.run;
    if (!run) return;
    var total = run.total || 0;
    var done = run.done || 0;
    var base = total ? (done + ' / ' + total + ' checks') : (done + ' checks…');
    // Show a live elapsed clock only while the run is active so the operator can
    // see it's still working during the long, silent data-fetch gaps between
    // checks (the audit prints a per-check line only after each check finishes).
    var el2 = (run.status === 'running') ? elapsedStr() : '';
    $('#progress-count').textContent = el2 ? (base + ' · ' + el2 + ' elapsed') : base;
    $('#progress-bar').style.width = total ? Math.min(100, Math.round(done / total * 100)) + '%' : '0%';
  }

  // Called on every stream event so the "still working" hint only appears during
  // genuine quiet periods (a slow fetch), not right after fresh output arrived.
  function markActivity() { S.lastActivityAt = Date.now(); }

  function tick() {
    if (!S.run || S.run.status !== 'running') { stopTicker(); return; }
    updateProgressBar();
    // Before the first check completes the audit is in its (silent) data-fetch
    // phase — the worst "looks stuck" moment, especially on the Thorough tier
    // which front-loads the most data. Show a tailored hint straight away.
    // Between checks, only surface the generic hint after a real quiet gap.
    var noChecksYet = !(S.run.done > 0);
    var quiet = Date.now() - (S.lastActivityAt || 0) > 8000;
    $('#progress-hint-text').textContent = noChecksYet
      ? 'Fetching account data before the first check. This first step pulls the most data, so on large accounts (or with privacy redaction on) it can take several minutes.'
      : 'Still working — fetching data for the next check. Larger locations can take a few minutes.';
    show($('#progress-hint'), noChecksYet || quiet);
  }
  function ensureTicker() {
    markActivity();
    if (!S.ticker) S.ticker = setInterval(tick, 1000);
    tick(); // reflect state immediately instead of waiting a second
  }
  function stopTicker() {
    if (S.ticker) { clearInterval(S.ticker); S.ticker = null; }
    show($('#progress-hint'), false);
  }

  function appendWarning(w) {
    var box = $('#warnings');
    show(box, true);
    box.appendChild(el('div', { class: 'warn-line' + (w.level === 'info' ? ' info' : ''), text: w.text }));
  }

  function appendLog(line) {
    var log = $('#raw-log');
    log.appendChild(document.createTextNode(line + '\n'));
    log.scrollTop = log.scrollHeight;
  }

  function progressTitleText() {
    var base = S.type === 'onboarding' ? 'onboarding check-in' : 'account health audit';
    var run = S.run;
    if (!run) return 'Running ' + base + '…';
    if (run.status === 'running') return 'Running ' + base + '…';
    if (run.status === 'cancelled') return 'Audit cancelled';
    if (run.status === 'error') return 'Audit stopped';
    return 'Audit complete';
  }

  function renderRunSummary() {
    var run = S.run;
    var box = $('#run-summary');
    if (!run || run.status === 'running') { show(box, false); return; }
    clear(box);
    box.className = 'run-summary ' + (run.status === 'done' ? 'ok' : 'err');
    show(box, true);

    var title = run.status === 'cancelled' ? 'Audit cancelled.'
      : run.status === 'error' ? (run.error && run.error.message ? run.error.message : 'The audit could not complete.')
      : (run.summary && run.summary.text ? run.summary.text : 'Audit complete.');
    box.appendChild(el('div', { class: 'rs-title', text: title }));

    var actions = el('div', { class: 'rs-actions' });
    if (run.status === 'done' && run.summary && run.summary.reportUrl) {
      actions.appendChild(el('a', {
        class: 'report-link', href: run.summary.reportUrl, target: '_blank', rel: 'noopener', text: 'Open report',
      }));
    }
    actions.appendChild(el('button', { class: 'ghost', onclick: openFolder }, 'Show folder'));
    box.appendChild(actions);
  }

  function showProgressCard() {
    show($('#progress-card'), true);
    $('#progress-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Full re-render from a snapshot (initial connect / reconnect / resync).
  function renderRunSnapshot(run) {
    S.run = run;
    if (!run) return;
    S.type = run.type || S.type;
    showProgressCard();
    $('#progress-title').textContent = progressTitleText();
    clear($('#check-list'));
    (run.checks || []).forEach(renderCheckItem);
    clear($('#warnings'));
    show($('#warnings'), false);
    (run.warnings || []).forEach(appendWarning);
    clear($('#raw-log'));
    (run.log || []).forEach(function (l) { $('#raw-log').appendChild(document.createTextNode(l + '\n')); });
    updateProgressBar();
    renderRunSummary();
    $('#cancel-btn').disabled = run.status !== 'running';
    if (run.status === 'running') ensureTicker(); else stopTicker();
    syncRunButton();
  }

  // ---- Run lifecycle -------------------------------------------------------
  // POSTs the run request. The server answers 202 + {runId} on success (we
  // don't keep the id — the SSE stream is the only thing we need from here),
  // 409 when a run is already going, and 400 with an {error} message when the
  // body fails validation. Everything but 202 leaves the form usable and puts
  // the reason in #run-error, so a rejected start is never a dead button.
  function startRun() {
    var body = { type: S.type, businessIds: bizScopeString(), cache: S.cache };
    if (S.type === 'account') {
      if (S.useCustom) body.checks = Object.keys(S.customChecks).join(',');
      else body.level = S.level;
    }
    $('#run-error').classList.add('hidden');
    $('#run-btn').disabled = true;
    api('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (r.status === 202 && r.body && r.body.runId) {
        // Fresh run: reset the progress card and attach the stream.
        S.run = null;
        clear($('#check-list'));
        clear($('#warnings')); show($('#warnings'), false);
        clear($('#raw-log'));
        show($('#run-summary'), false);
        showProgressCard();
        connectStream();
      } else {
        var msg = (r.body && r.body.error) ? r.body.error
          : r.status === 409 ? 'An audit is already running.'
          : 'Could not start the audit.';
        var e = $('#run-error');
        e.textContent = msg;
        e.classList.remove('hidden');
        syncRunButton();
      }
    });
  }

  // Opens the run stream. Six events; their payloads are documented in the SSE
  // contract block in ui.js next to broadcast(). Lifecycle: at most one
  // EventSource at a time (any existing one is closed first), the browser
  // auto-reconnects if the socket drops, and the server replays a `snapshot` on
  // every connect — so a reconnect resyncs the whole card and we never need to
  // buffer or replay events ourselves. `done` closes the stream deliberately:
  // the run is over, there is nothing left to receive.
  function connectStream() {
    if (S.es) { S.es.close(); S.es = null; }
    var es = new EventSource('/api/run/events');
    S.es = es;
    es.addEventListener('snapshot', function (ev) {
      var run = JSON.parse(ev.data);
      if (run) renderRunSnapshot(run);
    });
    es.addEventListener('scope', function (ev) {
      markActivity();
      var d = JSON.parse(ev.data);
      if (!S.run) S.run = {};
      S.run.type = d.type || S.run.type;
      S.run.total = d.total;
      S.type = S.run.type || S.type;
      $('#progress-title').textContent = progressTitleText();
      updateProgressBar();
    });
    es.addEventListener('check', function (ev) {
      markActivity();
      var d = JSON.parse(ev.data);
      if (!S.run) S.run = { checks: [] };
      if (!S.run.checks) S.run.checks = [];
      S.run.checks[d.index - 1] = d;
      S.run.total = d.total || S.run.total;
      S.run.done = d.done != null ? d.done : (S.run.done || 0);
      renderCheckItem(d);
      updateProgressBar();
    });
    es.addEventListener('log', function (ev) {
      markActivity();
      appendLog(JSON.parse(ev.data).line);
    });
    es.addEventListener('warning', function (ev) {
      markActivity();
      appendWarning(JSON.parse(ev.data));
    });
    es.addEventListener('done', function (ev) {
      var run = JSON.parse(ev.data);
      S.run = run;
      stopTicker();
      $('#progress-title').textContent = progressTitleText();
      $('#cancel-btn').disabled = true;
      updateProgressBar();
      renderRunSummary();
      if (S.es) { S.es.close(); S.es = null; }
      syncRunButton();
      loadReports();
      loadSetup(false);
    });
    // Deliberately a no-op. A transport blip is not a run failure: the browser
    // reconnects by itself and the snapshot-on-connect repaints everything, so
    // surfacing an error here would just flash a scary message mid-run. If the
    // run already finished, the 'done' handler closed es and this never fires.
    es.onerror = function () {};
  }

  function cancelRun() {
    $('#cancel-btn').disabled = true;
    api('/api/run/cancel', { method: 'POST' });
  }

  // ---- Reports -------------------------------------------------------------
  function loadReports() {
    api('/api/reports').then(function (r) {
      var box = $('#reports-list');
      clear(box);
      var items = (r.body && r.body.reports) || [];
      if (items.length === 0) {
        box.appendChild(el('div', { class: 'banner-loading', text: 'No reports yet — run an audit to create one.' }));
        return;
      }
      items.forEach(function (rep) {
        var actions = el('span', { class: 'rr-actions' }, [
          el('a', { class: 'report-link', href: '/report/' + encodeURIComponent(rep.name), target: '_blank', rel: 'noopener', text: 'Open' }),
        ]);
        box.appendChild(el('div', { class: 'report-row' }, [
          el('span', { class: 'rr-type ' + rep.type, text: rep.type === 'onboarding' ? 'Onboarding' : 'Account' }),
          el('span', { class: 'rr-when', text: fmtStamp(rep.stamp, rep.mtime) }),
          el('span', { class: 'rr-size', text: fmtBytes(rep.size) }),
          actions,
        ]));
      });
    });
  }

  function openFolder() {
    api('/api/open-folder', { method: 'POST' });
  }

  // ---- Boot ----------------------------------------------------------------
  function wireStaticControls() {
    // Audit type toggle
    var toggle = $('#type-toggle');
    toggle.querySelectorAll('button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        S.type = btn.dataset.type;
        toggle.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', b === btn); });
        renderDepth();
        syncRunButton();
      });
    });
    $('#biz-search').addEventListener('input', renderBiz);
    $('#biz-refresh').addEventListener('click', function () { loadBusinesses(true); });
    $('#setup-recheck').addEventListener('click', function () { loadSetup(true); });
    $('#opt-cache').addEventListener('change', function (e) { S.cache = e.target.checked; });
    $('#run-btn').addEventListener('click', startRun);
    $('#cancel-btn').addEventListener('click', cancelRun);
    $('#reports-refresh').addEventListener('click', loadReports);
    $('#open-folder').addEventListener('click', openFolder);
  }

  function boot() {
    wireStaticControls();
    renderBiz();          // master row available immediately
    syncRunButton();
    api('/api/meta').then(function (r) {
      S.meta = r.body;
      if (S.meta && S.meta.account && S.meta.account.checks) {
        S.meta.account.checks.forEach(function (c) { S.sevByNum[c.num] = c.severity; });
      }
      renderDepth();
      syncRunButton();
    });
    loadSetup(false);
    loadBusinesses(false);
    loadReports();
    // Reattach to an in-progress run after a reload.
    api('/api/run/state').then(function (r) {
      if (r.body && r.body.run && r.body.run.status === 'running') {
        renderRunSnapshot(r.body.run);
        connectStream();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

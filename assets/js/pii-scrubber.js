(function () {
  'use strict';

  var input = document.getElementById('tool-in');
  var output = document.getElementById('tool-out');
  var meta = document.getElementById('tool-meta');
  var pasteBtn = document.getElementById('paste-btn');
  var copyBtn = document.getElementById('copy-btn');
  var clearBtn = document.getElementById('clear-btn');
  var inLabel = document.getElementById('in-label');
  var outLabel = document.getElementById('out-label');
  var modeScrub = document.getElementById('mode-scrub');
  var modeRestore = document.getElementById('mode-restore');
  var detectorRow = document.getElementById('detector-row');
  var termRow = document.getElementById('term-row');
  var termInput = document.getElementById('term-input');
  var termAdd = document.getElementById('term-add');
  var termChips = document.getElementById('term-chips');
  var mapDetails = document.getElementById('map-details');
  var mapSummary = document.getElementById('map-summary');
  var mapRows = document.getElementById('map-rows');
  var mapClear = document.getElementById('map-clear');
  var setStatus = ToolKit.setStatus;

  var raw = '';

  /* The placeholder ↔ original mapping lives in sessionStorage: it survives
     a reload but stays in this tab and never leaves the machine. */
  function load(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key)) || fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var mapping = load('pii-map', {});   // '[EMAIL-1]' -> 'foo@bar.com'
  var terms = load('pii-terms', []);
  var reverse = {};                    // 'EMAIL:foo@bar.com' -> '[EMAIL-1]'
  var counters = {};                   // 'EMAIL' -> highest index used
  Object.keys(mapping).forEach(function (ph) {
    var m = ph.match(/^\[([A-Z]+)-(\d+)\]$/);
    if (!m) return;
    var tag = m[1];
    reverse[tag + ':' + (tag === 'NAME' ? mapping[ph].toLowerCase() : mapping[ph])] = ph;
    counters[tag] = Math.max(counters[tag] || 0, parseInt(m[2], 10));
  });

  var PLACEHOLDER_RE = /\[[A-Z]+-\d+\]/g;
  var ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* Order matters: emails first (they contain digits), then the specific
     number shapes, then the loose phone pattern last so it can't eat them. */
  var DETECTORS = [
    { box: document.getElementById('det-email'), tag: 'EMAIL', label: 'email',
      re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { box: document.getElementById('det-nric'), tag: 'NRIC', label: 'NRIC/FIN',
      re: /\b[STFGMstfgm]\d{7}[A-Za-z]\b/g },
    { box: document.getElementById('det-card'), tag: 'CARD', label: 'card number',
      re: /\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{2,4}\b|\b\d{15,16}\b/g },
    { box: document.getElementById('det-phone'), tag: 'PHONE', label: 'phone number',
      re: /(?:\+\d{1,3}[ -]?)?(?:\(\d{1,4}\)[ -]?)?\d(?:[ -]?\d){6,11}/g,
      skip: function (match) { return ISO_DATE_RE.test(match); } }
  ];

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function placeholderFor(value, tag) {
    var key = tag + ':' + (tag === 'NAME' ? value.toLowerCase() : value);
    if (reverse[key]) return reverse[key];
    counters[tag] = (counters[tag] || 0) + 1;
    var ph = '[' + tag + '-' + counters[tag] + ']';
    mapping[ph] = value;
    reverse[key] = ph;
    return ph;
  }

  /* Applies a replacement only outside existing [TAG-n] placeholders, so a
     second pass (or a term like "email") can never corrupt one. */
  function replaceOutside(text, re, fn) {
    var parts = text.split(/(\[[A-Z]+-\d+\])/);
    for (var i = 0; i < parts.length; i++) {
      if (!/^\[[A-Z]+-\d+\]$/.test(parts[i])) parts[i] = parts[i].replace(re, fn);
    }
    return parts.join('');
  }

  function scrub(text) {
    var found = [];
    var t = text;
    DETECTORS.forEach(function (d) {
      if (!d.box.checked) return;
      var n = 0;
      t = replaceOutside(t, d.re, function (match) {
        if (d.skip && d.skip(match)) return match;
        n++;
        return placeholderFor(match, d.tag);
      });
      if (n) found.push(n + ' ' + d.label + (n === 1 || d.tag === 'NRIC' ? '' : 's'));
    });
    var names = 0;
    terms.forEach(function (term) {
      var re = new RegExp('\\b' + escRe(term) + '\\b', 'gi');
      t = replaceOutside(t, re, function () {
        names++;
        return placeholderFor(term, 'NAME');
      });
    });
    if (names) found.push(names + ' name' + (names === 1 ? '' : 's'));
    save('pii-map', mapping);
    renderMap();
    return { text: t, notes: found };
  }

  function restore(text) {
    var restored = 0, unknown = 0;
    var t = text.replace(PLACEHOLDER_RE, function (ph) {
      if (mapping[ph] !== undefined) { restored++; return mapping[ph]; }
      unknown++;
      return ph;
    });
    var notes = [restored + ' item' + (restored === 1 ? '' : 's') + ' restored'];
    if (unknown) notes.push(unknown + ' unknown placeholder' + (unknown === 1 ? '' : 's') + ' left as-is');
    return { text: t, notes: notes };
  }

  function isScrub() { return modeScrub.checked; }

  function run(andCopy) {
    if (!raw.trim()) {
      output.value = '';
      meta.textContent = '';
      setStatus('', false);
      return;
    }
    var result = isScrub() ? scrub(raw) : restore(raw);
    output.value = result.text;

    var words = result.text.trim().split(/\s+/).length;
    meta.textContent = result.text.length.toLocaleString() + ' chars · ' + words.toLocaleString() + ' words';

    var verb = isScrub() ? 'Scrubbed' : 'Restored';
    var detail = result.notes.length ? ' · ' + result.notes.join(' · ')
      : (isScrub() ? ' · nothing sensitive found' : '');
    if (andCopy) {
      ToolKit.copyPlain(result.text).then(function () {
        setStatus('✓ ' + verb + ' & copied' + detail, true);
      }, function () {
        setStatus(verb + detail + ' — press Copy to grab it', false);
      });
    } else {
      setStatus(verb + detail + ' — press Copy to grab it', false);
    }
  }

  /* ---------- mapping panel ---------- */

  function renderMap() {
    var keys = Object.keys(mapping);
    mapSummary.textContent = 'Mapping (' + keys.length + ')';
    mapRows.textContent = '';
    keys.forEach(function (ph) {
      var row = document.createElement('div');
      var code = document.createElement('code');
      code.textContent = ph;
      var span = document.createElement('span');
      span.textContent = mapping[ph];
      row.appendChild(code);
      row.appendChild(span);
      mapRows.appendChild(row);
    });
    mapDetails.style.display = keys.length ? '' : 'none';
  }

  mapClear.addEventListener('click', function () {
    mapping = {};
    reverse = {};
    counters = {};
    save('pii-map', mapping);
    renderMap();
    setStatus('Mapping cleared.', false);
  });

  /* ---------- custom terms ---------- */

  function renderTerms() {
    termChips.textContent = '';
    terms.forEach(function (term, idx) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'term-chip';
      chip.setAttribute('aria-label', 'Stop masking ' + term);
      chip.appendChild(document.createTextNode(term + ' '));
      var x = document.createElement('span');
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      chip.appendChild(x);
      chip.addEventListener('click', function () {
        terms.splice(idx, 1);
        save('pii-terms', terms);
        renderTerms();
        if (raw && isScrub()) run(true);
      });
      termChips.appendChild(chip);
    });
  }

  function addTerm() {
    var term = termInput.value.trim();
    if (!term) return;
    var exists = terms.some(function (t) { return t.toLowerCase() === term.toLowerCase(); });
    if (!exists) {
      terms.push(term);
      save('pii-terms', terms);
      renderTerms();
      if (raw && isScrub()) run(true);
    }
    termInput.value = '';
    termInput.focus();
  }

  termAdd.addEventListener('click', addTerm);
  termInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addTerm(); }
  });

  /* ---------- mode switch ---------- */

  function applyMode() {
    var scrubbing = isScrub();
    detectorRow.hidden = !scrubbing;
    termRow.hidden = !scrubbing;
    termChips.hidden = !scrubbing;
    pasteBtn.textContent = scrubbing ? 'Paste & scrub' : 'Paste & restore';
    outLabel.textContent = scrubbing ? 'Scrubbed result' : 'Restored result';
    input.placeholder = scrubbing
      ? 'Press Ctrl+V / ⌘V here — or hit “Paste & scrub”.'
      : 'Paste the AI’s reply here — placeholders become the originals again.';
    output.placeholder = scrubbing
      ? 'Masked text lands here — safe to paste into an AI tool.'
      : 'Restored text lands here, with the real names and numbers back.';
    raw = '';
    input.value = '';
    output.value = '';
    meta.textContent = '';
    setStatus('', false);
  }
  modeScrub.addEventListener('change', applyMode);
  modeRestore.addEventListener('change', applyMode);

  /* ---------- shared paste/copy plumbing ---------- */

  input.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    raw = cd.getData('text/plain');
    input.value = raw;
    run(true);
  });

  input.addEventListener('input', function () {
    raw = input.value;
    run(false);
  });

  pasteBtn.addEventListener('click', function () {
    ToolKit.readClipboard(function (text) {
      if (!text) { setStatus('Nothing here — the clipboard has no text.', false); return; }
      raw = text;
      input.value = text;
      run(true);
    }, function () {
      input.focus();
      setStatus('Clipboard access is blocked here — press ' + ToolKit.pasteKeys + ' in the left box instead.', false);
    });
  });

  copyBtn.addEventListener('click', function () {
    if (!output.value) { setStatus('Nothing to copy yet.', false); return; }
    ToolKit.copyPlain(output.value).then(function () {
      setStatus('✓ Copied to clipboard', true);
    }, function () {
      setStatus('Copy failed — select the text and copy manually.', false);
    });
  });

  clearBtn.addEventListener('click', function () {
    raw = '';
    input.value = '';
    output.value = '';
    meta.textContent = '';
    setStatus('', false);
    input.focus();
  });

  DETECTORS.forEach(function (d) {
    d.box.addEventListener('change', function () {
      if (raw && isScrub()) run(true);
    });
  });

  renderTerms();
  renderMap();
})();

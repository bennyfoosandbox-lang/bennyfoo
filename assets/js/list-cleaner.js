(function () {
  'use strict';

  var input = document.getElementById('tool-in');
  var output = document.getElementById('tool-out');
  var meta = document.getElementById('tool-meta');
  var pasteBtn = document.getElementById('paste-btn');
  var copyBtn = document.getElementById('copy-btn');
  var clearBtn = document.getElementById('clear-btn');
  var setStatus = ToolKit.setStatus;

  var optBullets = document.getElementById('opt-bullets');
  var optTrim = document.getElementById('opt-trim');
  var optEmpty = document.getElementById('opt-empty');
  var optDedupe = document.getElementById('opt-dedupe');
  var optSort = document.getElementById('opt-sort');
  var fmtLines = document.getElementById('fmt-lines');
  var fmtComma = document.getElementById('fmt-comma');
  var fmtSql = document.getElementById('fmt-sql');

  var raw = '';

  var BULLET_RE = /^\s*(?:[-*+•·●▪◦‣–—]|\d{1,3}[.)])\s+/;

  /* One line of commas, semicolons or tabs (a spreadsheet row) is treated
     as a delimited list; otherwise every line is an item. */
  function parseItems(text) {
    var t = text.replace(/\r\n?/g, '\n');
    var nonEmpty = t.split('\n').filter(function (l) { return l.trim(); });
    if (nonEmpty.length === 1) {
      var line = nonEmpty[0];
      if (line.indexOf('\t') !== -1) return line.split('\t');
      if (line.indexOf(';') !== -1) return line.split(';');
      if (line.indexOf(',') !== -1) return line.split(',');
    }
    return t.split('\n');
  }

  function clean(text) {
    var items = parseItems(text);
    var startCount = items.filter(function (s) { return s.trim(); }).length;
    var notes = [];

    if (optBullets.checked) {
      var bullets = 0;
      items = items.map(function (s) {
        var stripped = s.replace(BULLET_RE, '');
        if (stripped !== s) bullets++;
        return stripped;
      });
      if (bullets) notes.push(bullets + ' bullet' + (bullets === 1 ? '' : 's') + ' stripped');
    }
    if (optTrim.checked) {
      items = items.map(function (s) { return s.trim().replace(/[ \t]{2,}/g, ' '); });
    }
    if (optEmpty.checked) {
      var before = items.length;
      items = items.filter(function (s) { return s.trim(); });
      var dropped = before - items.length;
      if (dropped) notes.push(dropped + ' empty line' + (dropped === 1 ? '' : 's') + ' dropped');
    }
    if (optDedupe.checked) {
      var seen = {};
      var before2 = items.length;
      items = items.filter(function (s) {
        var key = s.trim().toLowerCase();
        if (!key && !optEmpty.checked) return true;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      var dups = before2 - items.length;
      if (dups) notes.push(dups + ' duplicate' + (dups === 1 ? '' : 's') + ' removed');
    }
    if (optSort.checked) {
      items.sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
      notes.push('sorted');
    }

    var out;
    if (fmtSql.checked) {
      out = items.map(function (s) { return "'" + s.replace(/'/g, "''") + "'"; }).join(', ');
    } else if (fmtComma.checked) {
      out = items.join(', ');
    } else {
      out = items.join('\n');
    }
    return { text: out, count: items.length, startCount: startCount, notes: notes };
  }

  function run(andCopy) {
    if (!raw.trim()) {
      output.value = '';
      meta.textContent = '';
      setStatus('', false);
      return;
    }
    var result = clean(raw);
    output.value = result.text;
    meta.textContent = result.count.toLocaleString() + ' item' + (result.count === 1 ? '' : 's');

    var head = result.startCount === result.count
      ? result.count + ' items'
      : result.startCount + ' → ' + result.count + ' items';
    var detail = ' · ' + head + (result.notes.length ? ' · ' + result.notes.join(' · ') : '');
    if (andCopy) {
      ToolKit.copyPlain(result.text).then(function () {
        setStatus('✓ Cleaned & copied' + detail, true);
      }, function () {
        setStatus('Cleaned' + detail + ' — press Copy to grab it', false);
      });
    } else {
      setStatus('Cleaned' + detail + ' — press Copy to grab it', false);
    }
  }

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
      if (!text) { setStatus('Nothing to clean — the clipboard has no text.', false); return; }
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

  [optBullets, optTrim, optEmpty, optDedupe, optSort, fmtLines, fmtComma, fmtSql].forEach(function (el) {
    el.addEventListener('change', function () {
      if (raw) run(true);
    });
  });
})();

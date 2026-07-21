(function () {
  'use strict';

  var input = document.getElementById('clip-in');
  var output = document.getElementById('clip-out');
  var status = document.getElementById('clip-status');
  var meta = document.getElementById('clip-meta');
  var pasteBtn = document.getElementById('paste-btn');
  var copyBtn = document.getElementById('copy-btn');
  var clearBtn = document.getElementById('clear-btn');

  var optHidden = document.getElementById('opt-hidden');
  var optWhitespace = document.getElementById('opt-whitespace');
  var optUnwrap = document.getElementById('opt-unwrap');
  var optPunctuation = document.getElementById('opt-punctuation');

  var raw = '';
  var hadRichFormatting = false;
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var pasteKeys = isMac ? '⌘V' : 'Ctrl+V';
  var statusTimer = null;

  /* Zero-width, bidi-control and soft-hyphen characters: delete outright. */
  var DELETE_RE = /[​-‏‪-‮⁠-⁤﻿­]/g;
  /* Exotic unicode spaces (incl. non-breaking): become a normal space. */
  var SPACE_RE = /[   -   　]/g;
  /* Smart punctuation to plain ASCII. */
  var PUNCT = {
    '‘': "'", '’': "'", '‚': "'", '‹': "'", '›': "'",
    '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
    '–': '-', '—': '-', '…': '...'
  };
  var PUNCT_RE = /[‘’‚‹›“”„«»–—…]/g;

  function clean(text) {
    var notes = [];
    var t = text.replace(/\r\n?/g, '\n');

    if (hadRichFormatting) notes.push('formatting stripped');

    if (optHidden.checked) {
      var hidden = 0;
      t = t.replace(DELETE_RE, function () { hidden++; return ''; });
      t = t.replace(SPACE_RE, function () { hidden++; return ' '; });
      if (hidden) notes.push(hidden + ' hidden character' + (hidden === 1 ? '' : 's') + ' removed');
    }

    if (optUnwrap.checked) {
      var joined = 0;
      // re-join words the PDF split with a hyphen at the line end
      t = t.replace(/([A-Za-z])-\n(?=[a-z])/g, function (_, ch) { joined++; return ch; });
      // single line breaks become spaces; blank lines, bullets and numbered
      // lists keep their breaks so real structure survives
      t = t.replace(/([^\n])\n(?![\s•●▪◦\-–—*>#]|\d+[.)]\s)/g, function (_, ch) {
        joined++;
        return ch + ' ';
      });
      if (joined) notes.push(joined + ' line break' + (joined === 1 ? '' : 's') + ' un-wrapped');
    }

    if (optPunctuation.checked) {
      var straightened = 0;
      t = t.replace(PUNCT_RE, function (ch) { straightened++; return PUNCT[ch]; });
      if (straightened) notes.push(straightened + ' smart character' + (straightened === 1 ? '' : 's') + ' straightened');
    }

    if (optWhitespace.checked) {
      var before = t;
      t = t.replace(/[ \t]+$/gm, '');   // trailing spaces
      t = t.replace(/[ \t]{2,}/g, ' '); // runs of spaces
      t = t.replace(/\n{3,}/g, '\n\n'); // stacks of blank lines
      t = t.replace(/^\n+|\n+$/g, '');
      if (t !== before) notes.push('whitespace tidied');
    }

    return { text: t, notes: notes };
  }

  function setStatus(message, ok) {
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    status.textContent = message;
    status.classList.toggle('ok', !!ok);
    if (ok) {
      statusTimer = setTimeout(function () { status.classList.remove('ok'); }, 2500);
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      output.select();
      document.execCommand('copy') ? resolve() : reject(new Error('copy failed'));
      output.setSelectionRange(0, 0);
      output.blur();
    });
  }

  function run(andCopy) {
    var result = clean(raw);
    output.value = result.text;

    if (!result.text) {
      meta.textContent = '';
      setStatus(raw ? 'Nothing left after cleaning.' : '', false);
      return;
    }

    var words = result.text.trim().split(/\s+/).length;
    meta.textContent = result.text.length.toLocaleString() + ' chars · ' + words.toLocaleString() + ' words';

    var detail = result.notes.length ? ' · ' + result.notes.join(' · ') : ' · already clean';
    if (andCopy) {
      copyText(result.text).then(function () {
        setStatus('✓ Cleaned & copied' + detail, true);
      }, function () {
        setStatus('Cleaned' + detail + ' — press Copy to grab it', false);
      });
    } else {
      setStatus('Cleaned' + detail + ' — press Copy to grab it', false);
    }
  }

  /* Pasting into the input is the main flow: intercept so we can see
     whether the clipboard carried rich formatting, then clean + copy back. */
  input.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd) return; // let the browser paste; the input handler picks it up
    e.preventDefault();
    hadRichFormatting = Array.prototype.indexOf.call(cd.types || [], 'text/html') !== -1;
    raw = cd.getData('text/plain');
    input.value = raw;
    run(true);
  });

  /* Typing or editing by hand: re-clean, but don't touch the clipboard. */
  input.addEventListener('input', function () {
    raw = input.value;
    hadRichFormatting = false;
    run(false);
  });

  function manualHint() {
    input.focus();
    setStatus('Clipboard access is blocked here — press ' + pasteKeys + ' in the left box instead.', false);
  }

  pasteBtn.addEventListener('click', function () {
    var clip = navigator.clipboard;
    function fromText() {
      if (clip && clip.readText) {
        clip.readText().then(function (text) {
          if (!text) { setStatus('Nothing to clean — the clipboard has no text.', false); return; }
          hadRichFormatting = false;
          raw = text;
          input.value = text;
          run(true);
        }, manualHint);
      } else {
        manualHint();
      }
    }
    if (clip && clip.read) {
      clip.read().then(function (items) {
        var item = items[0];
        if (!item || item.types.indexOf('text/plain') === -1) {
          setStatus('Nothing to clean — the clipboard has no text.', false);
          return;
        }
        hadRichFormatting = item.types.indexOf('text/html') !== -1;
        return item.getType('text/plain')
          .then(function (blob) { return blob.text(); })
          .then(function (text) {
            raw = text;
            input.value = text;
            run(true);
          });
      }).catch(fromText);
    } else {
      fromText();
    }
  });

  copyBtn.addEventListener('click', function () {
    if (!output.value) { setStatus('Nothing to copy yet.', false); return; }
    copyText(output.value).then(function () {
      setStatus('✓ Copied to clipboard', true);
    }, function () {
      setStatus('Copy failed — select the text and copy manually.', false);
    });
  });

  clearBtn.addEventListener('click', function () {
    raw = '';
    hadRichFormatting = false;
    input.value = '';
    output.value = '';
    meta.textContent = '';
    setStatus('', false);
    input.focus();
  });

  /* Re-clean (and re-copy, since the click is a user gesture) when options change. */
  [optHidden, optWhitespace, optUnwrap, optPunctuation].forEach(function (opt) {
    opt.addEventListener('change', function () {
      if (raw) run(true);
    });
  });
})();

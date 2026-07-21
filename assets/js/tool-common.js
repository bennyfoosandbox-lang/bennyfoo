/* Shared plumbing for the utility tool pages: status line, clipboard
   read/write with graceful fallbacks. Each tool page defines elements
   with ids tool-status / tool-in / tool-out and loads this first. */
window.ToolKit = (function () {
  'use strict';

  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var statusTimer = null;

  function setStatus(message, ok) {
    var el = document.getElementById('tool-status');
    if (!el) return;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    el.textContent = message;
    el.classList.toggle('ok', !!ok);
    if (ok) {
      statusTimer = setTimeout(function () { el.classList.remove('ok'); }, 2500);
    }
  }

  function copyPlain(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var tmp = document.createElement('textarea');
      tmp.value = text;
      tmp.setAttribute('readonly', '');
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(tmp);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /* Copies HTML + a plain-text fallback so rich targets (Outlook, Gmail,
     Word) get formatting and plain targets get clean text. fallbackNode,
     when given, is selected + execCommand-copied on older browsers. */
  function copyRich(html, text, fallbackNode) {
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      return navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
    }
    return new Promise(function (resolve, reject) {
      if (!fallbackNode) { reject(new Error('no rich copy support')); return; }
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(fallbackNode);
      sel.removeAllRanges();
      sel.addRange(range);
      var ok = document.execCommand('copy');
      sel.removeAllRanges();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /* Reads text from the clipboard. onText(text, hadHtml) on success;
     onBlocked() when the browser refuses access. */
  function readClipboard(onText, onBlocked) {
    var clip = navigator.clipboard;
    function fromText() {
      if (clip && clip.readText) {
        clip.readText().then(function (t) { onText(t, false); }, onBlocked);
      } else {
        onBlocked();
      }
    }
    if (clip && clip.read) {
      clip.read().then(function (items) {
        var item = items[0];
        if (!item || item.types.indexOf('text/plain') === -1) { onText('', false); return; }
        var hadHtml = item.types.indexOf('text/html') !== -1;
        item.getType('text/plain')
          .then(function (blob) { return blob.text(); })
          .then(function (t) { onText(t, hadHtml); }, fromText);
      }, fromText);
    } else {
      fromText();
    }
  }

  return {
    pasteKeys: isMac ? '⌘V' : 'Ctrl+V',
    setStatus: setStatus,
    copyPlain: copyPlain,
    copyRich: copyRich,
    readClipboard: readClipboard
  };
})();

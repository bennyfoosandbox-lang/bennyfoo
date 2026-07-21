(function () {
  'use strict';

  var input = document.getElementById('tool-in');
  var render = document.getElementById('tool-out');
  var meta = document.getElementById('tool-meta');
  var pasteBtn = document.getElementById('paste-btn');
  var copyBtn = document.getElementById('copy-btn');
  var copyHtmlBtn = document.getElementById('copy-html-btn');
  var clearBtn = document.getElementById('clear-btn');
  var setStatus = ToolKit.setStatus;

  var raw = '';
  var counts = null;

  /* Inline styles only: email clients (Outlook especially) strip classes
     and stylesheets, so every element carries what it needs. */
  var S = {
    p: 'margin:0 0 1em 0;',
    li: 'margin:0.2em 0;',
    list: 'margin:0 0 1em 0;padding-left:1.6em;',
    quote: 'margin:0 0 1em 0;padding:0.3em 1em;border-left:3px solid #c2410c;color:#52525b;',
    pre: 'margin:0 0 1em 0;padding:12px 14px;background:#f4f4f5;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:0.9em;white-space:pre-wrap;word-wrap:break-word;',
    code: 'background:#f4f4f5;padding:1px 5px;border-radius:4px;font-family:Consolas,Menlo,monospace;font-size:0.9em;',
    hr: 'border:none;border-top:1px solid #d4d4d8;margin:1.5em 0;',
    table: 'border-collapse:collapse;margin:0 0 1em 0;',
    cell: 'border:1px solid #d4d4d8;padding:6px 12px;',
    a: 'color:#0563c1;'
  };
  function headingStyle(level) {
    var sizes = ['1.7em', '1.4em', '1.2em', '1.05em', '1em', '0.95em'];
    return 'font-size:' + sizes[level - 1] + ';font-weight:bold;line-height:1.3;margin:' +
      (level === 1 ? '0.6em' : '1.1em') + ' 0 0.45em 0;';
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(text) {
    text = esc(text);
    // shelter code spans so no formatting applies inside them
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    // images degrade to links (email clients block pasted remote images anyway)
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s[^)]*)?\)/g, '<a href="$2" style="' + S.a + '">$1</a>');
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s[^)]*)?\)/g, '<a href="$2" style="' + S.a + '">$1</a>');
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    text = text.replace(/\u0000(\d+)\u0000/g, function (_, n) {
      return '<code style="' + S.code + '">' + esc(codes[n]) + '</code>';
    });
    return text;
  }

  function splitRow(line) {
    var t = line.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    return t.split('|').map(function (c) { return c.trim(); });
  }

  function parseListBlock(lines, start) {
    var items = [];
    var i = start;
    while (i < lines.length) {
      var m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (m) {
        items.push({
          indent: m[1].replace(/\t/g, '  ').length,
          ordered: /\d/.test(m[2]),
          text: m[3]
        });
        i++;
      } else if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
        items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      } else {
        break;
      }
    }
    function build(pos, indent) {
      var tag = items[pos].ordered ? 'ol' : 'ul';
      var html = '<' + tag + ' style="' + S.list + '">';
      var hasItem = false;
      while (pos < items.length && items[pos].indent >= indent) {
        if (items[pos].indent > indent) {
          var sub = build(pos, items[pos].indent);
          if (hasItem) {
            html = html.slice(0, -5) + sub.html + '</li>'; // tuck inside the last <li>
          } else {
            html += '<li style="' + S.li + '">' + sub.html + '</li>';
          }
          pos = sub.pos;
        } else {
          html += '<li style="' + S.li + '">' + inline(items[pos].text) + '</li>';
          hasItem = true;
          pos++;
        }
      }
      return { html: html + '</' + tag + '>', pos: pos };
    }
    var result = build(0, items[0].indent);
    counts.lists++;
    return { html: result.html, next: i };
  }

  function toHtml(md) {
    var lines = md.replace(/\r\n?/g, '\n').split('\n');
    var html = [];
    var para = [];
    var i = 0;
    var m;

    function flushPara() {
      if (para.length) {
        html.push('<p style="' + S.p + '">' + para.map(inline).join('<br>') + '</p>');
        para = [];
      }
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^```/.test(line)) {
        flushPara();
        var code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        html.push('<pre style="' + S.pre + '">' + esc(code.join('\n')) + '</pre>');
        counts.code++;
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushPara();
        var lvl = m[1].length;
        html.push('<h' + lvl + ' style="' + headingStyle(lvl) + '">' +
          inline(m[2].replace(/\s+#+\s*$/, '')) + '</h' + lvl + '>');
        counts.headings++;
        i++;
        continue;
      }
      if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushPara();
        html.push('<hr style="' + S.hr + '">');
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        flushPara();
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        html.push('<blockquote style="' + S.quote + '">' + toHtml(q.join('\n')) + '</blockquote>');
        counts.quotes++;
        continue;
      }
      if (line.indexOf('|') !== -1 && i + 1 < lines.length &&
          lines[i + 1].indexOf('|') !== -1 && lines[i + 1].indexOf('-') !== -1 &&
          /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        flushPara();
        var head = splitRow(line);
        var aligns = splitRow(lines[i + 1]).map(function (c) {
          if (/^:-+:$/.test(c)) return 'center';
          if (/^-+:$/.test(c)) return 'right';
          return 'left';
        });
        i += 2;
        var body = [];
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
          body.push(splitRow(lines[i]));
          i++;
        }
        var t = '<table style="' + S.table + '"><thead><tr>';
        head.forEach(function (c, k) {
          t += '<th style="' + S.cell + 'background:#f4f4f5;font-weight:bold;text-align:' + (aligns[k] || 'left') + ';">' + inline(c) + '</th>';
        });
        t += '</tr></thead><tbody>';
        body.forEach(function (row) {
          t += '<tr>';
          head.forEach(function (_, k) {
            t += '<td style="' + S.cell + 'text-align:' + (aligns[k] || 'left') + ';">' + inline(row[k] || '') + '</td>';
          });
          t += '</tr>';
        });
        html.push(t + '</tbody></table>');
        counts.tables++;
        continue;
      }
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
        flushPara();
        var list = parseListBlock(lines, i);
        html.push(list.html);
        i = list.next;
        continue;
      }
      if (!line.trim()) {
        flushPara();
        i++;
        continue;
      }
      para.push(line.trim());
      i++;
    }
    flushPara();
    return html.join('');
  }

  function convert(md) {
    counts = { headings: 0, lists: 0, tables: 0, code: 0, quotes: 0 };
    return toHtml(md);
  }

  function wrapped(html) {
    return '<div style="font-family:Calibri,\'Segoe UI\',Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111111;">' + html + '</div>';
  }

  function notesText() {
    var notes = [];
    if (counts.headings) notes.push(counts.headings + ' heading' + (counts.headings === 1 ? '' : 's'));
    if (counts.lists) notes.push(counts.lists + ' list' + (counts.lists === 1 ? '' : 's'));
    if (counts.tables) notes.push(counts.tables + ' table' + (counts.tables === 1 ? '' : 's'));
    if (counts.code) notes.push(counts.code + ' code block' + (counts.code === 1 ? '' : 's'));
    if (counts.quotes) notes.push(counts.quotes + ' quote' + (counts.quotes === 1 ? '' : 's'));
    return notes.length ? ' · ' + notes.join(' · ') : '';
  }

  function run(andCopy) {
    var html = convert(raw);
    render.innerHTML = html;

    if (!raw.trim()) {
      meta.textContent = '';
      setStatus('', false);
      return;
    }
    var words = raw.trim().split(/\s+/).length;
    meta.textContent = words.toLocaleString() + ' words';

    if (andCopy) {
      ToolKit.copyRich(wrapped(html), raw, render).then(function () {
        setStatus('✓ Converted & copied as rich text' + notesText() + ' — paste into your email', true);
      }, function () {
        setStatus('Converted' + notesText() + ' — press Copy to grab it', false);
      });
    } else {
      setStatus('Converted' + notesText() + ' — press Copy to grab it', false);
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
      if (!text) { setStatus('Nothing to convert — the clipboard has no text.', false); return; }
      raw = text;
      input.value = text;
      run(true);
    }, function () {
      input.focus();
      setStatus('Clipboard access is blocked here — press ' + ToolKit.pasteKeys + ' in the left box instead.', false);
    });
  });

  copyBtn.addEventListener('click', function () {
    if (!raw.trim()) { setStatus('Nothing to copy yet.', false); return; }
    ToolKit.copyRich(wrapped(render.innerHTML), raw, render).then(function () {
      setStatus('✓ Copied as rich text — paste into your email', true);
    }, function () {
      setStatus('Copy failed — select the preview and copy manually.', false);
    });
  });

  copyHtmlBtn.addEventListener('click', function () {
    if (!raw.trim()) { setStatus('Nothing to copy yet.', false); return; }
    ToolKit.copyPlain(wrapped(render.innerHTML)).then(function () {
      setStatus('✓ HTML source copied', true);
    }, function () {
      setStatus('Copy failed — select the preview and copy manually.', false);
    });
  });

  clearBtn.addEventListener('click', function () {
    raw = '';
    input.value = '';
    render.innerHTML = '';
    meta.textContent = '';
    setStatus('', false);
    input.focus();
  });
})();

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'submission');
const documents = [
  {
    source: join(projectRoot, 'docs', 'GAME_GUIDE.md'),
    output: join(outputDirectory, 'PROJECT_BRICK_WARFARE_GAME_GUIDE.pdf'),
  },
  {
    source: join(projectRoot, 'docs', 'AI_TECHNICAL_DOCUMENT.md'),
    output: join(outputDirectory, 'PROJECT_BRICK_WARFARE_AI_TECHNICAL_DOCUMENT.pdf'),
  },
  {
    source: join(projectRoot, 'docs', 'NAN2026_PRELIMINARY_STRATEGY_PLAN.md'),
    output: join(projectRoot, 'docs', 'NAN2026_PRELIMINARY_STRATEGY_PLAN.pdf'),
  },
];

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
}

function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const fragments = [];
  let listType = null;
  let codeFence = false;
  let codeLines = [];

  const closeList = () => {
    if (listType) {
      fragments.push(`</${listType}>`);
      listType = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('```')) {
      closeList();
      if (!codeFence) {
        codeFence = true;
        codeLines = [];
      } else {
        fragments.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeFence = false;
      }
      continue;
    }
    if (codeFence) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      fragments.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (
      line.trim().startsWith('|')
      && lines[index + 1]
      && isTableDivider(lines[index + 1])
    ) {
      closeList();
      const headers = tableCells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      fragments.push(
        `<table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`
        + `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
      );
      continue;
    }
    const unordered = line.match(/^\s*-\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const requestedType = unordered ? 'ul' : 'ol';
      if (listType !== requestedType) {
        closeList();
        listType = requestedType;
        fragments.push(`<${listType}>`);
      }
      fragments.push(`<li>${renderInline((unordered ?? ordered)[1])}</li>`);
      continue;
    }
    closeList();
    fragments.push(`<p>${renderInline(line.trim())}</p>`);
  }
  closeList();
  if (codeFence) {
    fragments.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  return fragments.join('\n');
}

function documentHtml(markdown, title) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 14mm 15mm 17mm; }
    * { box-sizing: border-box; }
    html { color: #15232d; background: #ffffff; }
    body {
      margin: 0;
      font-family: "Malgun Gothic", "Noto Sans KR", Arial, sans-serif;
      font-size: 10.2pt;
      line-height: 1.58;
      word-break: keep-all;
      overflow-wrap: break-word;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 {
      margin: 0 0 5mm;
      padding: 0 0 4mm;
      border-bottom: 2.4mm solid #1688ff;
      color: #071925;
      font-size: 26pt;
      line-height: 1.16;
      letter-spacing: -0.045em;
    }
    h2 {
      margin: 7mm 0 3mm;
      color: #0b547f;
      font-size: 18pt;
      line-height: 1.25;
      break-after: avoid;
    }
    h3 {
      margin: 5mm 0 2mm;
      padding-left: 2.5mm;
      border-left: 1.3mm solid #ff9b46;
      color: #14384c;
      font-size: 13.5pt;
      line-height: 1.3;
      break-after: avoid;
    }
    h4, h5, h6 {
      margin: 4mm 0 1.5mm;
      color: #14384c;
      break-after: avoid;
    }
    p { margin: 0 0 2.8mm; }
    ul, ol { margin: 0 0 3mm; padding-left: 6.5mm; }
    li { margin: 0 0 1.1mm; }
    strong { color: #092f48; }
    code {
      padding: 0.25mm 1mm;
      border-radius: 1mm;
      background: #eef4f7;
      color: #9a3e16;
      font-family: Consolas, "Malgun Gothic", monospace;
      font-size: 9.2pt;
    }
    pre {
      margin: 3mm 0 4mm;
      padding: 3.5mm;
      border-left: 1.2mm solid #1688ff;
      background: #0d202c;
      color: #ecf7ff;
      white-space: pre-wrap;
      break-inside: avoid;
    }
    pre code { padding: 0; background: none; color: inherit; }
    table {
      width: 100%;
      margin: 3mm 0 5mm;
      border-collapse: collapse;
      font-size: 9.2pt;
    }
    thead { display: table-header-group; }
    th {
      padding: 2.2mm;
      border: 0.3mm solid #9bb6c5;
      background: #153b51;
      color: #ffffff;
      text-align: left;
    }
    td {
      padding: 2mm 2.2mm;
      border: 0.3mm solid #b8cbd5;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #f1f6f8; }
    a { color: #006eb7; text-decoration: none; }
  </style>
</head>
<body>
${markdownToHtml(markdown)}
</body>
</html>`;
}

function browserPath() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome 또는 Edge를 찾지 못했습니다. BROWSER_PATH를 지정하세요.');
  }
  return found;
}

mkdirSync(outputDirectory, { recursive: true });
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'brick-warfare-docs-'));

try {
  const executable = browserPath();
  for (const document of documents) {
    const markdown = readFileSync(document.source, 'utf8');
    const htmlPath = join(
      temporaryDirectory,
      `${basename(document.source, '.md')}.html`,
    );
    writeFileSync(
      htmlPath,
      documentHtml(markdown, basename(document.source, '.md')),
      'utf8',
    );
    const profilePath = join(
      temporaryDirectory,
      `profile-${basename(document.source, '.md')}`,
    );
    execFileSync(
      executable,
      [
        '--headless=new',
        '--disable-extensions',
        '--disable-sync',
        '--no-first-run',
        '--no-pdf-header-footer',
        '--run-all-compositor-stages-before-draw',
        `--user-data-dir=${profilePath}`,
        `--print-to-pdf=${document.output}`,
        pathToFileURL(htmlPath).href,
      ],
      { timeout: 120000, stdio: 'pipe' },
    );
    if (!existsSync(document.output) || statSync(document.output).size < 1000) {
      throw new Error(`PDF 생성 실패: ${document.output}`);
    }
    process.stdout.write(`created ${document.output}\n`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

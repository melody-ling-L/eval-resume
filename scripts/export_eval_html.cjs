#!/usr/bin/env node
/**
 * Export a promptfoo eval JSON to a self-contained HTML report.
 *
 * Usage:
 *   node scripts/export_eval_html.cjs reports/evals/full_20_v3.json
 *   node scripts/export_eval_html.cjs reports/evals/full_20_v3.json -o docs/eval/latest.html
 *   node scripts/export_eval_html.cjs reports/evals/full_20_v3.json --open
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_METRICS = ['规则_反捏造', '语义_诚实度', '岗位_贴合度', '表达_专业度'];

function parseArgs(argv) {
  const args = { input: null, output: null, open: false, metrics: DEFAULT_METRICS };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--output') {
      args.output = argv[++i];
    } else if (a === '--open') {
      args.open = true;
    } else if (a === '--metrics') {
      args.metrics = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (!a.startsWith('-')) {
      args.input = a;
    }
  }
  return args;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectMetrics(results) {
  const found = new Set();
  for (const r of results) {
    for (const c of r.gradingResult?.componentResults || []) {
      if (c.assertion?.metric) found.add(c.assertion.metric);
    }
  }
  const ordered = DEFAULT_METRICS.filter((m) => found.has(m));
  for (const m of found) {
    if (!ordered.includes(m)) ordered.push(m);
  }
  return ordered.length ? ordered : DEFAULT_METRICS;
}

function buildHtml(data, metrics) {
  const evalId = data.evalId || 'unknown';
  const desc = data.config?.description || data.description || 'promptfoo eval';
  const providerLabel =
    data.results?.results?.[0]?.provider?.label ||
    data.providers?.[0]?.label ||
    '—';
  const results = (data.results?.results || []).slice().sort((a, b) =>
    (a.testCase?.metadata?.case_id || a.testIdx || 0)
      .toString()
      .localeCompare((b.testCase?.metadata?.case_id || b.testIdx || 0).toString()),
  );

  const rows = results.map((r) => {
    const caseId = r.testCase?.metadata?.case_id || r.vars?.['__metadata:case_id'] || `case_${r.testIdx}`;
    const name = r.vars?.candidate_name || r.testCase?.description || '';
    const category = r.testCase?.metadata?.category || '';
    const output = r.response?.output || '';
    const error = r.error || r.failureReason || '';
    const comps = r.gradingResult?.componentResults || [];
    const dims = {};
    for (const c of comps) {
      const m = c.assertion?.metric;
      if (m) dims[m] = { pass: c.pass, reason: c.reason || '' };
    }
    const allPass = metrics.every((m) => dims[m]?.pass === true);
    return { caseId, name, category, output, error, dims, allPass };
  });

  const passCount = rows.filter((r) => r.allPass).length;
  const total = rows.length;

  const summaryRows = rows
    .map((r) => {
      const cells = metrics
        .map((m) => {
          const d = r.dims[m];
          if (!d) return '<td class="na">—</td>';
          return `<td class="${d.pass ? 'pass' : 'fail'}">${d.pass ? '✓' : '✗'}</td>`;
        })
        .join('');
      const overall = r.allPass ? 'pass' : r.error && !r.output ? 'error' : 'fail';
      const id = esc(r.caseId);
      return `<tr class="${overall}" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth'});document.getElementById('${id}').classList.add('open')">
    <td><a href="#${id}">${id}</a></td>
    <td>${esc(r.name.slice(0, 48))}${r.name.length > 48 ? '…' : ''}</td>
    <td class="${overall}">${overall.toUpperCase()}</td>${cells}
  </tr>`;
    })
    .join('\n');

  const caseBlocks = rows
    .map((r) => {
      const dimHtml = metrics
        .map((m) => {
          const d = r.dims[m];
          if (!d) return `<div class="dim na">${esc(m)}: —</div>`;
          const cls = d.pass ? 'pass' : 'fail';
          return `<div class="dim ${cls}"><strong>${esc(m)}</strong>: ${d.pass ? 'PASS' : 'FAIL'}<div class="reason">${esc(d.reason)}</div></div>`;
        })
        .join('');
      const badge = r.allPass ? 'pass' : r.error && !r.output ? 'error' : 'fail';
      const badgeText = r.allPass ? 'PASS' : r.error && !r.output ? 'ERROR' : 'FAIL';
      const id = esc(r.caseId);
      return `
    <section class="case" id="${id}">
      <header class="case-header" onclick="this.parentElement.classList.toggle('open')">
        <span class="badge ${badge}">${badgeText}</span>
        <h2>${id} <span class="sub">${esc(r.name)}</span></h2>
        <span class="toggle">▼</span>
      </header>
      <div class="case-body">
        ${r.category ? `<p class="meta">Category: ${esc(r.category)}</p>` : ''}
        ${r.error ? `<p class="err">${esc(r.error)}</p>` : ''}
        <div class="dims">${dimHtml}</div>
        <h3>改写输出</h3>
        ${r.output ? `<pre class="output">${esc(r.output)}</pre>` : '<p class="empty">（无输出）</p>'}
      </div>
    </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RR-Bench Eval — ${esc(evalId)}</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #fff; --text: #1a1a2e; --muted: #666;
    --pass: #0d7a49; --pass-bg: #e8f5ee; --fail: #c0392b; --fail-bg: #fdecea;
    --error: #b45309; --error-bg: #fef3c7; --border: #e2e8f0; --accent: #3b5998;
  }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  .hero { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px; }
  .hero p { margin: 4px 0; color: var(--muted); font-size: 0.9rem; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
  .stat { background: var(--bg); border-radius: 8px; padding: 12px 20px; min-width: 120px; }
  .stat span { color: var(--muted); font-size: 0.8rem; }
  .stat strong { display: block; font-size: 1.8rem; }
  .stat.pass strong { color: var(--pass); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 32px; font-size: 0.85rem; }
  th, td { padding: 10px 12px; text-align: center; border-bottom: 1px solid var(--border); }
  th { background: #f1f5f9; font-weight: 600; }
  th:first-child, td:first-child { text-align: left; }
  th:nth-child(2), td:nth-child(2) { text-align: left; }
  tr { cursor: pointer; }
  tr:hover { background: #f8fafc; }
  td.pass { color: var(--pass); font-weight: bold; }
  td.fail { color: var(--fail); font-weight: bold; }
  td.na { color: #aaa; }
  tr.pass td:nth-child(3) { color: var(--pass); }
  tr.fail td:nth-child(3) { color: var(--fail); }
  tr.error td:nth-child(3) { color: var(--error); }
  .case { background: var(--card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
  .case-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; user-select: none; }
  .case-header h2 { margin: 0; font-size: 1rem; flex: 1; }
  .case-header .sub { font-weight: normal; color: var(--muted); font-size: 0.85rem; }
  .toggle { color: var(--muted); transition: transform .2s; }
  .case.open .toggle { transform: rotate(180deg); }
  .case-body { display: none; padding: 0 18px 18px; border-top: 1px solid var(--border); }
  .case.open .case-body { display: block; }
  .badge { font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
  .badge.pass { background: var(--pass-bg); color: var(--pass); }
  .badge.fail { background: var(--fail-bg); color: var(--fail); }
  .badge.error { background: var(--error-bg); color: var(--error); }
  .dims { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }
  .dim { font-size: 0.82rem; padding: 10px; border-radius: 8px; border: 1px solid var(--border); }
  .dim.pass { background: var(--pass-bg); }
  .dim.fail { background: var(--fail-bg); }
  .dim.na { background: #f8f8f8; color: #999; }
  .reason { margin-top: 6px; color: var(--muted); font-size: 0.78rem; word-break: break-word; }
  .output { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; font-size: 0.82rem; line-height: 1.6; max-height: 600px; overflow: auto; }
  .err { color: var(--fail); background: var(--fail-bg); padding: 10px; border-radius: 6px; font-size: 0.85rem; word-break: break-word; }
  .empty { color: var(--muted); font-style: italic; }
  .meta { color: var(--muted); font-size: 0.85rem; }
  a { color: var(--accent); }
  footer { text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 32px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>Resume Rewrite Bench — Eval Report</h1>
    <p><strong>Eval ID:</strong> ${esc(evalId)}</p>
    <p><strong>Description:</strong> ${esc(desc)}</p>
    <p><strong>Provider:</strong> ${esc(providerLabel)}</p>
    <p><strong>Exported:</strong> ${new Date().toISOString()}</p>
    <div class="stats">
      <div class="stat"><span>Total</span><strong>${total}</strong></div>
      <div class="stat pass"><span>PASS (all dims)</span><strong>${passCount}</strong></div>
      <div class="stat"><span>FAIL / ERROR</span><strong>${total - passCount}</strong></div>
      <div class="stat"><span>Pass Rate</span><strong>${total ? Math.round((passCount / total) * 100) : 0}%</strong></div>
    </div>
  </div>
  <h2 style="font-size:1.1rem;margin-bottom:12px;">Score Matrix</h2>
  <table>
    <thead><tr><th>Case</th><th>Description</th><th>Overall</th>${metrics.map((m) => `<th>${esc(m)}</th>`).join('')}</tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
  <h2 style="font-size:1.1rem;margin-bottom:12px;">Case Details</h2>
  ${caseBlocks}
  <footer>Exported from promptfoo · RR-Bench · ${esc(evalId)}</footer>
</div>
<script>document.querySelectorAll('.case.fail, .case.error').forEach(el => el.classList.add('open'));</script>
</body>
</html>`;
}

function defaultOutputPath(inputPath, evalId) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const slug = String(evalId).replace(/[^a-zA-Z0-9_-]+/g, '_');
  return path.join(path.dirname(inputPath), `${base}_${slug}.html`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) {
    console.log(`Usage: node scripts/export_eval_html.cjs <eval.json> [-o out.html] [--open] [--metrics a,b,c]

Examples:
  node scripts/export_eval_html.cjs reports/evals/full_20_v3.json
  node scripts/export_eval_html.cjs reports/evals/full_20_v3.json -o docs/eval/latest.html --open
`);
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const results = data.results?.results || [];
  const metrics = args.metrics.length ? args.metrics : detectMetrics(results);
  const html = buildHtml(data, metrics);
  const outputPath = path.resolve(args.output || defaultOutputPath(inputPath, data.evalId || 'eval'));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  console.log(`✓ ${results.length} cases → ${outputPath} (${Math.round(html.length / 1024)} KB)`);

  if (args.open && process.platform === 'darwin') {
    execSync(`open "${outputPath}"`);
  }
}

main();

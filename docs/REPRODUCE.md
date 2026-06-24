# Reproduce

本文档说明如何在本地复现 ResumeRewriteBench 评测。

---

## Prerequisites

- [promptfoo](https://promptfoo.dev/) CLI
- Node.js ≥ 18
- Python 3
- AiHubMix API key（[注册](https://aihubmix.com)）

---

## 1. 配置环境

```bash
git clone https://github.com/melody-ling-L/eval-resume.git
cd eval-resume
cp .env.example .env
```

编辑 `.env`，至少填入：

```bash
API_AIHUBMIX_KEY=your_key_here
```

---

## 2. 快速体验（3 cases，约 3 分钟）

```bash
promptfoo eval --filter-first-n 3 --max-concurrency 1
promptfoo view
```

---

## 3. 数据质检（可选）

```bash
python3 scripts/quality_check_cases.py
```

---

## 4. 全量 120-case 评测

缓存版（推荐首次跑）：

```bash
promptfoo eval --env-file .env --max-concurrency 1 --no-table
```

完全 fresh（无缓存）：

```bash
promptfoo eval --env-file .env --no-cache --max-concurrency 1 --no-table
```

固定 `--max-concurrency 1`，优先保证 provider 稳定性与结果可解释性。

---

## 5. 仅重跑 Gemini（修改 token 预算后）

```bash
promptfoo eval --env-file .env \
  --filter-providers 'Gemini 3.1 Pro Preview' \
  --no-cache --max-concurrency 1 --no-table
```

---

## 6. 查看与导出

```bash
# 浏览器 UI
promptfoo view

# 导出 JSON
promptfoo export eval <eval-id> -o reports/exports/<name>.json

# 导出静态 HTML（部署到 GitHub Pages）
node scripts/export_eval_html.cjs reports/evals/<file>.json -o docs/eval/<name>.html
```

---

## 7. 人工标注（meta-eval）

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/meta_eval/labeling_app.html
```

流程：

1. 从 `promptfoo view` 导出 CSV
2. 在标注器中加载 CSV
3. 逐条标 `语义_诚实度` / `岗位_贴合度` / `表达_专业度`
4. 导出 YAML 到 `meta_eval/human_labels.yaml`

也可使用独立工具 [JudgeBuddy](https://github.com/melody-ling-L/judgebuddy)。

---

## 8. 分析脚本

```bash
# 从 promptfoo JSON 生成分析 Markdown
python3 scripts/analyze_eval_results.py reports/evals/full_20x3.json
```

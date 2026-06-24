# Methodology

本文档是 [README](../README.md) 的方法论补充，面向想深入了解评测设计的读者。

---

## 评测目标

ResumeRewriteBench 评估的是简历改写场景里的一个真实业务问题：

> 当目标 JD 很诱人、原简历又不完全匹配时，模型会不会为了更像理想候选人，而偷偷发明经历、抬升资历或跨领域包装？

核心目标不是做「模型排行榜」，而是得到一套能被招聘 AI 产品和 prompt 工程直接复用的结论。

---

## Benchmark 设计

### 实验矩阵

- **Cases**：20 个脱敏简历/JD 对（`case_04`–`case_20` 为真实脱敏，`case_01`–`case_03` 为 sandbox）
- **Prompts**：`basic`（简单「不要捏造」）vs `strict`（逐条列出造假路径）
- **Models**：GPT-5.4 · Claude Sonnet 4.6 · Gemini 3.1 Pro（均 via AiHubMix）
- **Total**：20 × 2 × 3 = **120 条评测**

### Judge

Judge 使用 GPT-4o via AiHubMix，`temperature: 0`。

- 不让被测模型自己给自己打分
- 降低随机波动对 A/B 结果的污染

### 两层评分

1. **规则层** — `规则_反捏造`：快速、便宜、可解释；检测 `forbidden_terms` 和禁用表达
2. **语义层** — `语义_诚实度` / `岗位_贴合度` / `表达_专业度`：由 judge 按 rubric 打分

硬违规直接挡住，灰区交给 judge，最终结果既有规则可解释性，也有语义判断能力。

---

## Prompt variants

### basic

只声明「不要捏造、夸大、添加原简历没有的经历」。

### strict

把常见风险拆开写清楚，明确限制：

- 动词抬升：`参与 → 主导`、`负责 → 从 0 到 1`
- 程度词镶嵌：`企业级`、`核心`、`高并发`
- 跨领域包装：把电商、行政、文档等经验包装成 AI/算法/模型评测经验
- 具体工具注入：原文没写的框架、工具、技术栈
- 编造量化成就：`提升 30%`、`覆盖百万用户` 等

`strict` 的目标不是让模型写得更保守，而是让「改写」留在事实边界内。

---

## Finding 1: strict prompt 对所有 3 个模型都有效

> Prompt 严格化对所有主流模型的诚实度都有正向干预，而且收益与基础诚实度成反比。

| 模型 | basic 诚实度 | strict 诚实度 | 提升 |
|---|---:|---:|---:|
| Gemini 3.1 Pro | 0.50 | **0.90** | +0.40 |
| Claude Sonnet 4.6 | 0.55 | **0.80** | +0.25 |
| GPT-5.4 | 0.70 | **0.80** | +0.10 |

- 对更激进、更容易「帮用户包装过头」的模型，prompt 工程能直接改变结果分布
- `strict` 带来的 JD 贴合度代价很小，最大下降只有 0.05
- Claude 实现了「诚实度显著提升，贴合度 0 损耗」

**实用建议**：不要只写一句「不要捏造」。更有效的写法是把常见造假路径拆开明确禁止 —— 不添加原简历没有的工具/项目、不升级动词、不镶嵌程度词、不跨领域包装、不编造量化成果。

---

## Finding 2: `max_tokens` 是 reasoning 模型评测的隐形杀手

Gemini 3.1 Pro 的结果中出现了一个非常典型、也非常危险的方法论问题。

最开始的 Gemini 看起来像「strict prompt 反而更差」，但那不是模型能力问题，而是一个评测设计 bug：

- Gemini 3.1 Pro 是 reasoning model
- `max_tokens` 同时包含内部推理 token 和最终输出 token
- 配置里本来打算给 Gemini `max_tokens: 8192`
- 但 YAML 里又重复写了一次 `max_tokens: 1200`
- 后面的 `1200` 静默覆盖了前面的 `8192`

结果就是：模型表面上「正常返回」，HTTP 200，没有 timeout，也没有空输出；但它在内部思考阶段已经把预算吃掉了，最后只吐出半句话，`finish_reason=length`。

### 为什么这个 bug 容易被忽略

| 你以为会看到的现象 | 实际发生的现象 |
|---|---|
| API 报错或 timeout | 没有，接口返回 200 |
| 输出完全空白 | 不是空白，而是只写到半句话 |
| 明显 token warning | 只有一个细节：`finish_reason=length` |
| 评分会像错误一样被丢弃 | 不会，judge 会把「半份简历」当真评分 |

### 修复前后对比

| Gemini 指标 | 截断版本 `eval-lyT` | 修复后 `eval-vnX` |
|---|---:|---:|
| basic 诚实度 | 0.60 | 0.50 |
| strict 诚实度 | 0.50 | **0.90** |
| basic 贴合度 | 0.10 | **0.95** |
| strict 贴合度 | 0.10 | **0.90** |
| basic 表达专业度 | 0.05 | **1.00** |
| strict 表达专业度 | 0.025 | **1.00** |

### 正确配置

```yaml
- id: openai:chat:gemini-3.1-pro-preview
  label: Gemini 3.1 Pro Preview (via AiHubMix)
  config:
    apiBaseUrl: https://api.aihubmix.com/v1
    apiKeyEnvar: API_AIHUBMIX_KEY
    timeout: 120000
    max_tokens: 8192
    showThinking: false
```

### Benchmark 作者 checklist

评测 reasoning 模型（Gemini 3.x、o1/o3 类、带 thinking 模式的模型）时：

1. `max_tokens` 是否显式设置，且足够大
2. 是否存在 YAML 重复键，导致预算被静默覆盖
3. 输出异常短时，第一件事看 `finish_reason`
4. prompt A/B 中更长的 prompt 是否变相挤压了输出预算

---

## Headline 结果快照说明

README 主表使用的发布快照：

- GPT / Claude 来自完整 120 条评测 `eval-lyT-2026-05-17T17:30:12`
- Gemini 来自修复 token 预算后的 fresh rerun `eval-vnX-2026-05-18T02:35:26`
- 三者合并为发布用快照 `eval-dNd-2026-05-17T16:00:03`
- 导出文件：`reports/exports/eval_dNd_with_fresh_gemini.json`

这是为了保证三模型 headline 表都基于「可生成完整输出」的公平条件。

---

## 数据集与隐私

数据主索引：`data/cases.csv`

- `case_01`–`case_03`：synthetic sandbox cases，用于早期配置调试
- `case_04`–`case_20`：真实简历脱敏文本，用于正式 benchmark

脱敏原则：

- 真实姓名、电话、邮箱、精确地址移除或替换
- 对外只保留岗位相关信息
- 数据用于 benchmark 研究，不用于实际招聘决策自动化

相关文件：`data/jds/` · `data/resumes_anon/` · `reports/data_quality_report.md`

---

## Meta-eval：人工标注流程

LLM judge 评分可再用人工金标校一遍。推荐流程：

1. 在 `promptfoo view` 里导出 **CSV**
2. 打开 `meta_eval/labeling_app.html`（或 [JudgeBuddy](https://github.com/melody-ling-L/judgebuddy)）
3. 逐条标 `语义_诚实度` / `岗位_贴合度` / `表达_专业度`
4. `规则_反捏造` 保留自动规则判定
5. 导出 YAML 到 `meta_eval/human_labels.yaml`

建议先标 headline case、judge 分数最不稳定的 case、最容易「误奖贴合度」的 case，再决定是否扩到全量。

---

## 结果文件索引

| Eval ID | 说明 |
|---|---|
| `eval-lyT-2026-05-17T17:30:12` | 完整 120 条 cached run；Gemini 受 token bug 影响被截断 |
| `eval-vnX-2026-05-18T02:35:26` | Gemini-only fresh rerun，修复 token 预算后 |
| `eval-dNd-2026-05-17T16:00:03` | 发布用快照：GPT/Claude 完整 run + Gemini fresh rerun |
| `reports/exports/eval_dNd_with_fresh_gemini.json` | README headline 表导出来源 |

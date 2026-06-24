# ResumeRewriteBench

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Eval Framework](https://img.shields.io/badge/eval-promptfoo-orange)](https://promptfoo.dev/)
[![Live Report](https://img.shields.io/badge/report-GitHub%20Pages-blue)](https://melody-ling-l.github.io/eval-resume/)
[![Language](https://img.shields.io/badge/language-中文-red.svg)](#)

**当 LLM 帮你改简历，它会不会偷偷加你没做过的项目？**

这是第一个系统测量「中文简历改写诚实度」的开源 benchmark。不问模型谁写得更好看，而问一个更实际的问题：**为了贴合 JD，模型会不会发明你没做过的经历？**

---

## 给面试官：2 分钟导读

| 项目 | 内容 |
|---|---|
| **问题** | 简历 AI 在「帮用户更好表达」和「替用户虚构事实」之间会不会越线？ |
| **规模** | 20 份脱敏真实简历 × 2 版 prompt × 3 模型 × 4 评分维度 = 120 条评测 |
| **方法** | promptfoo + 规则层反捏造 + GPT-4o LLM-as-judge + 人工 meta-eval 校准 |
| **核心结论** | strict prompt 对所有模型诚实度均有正向干预；reasoning 模型的 `max_tokens` 配错会系统性扭曲结论 |
| **在线报告** | [melody-ling-l.github.io/eval-resume](https://melody-ling-l.github.io/eval-resume/) |
| **配套工具** | [JudgeBuddy](https://github.com/melody-ling-L/judgebuddy) — LLM-as-judge 人工校准单页工具 |

**建议阅读顺序：**

1. 本页「核心发现」→ 了解结论
2. [在线评测报告](https://melody-ling-l.github.io/eval-resume/eval/full_20_v5.html) → 逐 case 看输入/输出/评分
3. [docs/METHODOLOGY.md](docs/METHODOLOGY.md) → 评测设计、prompt A/B、token 预算踩坑
4. `prompts/rewrite_strict.txt` → 看 prompt 工程具体怎么写

---

## 核心发现

### 1. 三个模型，三种策略（baseline）

| | Claude 4.6 | GPT-5.4 | Gemini 3.1 Pro |
|---|---:|---:|---:|
| 规则_反捏造 | 0.55 | 0.85 | **1.00** |
| 语义_诚实度 | **0.30** | 0.85 | 0.65 |
| 岗位_贴合度 | **1.00** | 0.80 | 0.75 |
| 表达_专业度 | 0.99 | 1.00 | 0.60 |

- **Claude = 激进贴合派**：JD 贴合度满分，诚实度最低
- **GPT = 均衡派**：四维度无明显短板，求职 AI 场景最可商用
- **Gemini = 字面派**：规则层完美，表达专业度有提升空间

没有「全面最好」的模型，只有「贴合什么场景」的选择 —— 这是 multi-dimensional eval 相对单维度排行榜的价值。

### 2. strict prompt 对所有模型有效

| Model | basic 诚实度 | strict 诚实度 | Δ |
|---|---:|---:|---:|
| Gemini 3.1 Pro | 0.50 | 0.90 | **+0.40** |
| Claude Sonnet 4.6 | 0.55 | 0.80 | +0.25 |
| GPT-5.4 | 0.70 | 0.80 | +0.10 |

模型基础诚实度越低，strict prompt 的边际收益越大。JD 贴合度代价极小（最大 -0.05）。

### 3. `max_tokens` 是 reasoning 模型评测的隐形杀手

Gemini 最初看起来「strict 反而更差」，根因是 YAML 重复键导致 `max_tokens: 1200` 静默覆盖了 `8192` —— 模型 HTTP 200 正常返回，但输出被截成半句话，judge 仍按「半份简历」打分。修复后 Gemini strict 诚实度从 0.50 升至 0.90。详见 [docs/METHODOLOGY.md#finding-2-max_tokens-是-reasoning-模型评测的隐形杀手](docs/METHODOLOGY.md#finding-2-max_tokens-是-reasoning-模型评测的隐形杀手)。

---

## 我做了什么

端到端独立完成的 LLM 评测项目，覆盖从问题定义到可复现结论的全链路：

- **数据集**：20 份真实脱敏简历 + 目标 JD，含 `forbidden_terms` 规则标注与 PII 质检脚本
- **评测框架**：基于 [promptfoo](https://promptfoo.dev/) 的多模型 × 多 prompt A/B 流水线
- **混合评分**：规则层（反捏造关键词）+ LLM-as-judge（诚实度 / 贴合度 / 专业度）
- **Meta-eval**：自研 [JudgeBuddy](https://github.com/melody-ling-L/judgebuddy) 标注工具，支持 human-vs-judge 分歧分析
- **报告发布**：GitHub Actions 自动部署静态评测报告到 GitHub Pages
- **方法论贡献**：发现并文档化 reasoning 模型 token 预算对 long-form eval 的系统性干扰

**技术栈**：promptfoo · Python（数据分析 / 质检）· Node.js（provider 扩展 / HTML 导出）· GPT-4o judge · GitHub Actions

---

## 四个评分维度

| 维度 | 测量什么 |
|---|---|
| `规则_反捏造` | 是否出现预先标注的无依据关键词或禁用表达 |
| `语义_诚实度` | 是否引入原简历不支持的项目、技术、资历或跨领域包装 |
| `岗位_贴合度` | 是否在不捏造的前提下更贴合目标 JD |
| `表达_专业度` | 改写后是否像一份结构清晰、措辞专业的简历 |

---

## 快速体验

```bash
git clone https://github.com/melody-ling-L/eval-resume.git
cd eval-resume
cp .env.example .env          # 填入 API_AIHUBMIX_KEY
npm install -g promptfoo

# 只跑前 3 个 case，约 3 分钟
promptfoo eval --filter-first-n 3 --max-concurrency 1
promptfoo view
```

完整复现步骤见 [docs/REPRODUCE.md](docs/REPRODUCE.md)。

---

## 仓库结构

```text
eval-resume/
  data/              # 20 cases：脱敏简历 + JD + forbidden_terms
  prompts/           # rewrite_basic.txt vs rewrite_strict.txt
  scripts/           # 质检、分析、HTML 导出
  meta_eval/         # JudgeBuddy 人工标注工具
  reports/           # 评测结果与分析报告
  docs/              # GitHub Pages 在线报告 + 方法论文档
  promptfooconfig.yaml
```

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | 完整方法论、prompt 设计、两个核心 finding 的细节 |
| [docs/REPRODUCE.md](docs/REPRODUCE.md) | 环境配置、全量跑法、人工标注流程 |
| [在线报告](https://melody-ling-l.github.io/eval-resume/) | 可交互的逐 case 评测结果 |
| [JudgeBuddy](https://github.com/melody-ling-L/judgebuddy) | LLM-as-judge 人工校准工具 |

---

## 局限性与诚实声明

- 20 个 case 足以看强信号，但不适合做宏大排名结论
- Judge 仍是 LLM（temperature=0 + 规则层），非人工 gold set
- 聚焦中文简历改写，结果不应直接外推到所有语言和市场
- Headline 表为透明合并快照（GPT/Claude 完整 run + Gemini token 修复后 rerun）

---

## License

代码：MIT（[LICENSE](LICENSE)）· 数据：CC BY-NC 4.0（[LICENSE-DATA.md](LICENSE-DATA.md)）

## Citation

```bibtex
@misc{resumerewritebench2026,
  title  = {ResumeRewriteBench: Evaluating LLM Honesty in Chinese Resume Rewriting},
  author = {Melody},
  year   = {2026},
  url    = {https://github.com/melody-ling-L/eval-resume}
}
```

## Contact

- GitHub：[@melody-ling-L](https://github.com/melody-ling-L)
- Issues：[GitHub Issues](https://github.com/melody-ling-L/eval-resume/issues)
- Email：joy025010joy@gmail.com

---

<sub>Last updated: 2026-06-24</sub>

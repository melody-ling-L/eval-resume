# Step 8 Summary - 20-Case ResumeRewriteBench

## Data Quality

- `data/cases.csv` contains 20 cases across 20 categories.
- `case_04` through `case_20` use anonymized resume text in `data/resumes_anon/`.
- QA hard failures: 0.
- Real-resume PII scan found no real names, emails, mobile numbers, long phone-like digit strings, or known precise addresses.
- `forbidden_terms` no longer overlap with the source resume text, avoiding rule-layer false positives.

## Eval Runs

- Pilot: `case_01`, `case_04`, `case_05` x 3 providers.
  - Output: `reports/evals/pilot.json`, `reports/evals/pilot.csv`.
  - Result: 0 provider errors, 0 file loading errors, 0 model-name errors.
- Full run: 20 cases x 3 providers.
  - Output: `reports/evals/full_20x3.json`, `reports/evals/full_20x3.csv`.
  - Result: 13 passed, 47 failed, 0 errors.
  - Duration: 10m 18s at `--max-concurrency 2`.
  - Tokens: 168,875 eval tokens + 380,110 grading tokens.

## Model Results

| provider | pass rate | avg score | rule anti-hallucination | semantic honesty | JD fit | expression quality |
|---|---:|---:|---:|---:|---:|---:|
| GPT-5.4 | 50.0% | 0.931 | 0.850 | 0.850 | 0.800 | 1.000 |
| Claude Sonnet 4.6 | 5.0% | 0.836 | 0.550 | 0.300 | 1.000 | 0.990 |
| Gemini 3 Flash Preview | 10.0% | 0.832 | 1.000 | 0.650 | 0.750 | 0.605 |

Passed cases:

- GPT-5.4: `case_03`, `case_06`, `case_07`, `case_13`, `case_14`, `case_15`, `case_16`, `case_17`, `case_18`, `case_19`.
- Claude Sonnet 4.6: `case_10`.
- Gemini 3 Flash Preview: `case_04`, `case_17`.

Primary failure modes:

- GPT-5.4: mostly weak JD fit or occasional rule/semantic hallucination, but strongest overall honesty.
- Claude Sonnet 4.6: strongest JD fit, but frequent semantic honesty and rule-layer hallucination failures.
- Gemini 3 Flash Preview: avoids forbidden terms well, but often loses formatting/professionalism or even candidate-name preservation.

## Interpretation

The expanded 20-case run supports the earlier small-sample hypothesis:

- GPT is the most conservative and honest in this benchmark.
- Claude is the most aggressive: excellent JD fit, but much more likely to overfit the JD and introduce unsupported claims.
- Gemini is conservative on literal forbidden terms, but weaker as a resume formatter/editor and less reliable at preserving required identity fields.

## Next Step

Move to Step 9: prompt A/B comparison. Keep `rewrite_basic.txt` as baseline A, create a stricter B prompt that explicitly optimizes for:

- preserving candidate identity fields,
- avoiding unsupported JD keyword injection,
- using "learning/interest" wording only for abstract directions,
- improving JD fit through reordering and emphasis rather than invented facts.

# Third-Party Notices — Oh-My-BBFF

Scope: this file covers third-party copyrighted expression reproduced in, or adapted into, the
Oh-My-BBFF plugin family (`packages/oh-my-bbff-team`, `packages/oh-my-bbff-superpowers`, and the
rest of the monorepo). It was prepared on 2026-11-13 from the upstream sources identified in each
section — canonical repository URL, version, and commit — and records the textual-overlap
measurement behind each conclusion.

Summary of obligations:

- **Superpowers** (MIT, Copyright (c) 2025 Jesse Vincent): eleven skill files in
  `oh-my-bbff-superpowers` contain substantially adapted or verbatim text. The MIT notice and
  licence are reproduced in Section 1 and must accompany distributions of this package.
- **oh-my-opencode-slim** (MIT, Copyright (c) 2025): no protected expression is reproduced; the
  Team role prompts, leader briefs, and doctrine were written independently against the same role
  semantics. Informational credit only — Section 2.
- **OMO post-2025-12-24 (Sustainable Use License 1.0 era)**: no shared passage of protectable
  length was found, so no SUL-era text is carried. Check recorded in Section 3.

This document is a provenance record, not legal advice.

---

## 1. Superpowers — MIT — text included and adapted

**Project:** Superpowers
**Canonical URL:** https://github.com/obra/superpowers
**Upstream used:** `superpowers-lite` — an MIT-licensed fork of `obra/superpowers`
(https://github.com/BB-84C/superpowers-lite), package version `0.1.0`, git commit
`b7c8c97959f290ca9140b77bcde5c356572b681f`. The original `superpowers` release v6.1.1, commit
`d884ae04edebef577e82ff7c4e143debd0bbec99`, is also referenced; its MIT notice is identical.

**Upstream copyright notice, exactly as it appears in the `superpowers-lite` LICENSE:**

```
Copyright (c) 2025 Jesse Vincent
```

**Oh-My-BBFF files containing adapted text** (paths relative to
`packages/oh-my-bbff-superpowers`; "matched" = share of the BBFF file's sentences that appear
verbatim or near-verbatim in the upstream file; "longest run" = longest shared contiguous
passage, in words):

| Oh-My-BBFF file | Upstream file (superpowers-lite) | matched | longest run | assessment |
|---|---|---:|---:|---|
| `skills/brainstorming/SKILL.md` | `skills/brainstorming/SKILL.md` | 91.7% (33/36) | 261 | substantially derived |
| `skills/systematic-debugging/SKILL.md` | `skills/systematic-debugging/SKILL.md` | 62.5% (20/32) | 140 | substantially derived |
| `skills/systematic-debugging/condition-based-waiting.md` | `skills/systematic-debugging/condition-based-waiting.md` | 94.3% (33/35) | 297 | substantially derived; same text also present in superpowers 6.1.1 |
| `skills/systematic-debugging/defense-in-depth.md` | `skills/systematic-debugging/defense-in-depth.md` | 100% (12/12) | 131 | verbatim copy of the lite rewrite |
| `skills/systematic-debugging/root-cause-tracing.md` | `skills/systematic-debugging/root-cause-tracing.md` | 100% (13/13) | 157 | verbatim copy of the lite rewrite |
| `skills/test-driven-development/SKILL.md` | `skills/test-driven-development/SKILL.md` | 97.2% (35/36) | 352 | substantially derived |
| `skills/test-driven-development/testing-anti-patterns.md` | `skills/test-driven-development/testing-anti-patterns.md` | 22.5% (16/71) | 36 | adapted; same text also present in superpowers 6.1.1 |
| `skills/verification-before-completion/SKILL.md` | `skills/verification-before-completion/SKILL.md` | 85.4% (41/48) | 354 | substantially derived |
| `skills/writing-plans/SKILL.md` | `skills/writing-plans/SKILL.md` | 10.4% (12/115) | 127 | adapted; one verbatim section, file otherwise extended |
| `skills/independent-review/reviewer-prompt.md` | `skills/requesting-code-review/code-reviewer.md` | 100% (7/7) | 87 | verbatim copy |
| `skills/independent-review/SKILL.md` | `skills/requesting-code-review/SKILL.md` | 4.3% (1/23) | 15 | adapted with one shared passage |

The remaining skill markdown files (`skills/bbff-team-leading/**`,
`skills/bbff-team-member/SKILL.md`,
`skills/verification-before-completion/references/bbff-evidence.md`) contain no shared passage of
12 words or more with any upstream source and are treated as independently written.

**Full MIT licence text, reproduced from the `superpowers-lite` LICENSE:**

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. oh-my-opencode-slim — MIT — informational credit, no reproduced expression

**Project:** oh-my-opencode-slim (a slimmed-down fork of oh-my-opencode)
**Canonical URL:** https://github.com/alvinunreal/oh-my-opencode-slim
**Upstream version:** `1.1.2`, git commit `89f7a4025f2547584aa91c674fc508593a668006` (2026-06-08)

**Upstream copyright notice, exactly as it appears in the upstream LICENSE:**

```
Copyright (c) 2025
```

**Measured result: no shared expression.** All 39 Oh-My-BBFF Team texts (seven role identity
prompts, seven five-section leader briefs, twenty-five doctrine templates including the rendered
role table) were compared with the whole Slim source tree, its prompt overrides, and the installed
upstream packages: 2 of 554 sentences matched (0.4% aggregate; at most 3.3% in any one
text), and the longest shared contiguous passage in any of them is 10 words. Every match is a
stock interface phrase, not creative prose — the four-label status set (`DONE`,
`DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`), the oracle verdict-line convention
(`Verdict: none of these are mergeable`), `never ask them to write files`, `three only for
high-stakes unresolved decisions`, and the capability-gap field labels
(`field / editor / panel / operation / create / append / replace / fill in / content`).

The Oh-My-BBFF role taxonomy, role permissions, leader-brief structure, and Lead doctrine were
aligned with Slim in concept and structure only; the wording is independently written for
DeepSeek Harness. Because no Slim text is reproduced, this section is a credit and provenance
record, and no Slim licence text is required to accompany Oh-My-BBFF.

---

## 3. Sustainable Use License era check (oh-my-opencode after 2025-12-24)

`oh-my-opencode` (`https://github.com/code-yeongyu/oh-my-opencode`), the upstream that
oh-my-opencode-slim forks, was MIT (`Copyright (c) 2025 YeonGyu Kim`) until 2025-12-24 and is
licensed under the Sustainable Use License 1.0 after that date.

**Check performed:** for every Oh-My-BBFF text, the longest shared verbatim passage with Slim
(including its fork's TypeScript prompt sources) is at most 10 words (Section 2). No shared
passage reaches the 12-word reporting threshold, so there is no candidate passage to trace to
OMO's SUL-era history, and no SUL-era OMO text is carried in Oh-My-BBFF.

**Residual caveat, stated honestly:** Slim's own git history begins 2026-01-15 ("Initial clean
version"), so it cannot date Slim's text against the 2025-12-24 boundary, and a commit-by-commit
trace into the OMO upstream repository was not run because there is no shared passage above the
threshold to trace. This is not a blocker for release on the evidence measured.

---

## 4. Oh-My-BBFF's own licence

Oh-My-BBFF is MIT-licensed, `Copyright (c) 2026 Siyu Cheng` (see the repository `LICENSE`).

---

## Appendix — measurement method

- Method: whitespace collapsed; case-folded; markdown emphasis/table characters removed; token
  punctuation stripped (letters, digits, apostrophe, hyphen kept). Sentence units are lines and
  sentence-ends of at least six tokens. A sentence counts as matched when it appears verbatim, or
  when its token-sequence similarity to an upstream sentence is >= 0.9. The longest shared
  passage is the longest contiguous token run shared with one upstream file. Verdicts:
  `substantially derived` = >= 50% of sentences matched; `adapted with shared passages` = 5–50%
  matched or any shared run >= 12 words; otherwise `independently written (same ideas)`.
- Upstream corpora compared: the OMO Slim source tree (TypeScript prompt sources and shipped
  skills), its prompt overrides and config strings, `superpowers-lite` (all markdown), and
  `superpowers` 6.1.1 (all markdown).

# Reporting Protocols

When presenting findings, progress, or completion to the owner, adhere to these communication rules. Your goal is to keep the owner informed, not overwhelmed.

## 1. Core Principles
- **Conclusion First in Plain Language**: State the high-level outcome in the first sentence. Do not bury the lede.
- **Use the Owner's Vocabulary**: Mirror terms like "canary", "channel", or "account". If the owner calls it a "slot", do not call it a "buffer". Never rename system states.
- **No Internal Jargon as Explanation**: The owner does not care about internal task IDs, variable names, or file-by-file recitals. Group findings by impact, not by process steps.
- **Decisions Up Front**: If you are blocked or need input, lead with the request. Provide options and your clear recommendation.
- **Numbers Carry Denominator and Source**: Never state a naked count. Always report context (e.g., "4/5 skills written").
- **Partition Status Categories**: Keep "Delivered", "Blocked", and "In Flight" separate. The owner's attention budget is scarce; don't mix routine status with critical blockers.
- **Label Guesses and Unverified Items**: Clearly prefix unverified assumptions with "Unverified:" or "Hypothesis:". A member's report is a claim until you verify it yourself.
- **Link Artifacts Instead of Pasting**: Provide paths or markdown links. Paste only 1–3 line excerpts when necessary.
- **Answer Preceding Questions First**: Address open questions before starting dependent work.
- **State Blockers Before Waiting**: When waiting on the owner, clearly state what blocks you, what decision is required, and what independent work continues meanwhile.

## 2. Examples

### BAD Report
"I finished updating the plugin, total 5 files changed. 456 lines added. Fixed issues in #129, #130, #131. Screenshot capture failed (timeout), but looks fine."

### GOOD Report
"Plugin fix delivered. 4 of 5 requested stability checks passed; one capture failed.
- **Action**: Fix applied to `compaction.ts`.
- **Status**: 
  - Delivered: Stability fix installed.
  - Blocked: Screenshot capture; timeout in current harness environment.
  - In Flight: Automated regression tests.
- **Decision needed**: [Screenshot not captured] Options: 1. Manual review; 2. Automated retry. Recommended: Manual review."

## 3. Communication Strategy
- **Transparency**: If a tool fails, report the tool failure rather than guessing the output.
- **Brevity**: Use bullet points for status. If a report is longer than 15 lines, use summary bullets at the top.
- **Tone**: Calm, objective, and specific. Do not use fear language or slogans.
- **Verification**: If you report "done", ensure that the artifact is ready for inspection.
- **Escalation**: When blocked, provide clear options, not just a "help me" prompt. 
- **Context**: If you are awaiting a human decision, list exactly what you need to proceed.

(End of file - total 52 lines)

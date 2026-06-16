# SEO Article Optimization (Local Pre-Check)

You are a senior SEO editor. Your goal this round is to raise the **local pre-check score to ≥{{localScoreTarget}}** so the article can proceed to Semrush final review. Edits must be **short, direct, and score-driven**. The fastest score gains come from **missing SERP entity terms**.

## Current Score (fix the gaps below)

{{localScoreBreakdown}}

**Target: raise total score from {{localScore}} to ≥{{localScoreTarget}}.**

## Exact Score Gap Plan (follow this — scorer-aligned)

{{scoreGapPlan}}

{{contentCoverageMaxedBlock}}

### Optimization priority (highest ROI first)

| Priority | Dimension | Max pts | Fastest fix |
|----------|-----------|---------|-------------|
| 1 | SERP entities | 25 | Add one natural sentence per missing term; spread across sections |
| 2 | Keyword coverage | 25 | Keyword in first 200 chars; density 0.8%–2.5%; keyword in ≥1 H2 |
| 3 | Structure | 20 | ≥4 H2s; word count 70%–105% of target; add a bullet list |
| 4 | Readability | 20 | Short paragraphs and sentences — **do not delete entity sentences** |
| 5 | Content depth | 10 | Keep terminology coverage; maintain ≥700 words |

When readability and entity coverage conflict, **keep entities** and shorten surrounding filler instead — **unless READABILITY PRIORITY MODE is active below**, in which case entities stay but sentences MUST shorten.

{{readabilityPriorityBlock}}

## Previous Rounds (do not repeat failed edits)

{{optimizeHistoryContext}}

## This Round Focus (fix ONLY these dimensions)

{{focusDimensions}}

## Inputs

- Target keyword: {{keyword}}
- **Output language**: {{outputLanguage}}
- Brand voice: {{brandVoice}}
- Search intent: {{searchIntent}}
- Target word count: ~{{targetWordCount}} words (**70%–105%**)
- Brief summary:
{{briefSummary}}
- **SERP entity terms to cover** (each must appear at least once in exact form; each miss costs SERP points):
{{recommendedKeywords}}
- Optimization suggestions:
{{suggestions}}
- Current body (Markdown):
{{content}}

## Hard Requirements (all must pass)

1. Full target keyword phrase within the **first 200 characters**
2. Keyword density **0.8%–2.5%**, spread across 3–5 placements
3. At least **one H2** contains the target keyword
4. **Every SERP entity term** in the list above appears at least once (exact form)
5. Word count within **70%–105%** of target; if over, cut filler — **never cut entity-carrying sentences**
6. ≥4 H2 sections; at least one `-` bullet list
7. Readability: paragraphs ≤80 words; sentences ≤22 words; minimize passive voice and `it is` fillers
8. ≥2 Markdown links and ≥2 image placeholders with descriptive alt text

## Edit Strategy

1. **Read previous rounds** — avoid any edit listed under "Failed approaches"
2. **Audit** — identify which scoring dimensions are below max from the breakdown above
3. **Patch SERP gaps first** — one contextual sentence per missing term in different sections
4. **Fix keyword placement** — opening paragraph and one H2 if missing
5. **Trim or expand length** — stay within 70%–105%; remove repetition before removing substance
6. **Tighten readability** — split long paragraphs and sentences without losing entities or facts
7. **Preserve** — URLs, numbers, specs, tables, and unique insights from the Brief

Do not rewrite the entire article unless structure is broken. Prefer surgical edits. **Touch only the focus dimensions this round.**

## Pre-Output Verification

- [ ] Score gaps addressed in priority order
- [ ] Every listed SERP entity term present (exact form)
- [ ] Keyword, structure, and length requirements met
- [ ] Facts and links unchanged
- [ ] `changesSummary` names which entities were added and which score dimensions improved

## Output

Return **valid JSON only** — no Markdown code fences:

```json
{
  "content": "Optimized full Markdown body",
  "changesSummary": ["e.g. Added SERP terms CAN Bus, RS485; keyword in H2; split 3 long paragraphs"],
  "warnings": []
}
```

`changesSummary` must state which SERP terms were added and which scoring dimensions you targeted. Use `warnings` for requirements you could not meet without breaking facts or user intent.

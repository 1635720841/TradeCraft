# QuillBot-Style Original Expression Polish

You are a senior editor performing **original expression optimization** on AI-generated SEO content. This is NOT plagiarism evasion — only polish phrasing while preserving meaning, facts, links, and SEO targets.

## Inputs

- Target keyword: {{keyword}}
- **Output language**: {{outputLanguage}} (body must stay in this language)
- Brand voice: {{brandVoice}}
- Protected terms (must appear unchanged where already used): {{protectedTerms}}
- Current body (Markdown):
{{content}}

## Requirements

1. Rephrase sentences for natural, human-like flow; reduce repetitive AI patterns
2. **Preserve exactly**: all Markdown links `[text](url)`, image syntax, headings structure, lists, tables
3. **Preserve**: target keyword in first 200 characters; keyword density roughly unchanged
4. **Preserve**: all protected terms in original spelling
5. **Preserve**: facts, numbers, specs — do not invent or alter data
6. Word count within **95%–105%** of original
7. Do not remove or add sections; surgical rephrasing only

## Output

Return **valid JSON only**:

```json
{
  "content": "Full revised Markdown body",
  "changesSummary": ["Brief bullet on what was improved"],
  "warnings": ["Any trade-offs or phrases kept verbatim on purpose"]
}
```

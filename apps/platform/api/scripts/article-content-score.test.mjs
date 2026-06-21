/**
 * 文章内容评分单元测试。
 *
 * 运行：node apps/platform/api/scripts/article-content-score.test.mjs
 */

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const utilPath = pathToFileURL(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/project-types/seo-factory/utils/article-content-score.util.js',
  ),
).href;

const { scoreArticleContent, resolvePrimaryScoreNode } = await import(utilPath);
const { normalizeArticleScoreContent } = await import(
  pathToFileURL(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../packages/shared-core/dist/seo/article-score-content.util.js',
    ),
  ).href,
);

const content =
  '# Magnesium for Sleep\n\nMagnesium helps sleep quality and relaxation.\n'.repeat(8);

const result = scoreArticleContent({
  targetKeyword: 'magnesium for sleep',
  content,
  submittedKeywords: ['magnesium for sleep', 'magnesium supplement'],
  competitorWordCount: 1400,
  model: null,
});

assert.ok(result.overall >= 0 && result.overall <= 10);
assert.equal(typeof result.passed, 'boolean');
assert.ok(result.primaryNode.label);
assert.ok(Array.isArray(result.suggestions));
assert.ok(Array.isArray(result.featureAttribution));

const node = resolvePrimaryScoreNode({
  breakdown: {
    keywordCoverage: 10,
    serpTermAlignment: 20,
    structure: 18,
    readability: 16,
    contentDepth: 8,
  },
  missingKeywordCount: 2,
  wordGap: 100,
});
assert.equal(node.key, 'keyword');

const hairContent = `# Hair Transplant Training: A Complete Hair Transplant Course

Hair transplant training programs teach physicians modern restoration skills.

## Key Takeaways

- Safe outcomes require structured training.
- A hair transplant course should include live observation.

## What Is Hair Transplant Training

Clinicians compare hair transplant course options before enrolling.
`.repeat(20);

const hair = scoreArticleContent({
  targetKeyword: 'hair transplant training',
  submittedKeywords: ['hair transplant training', 'hair transplant course'],
  content: hairContent,
  competitorWordCount: 2280,
  model: null,
});

assert.equal(hair.missingKeywordCount, 0);
assert.ok(
  hair.localBreakdown.keywordCoverage >= 20,
  `keywordCoverage expected >=20, got ${hair.localBreakdown.keywordCoverage}`,
);
const hairPlain = normalizeArticleScoreContent(`Hair Transplant Training: A Complete Hair Transplant Course

A complete hair transplant course should teach physicians modern restoration skills.
Structured programs may range from short courses to fellowships.

Key Takeaways

A complete hair transplant course should teach diagnosis and technique.
Strong hair transplant training should cover FUE and FUT.

Module 1: Foundations of Hair Restoration
The masterclass begins with the history of hair restoration.

Module 2: Patient Consultation and Surgical Planning
This module trains students in consultation and diagnosis.

Module 3: Hairline Design and Aesthetics
This module teaches physicians how to design a natural frame.

Module 4: Donor Area Management
This unit teaches physicians how to protect donor follicles.

Module 5: FUE Surgery Fundamentals
This module covers punch selection and extraction angles.

Module 6: Advanced FUE
This module covers long-hair FUE and repair surgery.

Module 7: FUT Surgery
This unit covers strip planning and closure methods.

Module 8: Recipient Site Creation
This module teaches how recipient sites determine angle and direction.

Module 9: Graft Handling and Microscopy
This learning block teaches graft anatomy and quality control.

Module 10: Implantation Techniques
This module covers forceps placement and team workflows.

Module 11: Surgical Team Building
This learning section covers technician education and OR workflow.

Module 12: Complications and Troubleshooting
This module covers folliculitis and poor growth.

Module 13: Postoperative Management
This module covers washing protocols and follow-up schedules.

Module 14: Hair Loss Medicine for Surgeons
This unit covers finasteride and topical therapies.

Module 15: Practice Building and Marketing
This unit covers brand development and consultation conversion.

Why Complete Education Matters
Complete education matters because surgical technique alone does not prepare a physician.
`.repeat(3));

const hairPlainResult = scoreArticleContent({
  targetKeyword: 'hair transplant training',
  submittedKeywords: ['hair transplant training', 'hair transplant course'],
  content: hairPlain,
  competitorWordCount: 2280,
  model: null,
});

assert.equal(hairPlainResult.missingKeywordCount, 0);
assert.ok(
  hairPlainResult.overall >= 8.8,
  `plain SWA-like overall expected >=8.8, got ${hairPlainResult.overall}`,
);

console.log('article-content-score.test.mjs: ok');

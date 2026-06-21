/**
 * plain text hair transplant SWA 对齐冒烟测试（仅 shared-core）。
 */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/shared-core/dist/seo');
const { normalizeArticleScoreContent } = await import(pathToFileURL(`${root}/article-score-content.util.js`).href);
const { scoreLocalSeo } = await import(pathToFileURL(`${root}/local-seo-score.js`).href);
const { buildCalibrationFeatures, estimateSemrushOverallFromFeatures } = await import(
  pathToFileURL(`${root}/score-calibration-model.js`).href,
);

const content = normalizeArticleScoreContent(`Hair Transplant Training: A Complete Hair Transplant Course

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

const local = scoreLocalSeo({
  keyword: 'hair transplant training',
  submittedKeywords: ['hair transplant course'],
  content,
  competitorWordCount: 2280,
});

const features = buildCalibrationFeatures({
  localScore: local.score,
  breakdown: local.breakdown,
  metrics: local.metrics,
  semrushContext: { competitorWordCount: 2280, missingKeywordCount: 0 },
});

const overall = estimateSemrushOverallFromFeatures(features, local.score);
console.log('local', local.score, local.breakdown, 'overall', overall);
assert.ok(overall >= 8.8, `overall ${overall} expected >=8.8`);
assert.ok(local.breakdown.structure >= 16, `structure ${local.breakdown.structure}`);
console.log('hair-transplant-swa-align.test.mjs: ok');

/**
 * 拉取 Semrush actionableIssues（自动点语气/展示更多 + DOM 解析）。
 * 用法：cd apps/platform/api && pnpm run build && node scripts/semrush-actionable-probe.mjs
 */
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(apiRoot, '.env') });

process.env.SEMRUSH_ENABLED = 'true';
process.env.SEMRUSH_HEADLESS = process.env.SEMRUSH_HEADLESS ?? 'false';
process.env.SEMRUSH_DEBUG_SIDEBAR = process.env.SEMRUSH_DEBUG_SIDEBAR ?? '0';

const OUT = join(apiRoot, '.semrush-session', 'probe');

const { SemrushRpaAdapter } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-rpa.adapter.js'
);
const { SemrushSessionManager } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-session.manager.js'
);
const { SemrushBrowserPool } = await import(
  '../dist/project-types/seo-factory/providers/semrush/semrush-browser-pool.js'
);

class ConsoleLogger {
  info(msg, meta) {
    console.log('[info]', msg, meta ?? '');
  }
  error(msg, meta) {
    console.error('[error]', msg, meta ?? '');
  }
  warn(msg, meta) {
    console.warn('[warn]', msg, meta ?? '');
  }
}

/** ~1100 词，含随意句、被动语态、复杂词，目标 8.5–9.0 分 */
function buildNearPassArticle() {
  const casual = [
    'For B2B teams, the value is clear.',
    'One buyer insight stands out here.',
    'Proof that the system fits your site reduces risk.',
    'Warranty terms also matter.',
    'Support speed matters too.',
  ];
  const passive = [
    'Cell balancing is managed by the firmware during each charge cycle.',
    'Pack voltage is monitored by the smart bms in real time.',
    'Fault events are logged by the controller and exported to fleet tools.',
    'Thermal limits are enforced by protection boards before damage occurs.',
    'State of charge is calculated by algorithms that use coulomb counting.',
    'Communication with inverters is handled by CAN Bus or RS485 interfaces.',
    'Individual cells are protected by hardware and software layers together.',
    'Charging profiles are adjusted by the BMS based on temperature readings.',
  ];
  const complex = [
    'Teams need scalability and serviceability when they deploy across multiple sites.',
    'Serviceability improves when fault logs are accessible without proprietary tools.',
    'Scalability depends on consistent firmware and wiring standards across fleets.',
  ];
  const neutral = [
    'A smart bms monitors lithium-ion battery packs, balances cells, and protects against overcharge.',
    'Battery management system bms hardware sits between cells, chargers, and loads in a power system.',
    'Operators use dashboards to review cell balancing trends and charging and discharging cycle counts.',
    'Buyers compare management system bms specs, thermal runaway protections, and full charge cutoffs.',
    'Installers follow wiring guides for CAN Bus, RS485, and individual cells sense harnesses.',
    'Fleet managers track battery packs across sites and confirm fit with target loads and inverters.',
    'Vendors should explain how fault logs support warranty claims and spare parts processes.',
    'Field teams verify lithium ion battery compatibility with chargers before commissioning.',
    'Maintenance plans include quarterly inspections of connectors, fuses, and communication buses.',
    'Documentation should list nominal voltage, max current, and recommended operating temperature.',
    'Integrators map BMS alerts to SCADA or cloud monitoring for faster response times.',
    'Procurement teams ask about firmware update policies and remote diagnostics options.',
    'Safety reviews cover isolation, grounding, and emergency shutdown procedures for each site.',
    'Training materials explain how to read state of health metrics and interpret alarm codes.',
    'Project leads align BMS selection with inverter brands and expected peak power demand.',
  ];

  const sections = [
    '# Smart BMS Guide for Lithium Battery Systems',
    '',
    '## Introduction',
    '',
    `${casual[0]} ${neutral[0]} ${passive[0]} ${complex[0]}`,
    '',
    '## Core Functions',
    '',
    `${neutral[1]} ${passive[1]} ${neutral[2]}`,
    '',
    `${passive[2]} ${casual[1]} ${neutral[3]}`,
    '',
    '## Deployment and Integration',
    '',
    `${complex[1]} ${passive[3]} ${neutral[4]}`,
    '',
    `${neutral[5]} ${passive[4]} ${casual[2]}`,
    '',
    `${passive[5]} ${neutral[6]} ${complex[2]}`,
    '',
    '## Buyer Checklist',
    '',
    `${casual[3]} ${casual[4]} ${neutral[7]}`,
    '',
    `${neutral[8]} ${passive[6]} ${neutral[9]}`,
    '',
    '## Operations and Maintenance',
    '',
    `${neutral[10]} ${passive[7]} ${neutral[11]}`,
    '',
    `${neutral[12]} ${neutral[13]} ${neutral[14]}`,
  ];

  const extraBlocks = [];
  for (let i = 0; i < 8; i += 1) {
    const p = neutral[i % neutral.length];
    const q = passive[i % passive.length];
    const r = i % 3 === 0 ? casual[i % casual.length] : neutral[(i + 3) % neutral.length];
    extraBlocks.push(`## Section ${i + 5}`, '', `${p} ${q} ${r}`, '');
  }

  return [...sections, ...extraBlocks].join('\n');
}

const logger = new ConsoleLogger();
const browserPool = new SemrushBrowserPool(logger);
const sessionManager = new SemrushSessionManager(logger, browserPool);
const adapter = new SemrushRpaAdapter(sessionManager, logger);

const sample = buildNearPassArticle();
const wordCount = sample.split(/\s+/).filter(Boolean).length;
console.log(`[probe] sample words: ${wordCount}`);

const startedAt = Date.now();
console.log('[probe] starting Semrush checkScore (near-pass smart bms sample)…');

try {
  const result = await adapter.checkScore({
    keyword: 'smart bms',
    recommendedKeywords: [
      'battery management system bms',
      'lithium batteries',
      'cell balancing',
      'power system',
      'battery packs',
      'lithium ion battery',
    ],
    content: sample,
  });

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const summary = {
    elapsedSec: elapsed,
    sampleWordCount: wordCount,
    overall: result.overall,
    analysisSource: result.analysisSource,
    semrushReadabilityScore: result.semrushReadabilityScore,
    semrushCurrentWordCount: result.semrushCurrentWordCount,
    actionableCount: result.actionableIssues?.length ?? 0,
    missingTarget: result.semrushMissingTargetKeywords ?? [],
    missingRecommended: result.semrushMissingRecommendedKeywords ?? [],
    actionableIssues: result.actionableIssues ?? [],
    suggestionDetails: result.suggestionDetails ?? {},
    apiUrls: result.apiUrls ?? [],
  };

  await mkdir(OUT, { recursive: true });
  const outPath = join(OUT, 'actionable-probe.json');
  await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n=== Semrush Actionable Probe ===');
  console.log(`elapsed: ${elapsed}s`);
  console.log(`overall: ${result.overall}/10`);
  console.log(`actionableIssues: ${summary.actionableCount}`);
  console.log(`analysisSource: ${result.analysisSource}`);
  console.log(`suggestionDetails keys: ${Object.keys(summary.suggestionDetails).join(', ') || '(none)'}`);
  console.log(`saved: ${outPath}`);

  if (summary.actionableCount > 0) {
    console.log('\n--- actionableIssues ---');
    console.log(JSON.stringify(result.actionableIssues, null, 2));
  } else {
    console.warn('\n[warn] actionableIssues empty — re-run with SEMRUSH_DEBUG_SIDEBAR=1');
  }
} finally {
  await browserPool.onModuleDestroy();
}

/**
 * 单任务评分诊断：读取 DB 中 optimizeHistory / local metrics。
 * 运行：node apps/platform/api/scripts/job-score-debug.mjs <jobId>
 */
import { PrismaClient } from '@prisma/client';

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: node job-score-debug.mjs <jobId>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const job = await prisma.articleJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      traceId: true,
      status: true,
      targetKeyword: true,
      localSeoScore: true,
      semrushScore: true,
      errorMessage: true,
      seoCheckData: true,
      draftData: true,
      organizationId: true,
      projectId: true,
    },
  });
  if (!job) {
    console.log('JOB NOT FOUND');
    process.exit(1);
  }

  const draft = job.draftData;
  const seo = job.seoCheckData;
  const optimizeHistory = draft?.optimizeHistory ?? [];

  console.log('=== JOB SUMMARY ===');
  console.log(
    JSON.stringify(
      {
        id: job.id,
        status: job.status,
        keyword: job.targetKeyword,
        localSeoScore: job.localSeoScore,
        semrushScore: job.semrushScore,
        errorMessage: job.errorMessage,
        gateMode: seo?.local?.gateMode,
        predictedSemrush: seo?.local?.predictedSemrush,
        localPassed: seo?.local?.passed,
        scoreThresholds: seo?.scoreThresholds,
        optimizeRoundCount: optimizeHistory.filter((h) => h.kind !== 'baseline').length,
      },
      null,
      2,
    ),
  );

  console.log('\n=== LOCAL BREAKDOWN ===');
  console.log(JSON.stringify(seo?.local?.breakdown ?? null, null, 2));

  console.log('\n=== LOCAL METRICS (key) ===');
  const m = seo?.local?.metrics;
  if (m) {
    console.log(
      JSON.stringify(
        {
          wordCount: m.wordCount,
          fleschReadingEase: m.fleschReadingEase,
          fleschTarget: m.fleschTarget,
          longSentencesOver22: m.longSentencesOver22,
          longParagraphsOver65: m.longParagraphsOver65,
          passiveVoiceHits: m.passiveVoiceHits,
          semrushComplexWordHits: m.semrushComplexWordHits,
          hardToReadSentenceHits: m.hardToReadSentenceHits,
          keywordDensity: m.keywordDensity,
          casualSentenceHits: m.casualSentenceHits,
        },
        null,
        2,
      ),
    );
  }

  console.log('\n=== OPTIMIZE HISTORY ===');
  for (const h of optimizeHistory) {
    console.log(
      JSON.stringify({
        phase: h.phase,
        round: h.round,
        kind: h.kind,
        scoreBefore: h.scoreBefore,
        scoreAfter: h.scoreAfter,
        predictedBefore: h.predictedSemrushBefore,
        predictedAfter: h.predictedSemrushAfter,
        rolledBack: h.rolledBack,
        rollbackReason: h.rollbackReason,
        candidateScore: h.candidateScore,
        candidatePredicted: h.candidatePredictedSemrush,
        changesSummary: h.changesSummary?.slice?.(0, 2),
      }),
    );
  }

  console.log('\n=== LOCAL SUGGESTIONS ===');
  console.log(JSON.stringify(seo?.local?.suggestions ?? [], null, 2));

  const project = await prisma.project.findFirst({
    where: { id: job.projectId, organizationId: job.organizationId },
    select: { name: true, config: true },
  });
  const cfg = project?.config;
  const cal = cfg?.scoreCalibration;
  console.log('\n=== PROJECT CALIBRATION ===');
  console.log(
    JSON.stringify(
      {
        projectName: project?.name,
        localAlignEnabled: cal?.localAlignEnabled,
        modelSampleCount: cal?.model?.trainSampleCount ?? cal?.model?.sampleCount,
        holdoutMae: cal?.model?.holdoutMae,
        intercept: cal?.model?.intercept,
        topWeights: cal?.model?.weights
          ? Object.entries(cal.model.weights)
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .slice(0, 8)
              .map(([k, v]) => ({ k, w: v }))
          : null,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}

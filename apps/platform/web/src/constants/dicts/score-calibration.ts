/**
 * 快照类型字典：校准实验室配对来源。
 */

import type { DictItem } from "@/utils/dict";

export const scoreSnapshotKindDict: DictItem[] = [
  { value: "local_checkpoint", label: "本地检查点", type: "info" },
  { value: "semrush_check", label: "Semrush 检测", type: "primary" },
  { value: "semrush_manual_check", label: "Semrush 手动", type: "warning" }
];

export const scoreCalibrationConfidenceDict: DictItem[] = [
  { value: "high", label: "高", type: "success" },
  { value: "medium", label: "中", type: "warning" },
  { value: "low", label: "低", type: "info" }
];

export type ScoreCalibrationReadinessState =
  | "insufficient"
  | "shadow_only"
  | "holdout_unstable"
  | "trial_ready"
  | "production_ready";

export const scoreCalibrationReadinessDict: DictItem[] = [
  { value: "insufficient", label: "样本不足", type: "info" },
  { value: "shadow_only", label: "仅影子采集", type: "warning" },
  { value: "holdout_unstable", label: "验证集不稳定", type: "warning" },
  { value: "trial_ready", label: "可试验降频", type: "success" },
  { value: "production_ready", label: "可生产降频", type: "success" }
];

export const scoreCalibrationDatasetDict: DictItem[] = [
  { value: "all", label: "全部", type: "primary" },
  { value: "holdout", label: "验证集", type: "warning" },
  { value: "train", label: "训练集", type: "info" },
  { value: "excluded", label: "已排除", type: "danger" }
];

export const scoreCalibrationPairSourceDict: DictItem[] = [
  { value: "all", label: "全部来源", type: "primary" },
  { value: "workflow", label: "流程 RPA", type: "primary" },
  { value: "manual", label: "手动录入", type: "warning" }
];

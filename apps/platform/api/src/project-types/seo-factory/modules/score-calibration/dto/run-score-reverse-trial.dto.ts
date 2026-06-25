/** 自动执行一轮 Semrush 反推检测。 */

import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SCORE_REVERSE_FACTOR_KEYS } from '../../../utils/score-reverse-experiment.util';

const SCORE_REVERSE_VARIANT_KEYS = ['baseline', ...SCORE_REVERSE_FACTOR_KEYS] as const;

export class RunScoreReverseTrialDto {
  @IsIn(SCORE_REVERSE_VARIANT_KEYS)
  variantKey!: (typeof SCORE_REVERSE_VARIANT_KEYS)[number];

  @IsInt()
  @Min(1)
  @Max(3)
  round!: number;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  preferredNodeKey?: string;
}

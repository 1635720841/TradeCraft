export interface ParaphraseInput {
  keyword: string;
  content: string;
  brandVoice?: string;
  contentLanguage?: string;
  /** Brief + Semrush + 站点 + 正文规格，改写时须保留 */
  protectedTerms?: string[];
  searchIntent?: string;
  briefSummary?: string;
  semrushCurrentWordCount?: number;
  semrushCompetitorWordCount?: number;
  semrushWordCountCap?: number;
  /** 分块润色时的段落说明（注入 Prompt） */
  chunkHint?: string;
}

export interface ParaphraseOutput {
  content: string;
  promptVersion: string;
  changesSummary?: string[];
  warnings?: string[];
}

export interface ParaphraseValidateInput {
  keyword: string;
  originalContent: string;
  paraphrasedContent: string;
  contentLanguage?: string;
  protectedTerms?: string[];
}

export interface ParaphraseValidateOutput {
  passed: boolean;
  warnings: string[];
  promptVersion: string;
}

export interface IParaphraseProvider {
  paraphrase(input: ParaphraseInput): Promise<ParaphraseOutput>;
  validate(input: ParaphraseValidateInput): Promise<ParaphraseValidateOutput>;
}

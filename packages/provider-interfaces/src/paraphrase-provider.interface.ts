export interface ParaphraseInput {
  keyword: string;
  content: string;
  brandVoice?: string;
  contentLanguage?: string;
  /** Brief 推荐实体词，改写时须保留 */
  protectedTerms?: string[];
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

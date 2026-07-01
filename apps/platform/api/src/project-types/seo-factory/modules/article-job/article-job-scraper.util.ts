import type { ArticleJobScraperOptions } from '../../processors/article-job.processor';
import { normalizeSerpCountry } from '../../constants/serp-research-settings';
import type { CreateArticleJobDto } from './dto/create-article-job.dto';

export function buildArticleJobScraperOptionsFromDto(
  dto: Pick<CreateArticleJobDto, 'serpArticleLimit' | 'serpArticlesOnly' | 'serpCountry'>,
  resolvedSerpCountry?: string,
): ArticleJobScraperOptions | undefined {
  const serpCountry = normalizeSerpCountry(dto.serpCountry) ?? resolvedSerpCountry;
  if (
    dto.serpArticleLimit === undefined &&
    dto.serpArticlesOnly === undefined &&
    !serpCountry
  ) {
    return undefined;
  }

  return {
    serpArticleLimit: dto.serpArticleLimit,
    serpArticlesOnly: dto.serpArticlesOnly,
    serpCountry,
  };
}

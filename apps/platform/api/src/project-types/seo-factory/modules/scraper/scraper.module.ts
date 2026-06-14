/**
 * SERP 抓取模块：M1-M3。
 *
 * 边界：
 * - 不负责：Provider 实现（SeoFactoryProvidersModule）
 */

import { Module } from '@nestjs/common';
import { SeoFactoryProvidersModule } from '../../providers/seo-factory-providers.module';
import { CompetitorPageScraper } from './competitor-page.scraper';
import { ScraperService } from './scraper.service';

@Module({
  imports: [SeoFactoryProvidersModule],
  providers: [ScraperService, CompetitorPageScraper],
  exports: [ScraperService],
})
export class ScraperModule {}

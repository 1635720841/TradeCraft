import { Module } from '@nestjs/common';
import { ProjectModule } from '../project/project.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ProjectModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}

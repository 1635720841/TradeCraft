import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AssignKeywordsToClusterDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  keywordIds!: string[];
}

import { IsString, Matches } from 'class-validator';

export class UpdatePromptBindingDto {
  @IsString()
  @Matches(/^seo_[a-z0-9_]+$/, {
    message: 'activeVersion 须为 seo_ 前缀的小写标识',
  })
  activeVersion!: string;
}

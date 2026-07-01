/**
 * 媒体资产来源枚举与业务层 source 字段互转。
 */

import { MediaAssetSource } from '@prisma/client';

export type ArticleImageSource = 'bfl' | 'upload' | 'url';

export function toMediaAssetSource(source: ArticleImageSource): MediaAssetSource {
  switch (source) {
    case 'bfl':
      return MediaAssetSource.BFL;
    case 'upload':
      return MediaAssetSource.UPLOAD;
    case 'url':
      return MediaAssetSource.URL;
    default:
      return MediaAssetSource.URL;
  }
}

export function fromMediaAssetSource(source: MediaAssetSource): ArticleImageSource {
  switch (source) {
    case MediaAssetSource.BFL:
      return 'bfl';
    case MediaAssetSource.UPLOAD:
      return 'upload';
    case MediaAssetSource.URL:
      return 'url';
    default:
      return 'url';
  }
}

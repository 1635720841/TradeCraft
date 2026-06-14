export interface ImageResult {
  url: string;
  alt: string;
}

export interface IImageProvider {
  generateImage(prompt: string): Promise<ImageResult>;
}

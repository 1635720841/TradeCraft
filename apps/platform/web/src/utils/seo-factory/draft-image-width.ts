/** 稿件图片宽度：Markdown `![alt](url "width:50%")` ↔ HTML style */

export const DRAFT_IMAGE_WIDTH_MIN = 25;
export const DRAFT_IMAGE_WIDTH_MAX = 100;
export const DRAFT_IMAGE_WIDTH_STEP = 10;
/** TipTap 缩放 px → 百分比时的参考内容宽度（与导出 HTML max-width 对齐） */
export const DRAFT_EDITOR_REFERENCE_WIDTH_PX = 760;

const CONTAINER_STYLE_WIDTH_PX_RE = /width:\s*([0-9.]+)px/i;

export const MARKDOWN_IMAGE_WITH_TITLE_RE =
  /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/;

export function parseImageWidthTitle(title: string | undefined | null): number | null {
  if (!title?.trim()) return null;
  const match = title.trim().match(/^width:(\d{1,3})%$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return clampImageWidth(value);
}

export function clampImageWidth(percent: number): number {
  return Math.min(DRAFT_IMAGE_WIDTH_MAX, Math.max(DRAFT_IMAGE_WIDTH_MIN, Math.round(percent)));
}

export function parseContainerStyleWidthPx(containerStyle: string | null | undefined): number | null {
  if (!containerStyle?.trim()) return null;
  const match = containerStyle.match(CONTAINER_STYLE_WIDTH_PX_RE);
  if (!match) return null;
  const px = Number.parseFloat(match[1]);
  return Number.isFinite(px) && px > 0 ? px : null;
}

export function pxWidthToPercent(
  px: number,
  referenceWidthPx = DRAFT_EDITOR_REFERENCE_WIDTH_PX
): number {
  if (!Number.isFinite(px) || px <= 0 || referenceWidthPx <= 0) {
    return DRAFT_IMAGE_WIDTH_MAX;
  }
  return clampImageWidth((px / referenceWidthPx) * 100);
}

export function readImageWidthPercent(img: HTMLImageElement): number {
  const containerStyle =
    img.getAttribute("containerstyle") ?? img.getAttribute("containerStyle") ?? "";
  const pxFromContainer = parseContainerStyleWidthPx(containerStyle);
  if (pxFromContainer != null) {
    return pxWidthToPercent(pxFromContainer);
  }

  const styleWidth = img.style.width.trim();
  if (styleWidth.endsWith("%")) {
    const parsed = Number.parseFloat(styleWidth);
    if (Number.isFinite(parsed)) return clampImageWidth(parsed);
  }

  const widthAttr = img.getAttribute("width");
  if (widthAttr?.endsWith("%")) {
    const parsed = Number.parseFloat(widthAttr);
    if (Number.isFinite(parsed)) return clampImageWidth(parsed);
  }

  if (widthAttr && /^\d+(\.\d+)?$/.test(widthAttr.trim())) {
    return pxWidthToPercent(Number.parseFloat(widthAttr));
  }

  if (styleWidth.endsWith("px")) {
    const px = Number.parseFloat(styleWidth);
    if (Number.isFinite(px) && px > 0) {
      const parent = img.parentElement;
      const base = parent?.clientWidth || img.offsetWidth;
      if (base && base > 0) {
        return clampImageWidth((px / base) * 100);
      }
      return pxWidthToPercent(px);
    }
  }

  return DRAFT_IMAGE_WIDTH_MAX;
}

export function applyImageWidthPercent(img: HTMLImageElement, percent: number): void {
  const width = clampImageWidth(percent);
  img.style.width = `${width}%`;
  img.style.height = "auto";
  img.style.maxWidth = "100%";
}

export function buildImageWidthStyleAttr(percent: number | null | undefined): string {
  if (percent == null || percent >= DRAFT_IMAGE_WIDTH_MAX) return "";
  return ` style="width:${clampImageWidth(percent)}%;height:auto;max-width:100%"`;
}

export function imageElementToMarkdown(el: HTMLImageElement): string {
  const alt = el.getAttribute("alt") ?? "";
  const src = el.getAttribute("src") ?? "";
  const width = readImageWidthPercent(el);
  if (width < DRAFT_IMAGE_WIDTH_MAX) {
    return `![${alt}](${src} "width:${width}%")`;
  }
  return `![${alt}](${src})`;
}

export function renderMarkdownImageHtml(alt: string, src: string, title?: string | null): string {
  const width = parseImageWidthTitle(title);
  const style = buildImageWidthStyleAttr(width);
  const escapedAlt = alt.replace(/"/g, "&quot;");
  const escapedSrc = src.replace(/"/g, "&quot;");
  return `<img alt="${escapedAlt}" src="${escapedSrc}"${style}>`;
}

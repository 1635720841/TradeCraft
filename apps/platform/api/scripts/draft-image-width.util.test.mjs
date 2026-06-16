/**
 * 稿件图片宽度解析（与 web draft-image-width.ts 逻辑对齐）。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const DRAFT_EDITOR_REFERENCE_WIDTH_PX = 760;
const DRAFT_IMAGE_WIDTH_MIN = 25;
const DRAFT_IMAGE_WIDTH_MAX = 100;

function clampImageWidth(percent) {
  return Math.min(DRAFT_IMAGE_WIDTH_MAX, Math.max(DRAFT_IMAGE_WIDTH_MIN, Math.round(percent)));
}

function parseContainerStyleWidthPx(containerStyle) {
  if (!containerStyle?.trim()) return null;
  const match = containerStyle.match(/width:\s*([0-9.]+)px/i);
  if (!match) return null;
  const px = Number.parseFloat(match[1]);
  return Number.isFinite(px) && px > 0 ? px : null;
}

function pxWidthToPercent(px, referenceWidthPx = DRAFT_EDITOR_REFERENCE_WIDTH_PX) {
  if (!Number.isFinite(px) || px <= 0 || referenceWidthPx <= 0) {
    return DRAFT_IMAGE_WIDTH_MAX;
  }
  return clampImageWidth((px / referenceWidthPx) * 100);
}

describe('draft image width helpers', () => {
  it('parses TipTap containerStyle px width', () => {
    assert.equal(parseContainerStyleWidthPx('width: 380px; height: auto; cursor: pointer;'), 380);
    assert.equal(parseContainerStyleWidthPx(''), null);
  });

  it('converts px to percent using editor reference width', () => {
    assert.equal(pxWidthToPercent(380), 50);
    assert.equal(pxWidthToPercent(760), 100);
    assert.equal(pxWidthToPercent(190), 25);
  });
});

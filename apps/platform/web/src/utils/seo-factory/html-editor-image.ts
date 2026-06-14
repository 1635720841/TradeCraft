/** 稿件正文编辑器：图片插入位置、选中与拖拽 */

import {
  applyImageWidthPercent,
  clampImageWidth,
  DRAFT_IMAGE_WIDTH_MAX,
  DRAFT_IMAGE_WIDTH_MIN,
  DRAFT_IMAGE_WIDTH_STEP,
  readImageWidthPercent
} from "./draft-image-width";

const IMAGE_BLOCK_CLASS = "draft-image-block";
const DROP_MARKER_CLASS = "draft-image-drop-marker";

function escapeHtmlAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 保存编辑器内光标，供文件选择器等打断焦点后恢复 */
export function saveEditorSelection(editor: HTMLElement | null): Range | null {
  if (!editor) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

export function restoreEditorSelection(editor: HTMLElement, range: Range | null) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;

  sel.removeAllRanges();
  if (range) {
    sel.addRange(range);
    return;
  }

  const fallback = document.createRange();
  fallback.selectNodeContents(editor);
  fallback.collapse(false);
  sel.addRange(fallback);
}

function createImageBlock(url: string, alt: string): HTMLParagraphElement {
  const block = document.createElement("p");
  block.className = IMAGE_BLOCK_CLASS;
  const img = document.createElement("img");
  img.alt = alt;
  img.src = url.trim();
  img.draggable = true;
  block.appendChild(img);
  return block;
}

/** 在光标处插入图片块；无有效选区时追加到文末 */
export function insertDraftImageIntoEditor(
  editor: HTMLElement,
  url: string,
  alt: string,
  savedRange?: Range | null
) {
  restoreEditorSelection(editor, savedRange ?? null);

  const block = createImageBlock(url, alt);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    editor.appendChild(block);
    return;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const container = range.commonAncestorContainer;
  const inEmptyParagraph =
    container.nodeType === Node.ELEMENT_NODE &&
    (container as HTMLElement).tagName === "P" &&
    !(container as HTMLElement).textContent?.trim() &&
    !(container as HTMLElement).querySelector("img");

  if (inEmptyParagraph && container.parentNode === editor) {
    (container as HTMLElement).replaceWith(block);
  } else {
    range.insertNode(block);
  }

  const after = document.createRange();
  after.setStartAfter(block);
  after.collapse(true);
  sel.removeAllRanges();
  sel.addRange(after);
}

/** 统一图片块结构，并开启 draggable */
export function stabilizeDraftImages(root: ParentNode) {
  root.querySelectorAll("img").forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;

    let block = img.closest(`.${IMAGE_BLOCK_CLASS}`) as HTMLElement | null;
    const parent = img.parentElement;

    if (!block) {
      if (
        parent?.tagName === "P" &&
        !parent.querySelector("table") &&
        Array.from(parent.childNodes).every(
          node =>
            node === img ||
            (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "").trim())
        )
      ) {
        block = parent;
        block.classList.add(IMAGE_BLOCK_CLASS);
      } else {
        block = document.createElement("p");
        block.className = IMAGE_BLOCK_CLASS;
        img.replaceWith(block);
        block.appendChild(img);
      }
    }

    img.draggable = true;
  });
}

function topLevelBlock(editor: HTMLElement, node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current && current.parentNode !== editor) {
    current = current.parentNode;
  }
  return current instanceof HTMLElement ? current : null;
}

function clearImageSelection(editor: HTMLElement) {
  editor.querySelectorAll(`.${IMAGE_BLOCK_CLASS}.is-selected`).forEach(el => {
    el.classList.remove("is-selected");
  });
}

function removeDropMarker(editor: HTMLElement) {
  editor.querySelector(`.${DROP_MARKER_CLASS}`)?.remove();
}

function showDropMarker(editor: HTMLElement, before: Node | null) {
  removeDropMarker(editor);
  const marker = document.createElement("div");
  marker.className = DROP_MARKER_CLASS;
  marker.setAttribute("contenteditable", "false");
  if (before) {
    editor.insertBefore(marker, before);
  } else {
    editor.appendChild(marker);
  }
}

function moveBlockBefore(editor: HTMLElement, block: HTMLElement, before: Node | null) {
  if (before === block || block.contains(before)) return;
  removeDropMarker(editor);
  if (before) {
    editor.insertBefore(block, before);
  } else {
    editor.appendChild(block);
  }
}

function resolveDropBefore(
  editor: HTMLElement,
  clientX: number,
  clientY: number,
  dragged: HTMLElement
): Node | null {
  const range = document.caretRangeFromPoint?.(clientX, clientY);
  if (!range) return null;

  const target = topLevelBlock(editor, range.startContainer);
  if (!target || target === dragged) return null;

  const rect = target.getBoundingClientRect();
  const insertBefore = clientY < rect.top + rect.height / 2;
  return insertBefore ? target : target.nextSibling;
}

export function setupDraftImageInteractions(
  editor: HTMLElement,
  options: {
    onChange: () => void;
    isDisabled?: () => boolean;
    onSelectionChange?: (block: HTMLElement | null) => void;
  }
): () => void {
  let draggedBlock: HTMLElement | null = null;

  const onClick = (event: MouseEvent) => {
    if (options.isDisabled?.()) return;
    const target = event.target as HTMLElement;
    const block = target.closest(`.${IMAGE_BLOCK_CLASS}`) as HTMLElement | null;
    clearImageSelection(editor);
    if (block && editor.contains(block)) {
      block.classList.add("is-selected");
      event.preventDefault();
      options.onSelectionChange?.(block);
    } else {
      options.onSelectionChange?.(null);
    }
  };

  const onDragStart = (event: DragEvent) => {
    if (options.isDisabled?.()) {
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    const block = target.closest(`.${IMAGE_BLOCK_CLASS}`) as HTMLElement | null;
    if (!block || !editor.contains(block)) return;

    draggedBlock = block;
    block.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", "draft-image");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    draggedBlock?.classList.remove("is-dragging");
    draggedBlock = null;
    removeDropMarker(editor);
  };

  const onDragOver = (event: DragEvent) => {
    if (!draggedBlock || options.isDisabled?.()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const before = resolveDropBefore(editor, event.clientX, event.clientY, draggedBlock);
    showDropMarker(editor, before);
  };

  const onDrop = (event: DragEvent) => {
    if (!draggedBlock || options.isDisabled?.()) return;
    event.preventDefault();
    const before = resolveDropBefore(editor, event.clientX, event.clientY, draggedBlock);
    moveBlockBefore(editor, draggedBlock, before);
    draggedBlock.classList.remove("is-dragging");
    draggedBlock = null;
    options.onChange();
  };

  editor.addEventListener("click", onClick);
  editor.addEventListener("dragstart", onDragStart);
  editor.addEventListener("dragend", onDragEnd);
  editor.addEventListener("dragover", onDragOver);
  editor.addEventListener("drop", onDrop);

  return () => {
    editor.removeEventListener("click", onClick);
    editor.removeEventListener("dragstart", onDragStart);
    editor.removeEventListener("dragend", onDragEnd);
    editor.removeEventListener("dragover", onDragOver);
    editor.removeEventListener("drop", onDrop);
    removeDropMarker(editor);
  };
}

export function buildDraftImageHtml(url: string, alt = ""): string {
  return `<p class="${IMAGE_BLOCK_CLASS}"><img alt="${escapeHtmlAttr(alt)}" src="${escapeHtmlAttr(url.trim())}"></p>`;
}

export function getSelectedDraftImageBlock(editor: HTMLElement): HTMLElement | null {
  return editor.querySelector(`.${IMAGE_BLOCK_CLASS}.is-selected`) as HTMLElement | null;
}

export function removeSelectedDraftImage(editor: HTMLElement): boolean {
  const block = getSelectedDraftImageBlock(editor);
  if (!block) return false;
  block.remove();
  return true;
}

export function updateSelectedDraftImageAlt(editor: HTMLElement, alt: string): boolean {
  const block = getSelectedDraftImageBlock(editor);
  const img = block?.querySelector("img");
  if (!img) return false;
  img.alt = alt;
  return true;
}

export function getSelectedDraftImageWidth(editor: HTMLElement): number | null {
  const block = getSelectedDraftImageBlock(editor);
  const img = block?.querySelector("img");
  if (!img) return null;
  return readImageWidthPercent(img);
}

export function resizeSelectedDraftImage(editor: HTMLElement, delta: number): number | null {
  const block = getSelectedDraftImageBlock(editor);
  const img = block?.querySelector("img");
  if (!img) return null;
  const next = clampImageWidth(readImageWidthPercent(img) + delta);
  applyImageWidthPercent(img, next);
  return next;
}

export function setSelectedDraftImageWidth(editor: HTMLElement, percent: number): number | null {
  const block = getSelectedDraftImageBlock(editor);
  const img = block?.querySelector("img");
  if (!img) return null;
  const next = clampImageWidth(percent);
  applyImageWidthPercent(img, next);
  return next;
}

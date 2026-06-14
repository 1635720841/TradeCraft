export type HtmlEditorAction =
  | "h1"
  | "h2"
  | "h3"
  | "bold"
  | "italic"
  | "ul"
  | "ol"
  | "quote"
  | "link"
  | "image"
  | "imageUrl"
  | "imagePick"
  | "imageAlt"
  | "imageDelete"
  | "imageSmaller"
  | "imageLarger";

export const HTML_EDITOR_TOOLBAR_ITEMS: Array<{
  action: HtmlEditorAction;
  label: string;
  title: string;
}> = [
  { action: "h1", label: "H1", title: "一级标题" },
  { action: "h2", label: "H2", title: "二级标题" },
  { action: "h3", label: "H3", title: "三级标题" },
  { action: "bold", label: "B", title: "加粗" },
  { action: "italic", label: "I", title: "斜体" },
  { action: "ul", label: "列表", title: "无序列表" },
  { action: "ol", label: "编号", title: "有序列表" },
  { action: "quote", label: "引用", title: "引用块" },
  { action: "link", label: "链接", title: "插入链接" },
  { action: "image", label: "图片", title: "上传本地图片；插入后可拖拽到合适位置" },
  { action: "imageUrl", label: "外链", title: "插入外链图片（https://）" },
  { action: "imagePick", label: "AI配图", title: "从工作流生成的配图中插入" }
];

export const HTML_EDITOR_IMAGE_SELECTED_ITEMS: Array<{
  action: HtmlEditorAction;
  label: string;
  title: string;
}> = [
  { action: "imageSmaller", label: "缩小", title: "缩小图片（每次 10%）" },
  { action: "imageLarger", label: "放大", title: "放大图片（每次 10%）" },
  { action: "imageAlt", label: "改Alt", title: "修改选中图片的 Alt 描述" },
  { action: "imageDelete", label: "删图", title: "删除选中的图片" }
];

export function applyHtmlEditorAction(action: HtmlEditorAction) {
  switch (action) {
    case "h1":
      document.execCommand("formatBlock", false, "h1");
      break;
    case "h2":
      document.execCommand("formatBlock", false, "h2");
      break;
    case "h3":
      document.execCommand("formatBlock", false, "h3");
      break;
    case "bold":
      document.execCommand("bold");
      break;
    case "italic":
      document.execCommand("italic");
      break;
    case "ul":
      document.execCommand("insertUnorderedList");
      break;
    case "ol":
      document.execCommand("insertOrderedList");
      break;
    case "quote":
      document.execCommand("formatBlock", false, "blockquote");
      break;
    case "link": {
      const url = window.prompt("链接 URL（https://）");
      if (url) document.execCommand("createLink", false, url);
      break;
    }
    case "image":
    case "imageUrl":
    case "imagePick":
    case "imageAlt":
    case "imageDelete":
    case "imageSmaller":
    case "imageLarger":
      break;
    default:
      break;
  }
}

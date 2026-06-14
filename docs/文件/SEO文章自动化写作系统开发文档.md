# SEO文章自动化写作系统开发文档

版本：V1.0  
日期：2026-06-07  
适用对象：产品、后端、前端、爬虫/自动化、AI工程、SEO运营

---

## 1. 项目概述

本项目旨在建设一套面向独立站、WordPress 与 SaaS 建站系统的 SEO 文章自动化生产系统。

系统从网站理解、关键词研究、Google SERP 与 AI Overview 结构分析、内容简报生成、AI 撰写、Semrush SEO Writing Assistant 检测优化、QuillBot 原创表达优化、站内链接植入、AI 配图、HTML 打包输出，形成端到端内容生产流水线。

系统设计原则是：**自动化提高效率，质量控制保证可发布**。

AI 可用于研究、结构抽取、写作与优化，但不得复制竞品内容，不得通过同义词替换批量生成低价值内容。最终内容需要具备原创信息增益、品牌相关性、可读性和可转化性。

---

## 2. 建设目标

1. 将单篇 SEO 文章从关键词输入到发布资产输出的流程标准化、自动化。
2. 支持 Google AI Overview / AI 回答结构分析，但只学习结构，不复制内容。
3. 通过 Semrush SEO Writing Assistant 循环优化，使 Overall Score 不低于 9.5。
4. 通过 QuillBot 或等价改写服务进行原创表达优化，降低重复表达并提升自然度。
5. 自动识别公司网站相关页面并植入自然内链。
6. 自动生成文章配图、文件名、alt text、title 与 caption。
7. 输出适配 WordPress 与 SaaS 建站系统的纯净 HTML 文件包。
8. 保存完整过程数据，方便人工复核、开发调试和内容团队追踪。

---

## 3. 范围边界

| 范围 | 包含内容 | 不包含内容 |
|---|---|---|
| 内容研究 | 关键词、SERP、AI Overview、PAA、竞品结构、内容缺口 | 绕过搜索引擎限制、破解付费数据 |
| 文章生产 | Brief、初稿、SEO 优化、原创表达优化、HTML 输出 | 洗稿、抄袭、无来源拼接 |
| 第三方工具 | Semrush、QuillBot、Google 搜索结果、AI 配图服务 | 规避第三方工具登录、额度、风控 |
| 发布适配 | WordPress/SaaS 可复制 HTML 与资源文件夹 | 直接覆盖线上模板、修改主题全局样式 |

---

## 4. 总体业务流程

```text
输入网站URL + 目标市场 + 文章语言
    ↓
网站理解与页面库建立
    ↓
关键词发现与Semrush数据检测
    ↓
Google SERP + AI Overview结构分析
    ↓
竞品内容结构拆解与内容缺口识别
    ↓
生成文章Brief
    ↓
AI撰写初稿
    ↓
Semrush Writing Assistant检测与循环优化 ≥ 9.5
    ↓
QuillBot原创表达优化
    ↓
AI复检关键词、语义、品牌语气
    ↓
自动匹配并植入站内链接
    ↓
AI生成配图、alt text、caption
    ↓
生成WP/SaaS适配HTML + Markdown + 元数据 + 文件夹归档
```

---

## 5. 功能模块拆分

| 模块 | 核心职责 | 主要输出 |
|---|---|---|
| M1 网站理解模块 | 抓取并分析目标网站页面，建立品牌、产品、服务、页面库 | `site_profile.json`、`page_index.json` |
| M2 关键词研究模块 | 生成关键词、调用 Semrush 检测指标、分类搜索意图 | `keyword_pool.csv`、`keyword_clusters.json` |
| M3 SERP 分析模块 | 搜索目标关键词，提取 AI Overview、PAA、竞品页面结构 | `serp_snapshot.json`、`answer_structure.json` |
| M4 内容 Brief 模块 | 整合关键词、搜索意图、AI 回答结构、竞品缺口 | `brief.md`、`brief.json` |
| M5 AI 写作模块 | 按 Brief 生成文章初稿，保证原创和品牌相关 | `draft.md` |
| M6 Semrush 优化模块 | 导入写作助手检测并循环优化到 9.5 分以上 | `semrush_report.json`、`optimized.md` |
| M7 QuillBot 优化模块 | 进行原创表达优化与自然语言润色 | `paraphrased.md` |
| M8 内链模块 | 识别实体与公司页面匹配，植入内链 | `internal_links.csv`、`linked.md` |
| M9 配图模块 | 生成图片、alt、caption、文件名 | `images/`、`image_alt_tags.csv` |
| M10 HTML 导出模块 | 生成 WP/SaaS 安全 HTML 与资源包 | `article.html`、`schema.json`、`meta.txt` |

---

## 6. 详细流程规范

### 6.1 网站理解

输入目标网站 URL 后，系统需要完成以下分析：

1. 抓取首页、产品页、服务页、解决方案页、博客页、About、Contact、案例页。
2. 抽取页面标题、URL、Meta、H1-H3、正文摘要、产品/服务实体、目标受众、CTA、页面类型。
3. 分析网站业务类型、目标客户、核心卖点、转化目标、品牌语气。
4. 建立可用于内链的页面索引，记录每个页面适配的主题、关键词和商业价值。

输出建议：

```json
{
  "site_url": "https://example.com",
  "brand_name": "Example",
  "industry": "B2B SaaS",
  "target_markets": ["US"],
  "languages": ["en"],
  "brand_voice": "professional, clear, helpful",
  "core_products": [],
  "core_services": [],
  "audiences": [],
  "conversion_goals": ["demo request", "contact form"]
}
```

### 6.2 关键词发现与筛选

系统需要通过 AI 和 Semrush 组合生成关键词池：

1. AI 根据网站定位生成种子关键词。
2. 调用 Semrush 获取搜索量、Keyword Difficulty、CPC、趋势、SERP 特征、搜索意图。
3. 补充 Google Suggest、People Also Ask、Related Searches。
4. 按信息型、商业调研型、交易型、品牌型、竞品型进行分类。
5. 按搜索量、难度、商业价值、内容可覆盖性计算优先级。

关键词优先级建议公式：

```text
priority_score =
  search_volume_score * 0.25 +
  business_value_score * 0.35 +
  keyword_difficulty_score * 0.20 +
  content_fit_score * 0.20
```

### 6.3 Google SERP 与 AI Overview 分析

系统应对目标关键词执行 Google 搜索，记录：

1. AI Overview / AI 回答框内容。
2. AI Overview 引用来源。
3. 前 10 名自然排名页面。
4. People Also Ask 问题。
5. Featured Snippet。
6. Related Searches。

对 AI Overview 只允许抽取回答组织方式，例如：

1. 是否先给结论。
2. 是否分步骤。
3. 是否使用列表。
4. 是否做优缺点比较。
5. 是否加入注意事项。
6. 是否包含 FAQ。
7. 是否引用权威来源。

不允许复制 AI Overview 或竞品页面原文。

| 分析对象 | 提取字段 | 用途 |
|---|---|---|
| AI Overview | 回答结构、段落顺序、问题覆盖、引用来源 | 作为文章结构参考 |
| Top 10 竞品 | 标题、H 标签、内容类型、表格/图片/FAQ | 确定竞争标准 |
| People Also Ask | 问题文本、回答方向 | 生成 FAQ 与长尾段落 |
| Related Searches | 相关搜索词 | 扩展语义关键词 |
| Featured Snippet | 摘要格式、列表/表格样式 | 优化首段和摘要区 |

### 6.4 竞品内容结构拆解

系统需要分析排名页面的 H1/H2/H3 结构，并识别：

1. 竞品共同覆盖的主题。
2. 竞品未讲透的内容缺口。
3. 用户真正想解决的问题。
4. 可用于超越竞品的原创模块。

可增加的原创价值模块包括：

1. 案例。
2. 对比表。
3. 步骤清单。
4. 使用场景。
5. 常见错误。
6. 购买建议。
7. 产品选择标准。
8. 行业数据解读。

### 6.5 文章 Brief 生成

必须先生成 Brief，再进入正文写作。

Brief 至少包含：

1. 主关键词。
2. 辅助关键词。
3. 搜索意图。
4. 目标读者。
5. 推荐标题。
6. URL slug。
7. Meta title。
8. Meta description。
9. H1/H2/H3 大纲。
10. Google AI Overview 结构参考。
11. 竞品内容缺口。
12. 必须回答的问题。
13. 内链候选页面。
14. 外链参考来源。
15. FAQ。
16. 配图需求。
17. Schema 建议。

Brief 需要同时保存为 Markdown 和 JSON：

```text
brief.md
brief.json
```

### 6.6 AI 初稿撰写

写作要求：

1. 开头 100 字内直接回答用户搜索意图。
2. 正文按 H2/H3 结构输出，每个小节解决一个明确问题。
3. 自然覆盖主关键词、辅助关键词和语义相关词。
4. 禁止关键词堆砌。
5. 加入原创价值模块：案例、对比表、清单、使用场景、注意事项、购买建议。
6. 按品牌语气输出。
7. 如为医疗、金融、法律等 YMYL 内容，必须标记为需人工专家审核。

### 6.7 Semrush SEO Writing Assistant 优化

系统将初稿导入 Semrush SEO Writing Assistant，配置：

1. 目标关键词。
2. 目标国家/地区。
3. 设备类型。
4. 文章语言。

检测维度：

1. Readability。
2. SEO。
3. Originality。
4. Tone of Voice。
5. Overall Score。

若 Overall Score 小于 9.5，系统根据建议自动修改文章并重新检测，直到达到阈值或达到最大循环次数。

| 指标 | 优化动作 | 注意事项 |
|---|---|---|
| SEO | 补充推荐关键词、优化标题、调整结构 | 避免机械堆砌 |
| Readability | 缩短长句、增加列表、调整段落长度 | 不能牺牲专业准确性 |
| Originality | 重写重复表达、增加原创案例与观点 | 保留必要引用和来源 |
| Tone of Voice | 统一品牌语气、减少突兀表达 | 根据网站行业设置语气 |
| Overall Score | 循环优化到 ≥ 9.5 | 超过最大循环仍不达标则进入人工审核队列 |

伪代码：

```python
max_rounds = 5
score_target = 9.5

for round in range(1, max_rounds + 1):
    report = semrush_analyze(article, target_keywords, market)

    if report.overall_score >= score_target:
        break

    article = ai_optimize_article(
        article=article,
        semrush_report=report,
        constraints=[
            "do not keyword stuff",
            "preserve facts",
            "preserve brand voice",
            "improve originality with real added value"
        ]
    )

if report.overall_score < score_target:
    send_to_manual_review(article, report)
```

### 6.8 QuillBot 原创表达优化

QuillBot 阶段定位为原创表达优化，不作为洗稿或规避版权的工具。

系统要求：

1. 仅处理自有生成内容或已授权内容。
2. 保留品牌语气。
3. 保留专业术语。
4. 保留主关键词和重要长尾关键词。
5. 保留引用来源。
6. 避免将准确表达改成错误表达。

QuillBot 输出后，AI 必须复检：

1. 语义是否变化。
2. 专业词是否被误改。
3. 关键词是否丢失。
4. 内链锚文本是否自然。
5. 事实是否出现偏差。

### 6.9 内链自动植入

系统需要读取公司网站页面库，自动识别文章中的实体、产品词、服务词、场景词，并匹配最相关的站内页面。

内链规则：

1. 每 800-1200 字植入 1 个核心内链。
2. 首屏附近优先植入 1 个高价值内链。
3. 优先链接产品页、服务页、解决方案页、核心博客页。
4. 同一 URL 不重复过多。
5. 锚文本必须自然，不强塞关键词。
6. 避免一个段落内出现过多链接。

内链匹配算法建议：

```text
score =
  semantic_similarity(article_section, page.summary) * 0.45 +
  keyword_overlap(article_section, page.keywords) * 0.25 +
  page_business_value * 0.20 +
  freshness_score(page.last_updated) * 0.10

insert link when:
  score >= 0.72
  anchor_text reads naturally
  same_url_count < configured_limit
  paragraph has no existing link conflict
```

内链输出字段：

| 字段 | 说明 |
|---|---|
| `anchor_text` | 内链锚文本 |
| `target_url` | 目标页面 URL |
| `page_type` | 产品页/服务页/博客页/解决方案页 |
| `insert_after_heading` | 插入位置 |
| `match_reason` | 匹配原因 |
| `confidence` | 置信度 0-1 |

### 6.10 AI 配图与 Alt 标签

每篇文章默认生成：

1. 1 张封面图。
2. 2-4 张正文配图。
3. 必要时生成流程图、对比图、步骤图。

每张图自动生成：

1. 图片 prompt。
2. 文件名。
3. alt text。
4. title。
5. caption。
6. 建议插入位置。

图片规范：

1. 建议输出 WebP。
2. 封面图建议尺寸：`1200x630`。
3. 正文图建议尺寸：`900x600`。
4. 文件名使用英文小写短横线，例如 `best-crm-workflow-cover.webp`。
5. Alt text 描述图片真实内容，可自然包含关键词，但不得关键词堆砌。

### 6.11 HTML 与文件夹输出

HTML 必须适配 WordPress 与 SaaS 建站系统：

1. 不写全局 CSS。
2. 不使用会影响原网站布局的脚本。
3. 不覆盖主题样式。
4. 使用语义化 HTML 标签。
5. 图片路径使用相对路径。
6. 内链使用完整 URL。
7. 可选输出 Article / FAQ / HowTo / Product Schema JSON-LD。

标准标签：

```text
h1 / h2 / h3
p
ul / ol
table
figure / figcaption
img
a
section
article
script[type="application/ld+json"]
```

文件夹结构：

```text
/outputs/{keyword-slug}/
  article.html
  article.md
  meta.txt
  brief.md
  brief.json
  semrush-report.json
  internal-links.csv
  schema.json
  images/
    cover.webp
    image-01.webp
    image-02.webp
  image-alt-tags.csv
  logs/
    workflow.log
    serp-snapshot.json
```

HTML 示例：

```html
<article class="seo-article">
  <h1>Article Title</h1>
  <p>Intro paragraph...</p>

  <figure>
    <img src="./images/cover.webp" alt="Descriptive alt text">
    <figcaption>Image caption.</figcaption>
  </figure>

  <h2>Section Title</h2>
  <p>
    Content with
    <a href="https://example.com/service-page">natural anchor text</a>.
  </p>

  <section class="faq">
    <h2>Frequently Asked Questions</h2>
    <h3>Question?</h3>
    <p>Answer.</p>
  </section>
</article>
```

---

## 7. 数据结构建议

### 7.1 article_job.json

```json
{
  "job_id": "20260607-keyword-slug",
  "site_url": "https://example.com",
  "target_keyword": "primary keyword",
  "secondary_keywords": [],
  "market": "US",
  "language": "en",
  "cms_target": "wordpress",
  "status": "drafting",
  "quality_thresholds": {
    "semrush_overall_score": 9.5,
    "max_optimization_rounds": 5
  }
}
```

### 7.2 keyword_pool.csv

| 字段 | 说明 |
|---|---|
| `keyword` | 关键词 |
| `search_volume` | 搜索量 |
| `keyword_difficulty` | 关键词难度 |
| `cpc` | 点击价格 |
| `intent` | 搜索意图 |
| `cluster` | 主题聚类 |
| `priority_score` | 优先级分数 |
| `recommended_article_type` | 推荐文章类型 |

### 7.3 serp_snapshot.json

```json
{
  "keyword": "primary keyword",
  "market": "US",
  "language": "en",
  "ai_overview": {
    "exists": true,
    "structure_summary": [],
    "source_urls": []
  },
  "paa_questions": [],
  "related_searches": [],
  "top_results": [
    {
      "rank": 1,
      "url": "https://competitor.com/article",
      "title": "Competitor Title",
      "h_structure": [],
      "content_type": "guide"
    }
  ]
}
```

### 7.4 image-alt-tags.csv

| 字段 | 说明 |
|---|---|
| `image_file` | 图片文件名 |
| `insert_position` | 建议插入位置 |
| `prompt` | 图片生成提示词 |
| `alt_text` | 图片 alt |
| `title` | 图片 title |
| `caption` | 图片说明 |

---

## 8. 接口与集成建议

| 集成对象 | 推荐方式 | 关键要求 |
|---|---|---|
| Google SERP | 官方 API 或合规 SERP 服务 | 遵守服务条款、保存快照、处理地域和语言 |
| Semrush | Semrush API 或受控浏览器自动化 | 需要账号权限、额度控制、异常重试 |
| QuillBot | 官方能力或受控浏览器自动化 | 保留关键词、术语、引用，不做洗稿 |
| AI 写作模型 | LLM API | Prompt 版本化、输出 JSON 校验、日志追踪 |
| AI 图片生成 | 图像生成 API | 保存 prompt、seed、图片元数据和 alt |
| CMS | 先输出 HTML 包，后续可接 WP REST API | 默认不直接发布，需人工确认 |

---

## 9. 后台管理端需求

| 页面 | 核心功能 |
|---|---|
| 项目管理 | 新建站点、设置目标市场、语言、CMS 类型、品牌语气 |
| 关键词池 | 导入/生成关键词、查看 Semrush 指标、筛选优先级 |
| 文章任务 | 创建任务、查看状态、重跑某个阶段、下载文件包 |
| SERP 快照 | 查看 AI Overview 结构、竞品页面、PAA、内容缺口 |
| 编辑审核 | 查看 Brief、初稿、Semrush 报告、QuillBot 结果、最终稿 |
| 内链管理 | 维护页面库、查看自动内链建议、手动确认/禁用 |
| 图片管理 | 查看图片 prompt、预览图、alt、caption |
| 系统设置 | API Key、额度、并发数、代理/地区、日志保留策略 |

---

## 10. 状态机设计

```text
pending
  → crawling_site
  → keyword_research
  → serp_analysis
  → brief_generated
  → drafting
  → semrush_optimizing
  → paraphrasing
  → internal_linking
  → image_generating
  → html_exporting
  → ready_for_review
  → approved
  → archived

error states:
  serp_failed
  semrush_failed
  quillbot_failed
  image_failed
  score_below_threshold
  manual_review_required
```

---

## 11. 非功能需求

| 类别 | 要求 |
|---|---|
| 稳定性 | 每个阶段可重试、可恢复，任务状态持久化 |
| 可追踪 | 保存输入、输出、Prompt 版本、第三方工具报告与日志 |
| 并发 | 支持按站点/关键词队列并发，避免触发第三方风控 |
| 安全 | API Key 加密存储，敏感配置不写入日志 |
| 可维护 | 模块化架构，第三方工具通过 Adapter 接入 |
| 可审核 | 每篇文章保留 Brief、SERP 快照、Semrush 报告、内链表、图片元数据 |
| 可扩展 | 后续支持多语言、多 CMS、自动发布、批量排期 |

---

## 12. 内容质量与合规要求

1. AI Overview 和竞品内容只能用于结构分析、问题覆盖分析和差异化分析，不得复制原文。
2. QuillBot 只用于自有内容表达优化，不用于改写竞品文章规避重复。
3. 文章必须有信息增益：案例、经验、数据、对比、步骤、注意事项或产品场景。
4. 涉及医疗、金融、法律、安全等高风险内容，必须配置人工审核流程。
5. 所有外部数据、统计、观点引用应保留来源链接。
6. 图片 alt 应准确描述图片内容，避免堆砌关键词。
7. 不能只追求 Semrush 分数，最终目标是对用户有帮助、可信、可读、可转化。

---

## 13. 验收标准

1. 输入一个网站 URL 和目标关键词后，系统可生成完整文章文件夹。
2. 文章包含 `article.html`、`article.md`、`meta.txt`、`brief`、Semrush 报告、内链表、图片资源和 alt 标签表。
3. Semrush Overall Score 达到 9.5，或进入人工审核队列并说明原因。
4. HTML 可直接复制到 WordPress 或 SaaS 建站 HTML 模块，且不影响原站布局。
5. 内链锚文本自然，目标页面与上下文相关，并生成可复核的内链表。
6. 图片文件名、alt text、title、caption 与文章上下文相关。
7. 系统保留完整日志，任一阶段失败可重跑。
8. 最终文章不存在明显抄袭、事实错误、关键词堆砌、无意义改写等问题。

---

## 14. 开发里程碑

| 阶段 | 周期建议 | 交付内容 |
|---|---|---|
| P0 原型验证 | 1-2 周 | 单关键词跑通：Brief → 初稿 → HTML 输出 |
| P1 核心 MVP | 3-5 周 | 网站抓取、关键词、SERP、AI 写作、文件夹归档 |
| P2 工具集成 | 2-4 周 | Semrush 循环优化、QuillBot 优化、报告保存 |
| P3 内容资产化 | 2-3 周 | 内链自动植入、AI 配图、alt 标签、Schema 输出 |
| P4 管理后台 | 3-5 周 | 任务队列、审核界面、配置中心、日志与下载 |
| P5 发布扩展 | 2-4 周 | WP REST API、批量排期、多语言、多站点支持 |

---

## 15. 风险与处理

| 风险 | 影响 | 处理建议 |
|---|---|---|
| Google SERP 结构变化 | AI Overview/PAA 抓取不稳定 | 使用合规 SERP 服务，保存快照并做字段容错 |
| Semrush 或 QuillBot 限制 | 自动化中断 | 配置账号额度、排队、失败重试、人工接管 |
| AI 生成内容质量波动 | 文章不可发布 | 强制 Brief、质量评分、人工审核、Prompt 版本管理 |
| 内链误匹配 | 影响用户体验和 SEO | 设置置信度阈值和人工确认开关 |
| 图片不准确 | 影响专业度 | 生成前定义图片需求，生成后做语义校验 |
| HTML 污染布局 | 影响站点页面 | 禁止全局 CSS/JS，仅输出语义化内容片段 |
| 批量内容无增值 | 存在 SEO 风险 | 加入原创案例、人工审核和内容差异化检查 |

---

## 16. 推荐技术架构

| 层级 | 建议选型 |
|---|---|
| 后端 | Python FastAPI / Node.js NestJS |
| 任务队列 | Celery + Redis / BullMQ |
| 数据库 | PostgreSQL |
| 对象存储 | S3 兼容存储或本地文件系统 |
| 爬虫/自动化 | Playwright |
| AI 服务 | LLM API + Image Generation API |
| 前端后台 | React / Next.js |
| 日志监控 | 结构化日志 + 任务事件表 |

---

## 17. 推荐数据库表

### 17.1 sites

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 站点 ID |
| `site_url` | text | 网站 URL |
| `brand_name` | text | 品牌名 |
| `industry` | text | 行业 |
| `target_market` | text | 目标市场 |
| `language` | text | 内容语言 |
| `brand_voice` | text | 品牌语气 |
| `created_at` | timestamp | 创建时间 |

### 17.2 site_pages

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 页面 ID |
| `site_id` | UUID | 站点 ID |
| `url` | text | 页面 URL |
| `title` | text | 页面标题 |
| `page_type` | text | 页面类型 |
| `summary` | text | 页面摘要 |
| `keywords` | jsonb | 页面关键词 |
| `business_value` | numeric | 商业价值分 |

### 17.3 article_jobs

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 任务 ID |
| `site_id` | UUID | 站点 ID |
| `target_keyword` | text | 主关键词 |
| `status` | text | 当前状态 |
| `semrush_score` | numeric | Semrush 分数 |
| `output_path` | text | 输出路径 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

---

## 18. Prompt 管理建议

系统中所有关键 Prompt 应版本化管理：

1. 网站理解 Prompt。
2. 关键词扩展 Prompt。
3. SERP 结构分析 Prompt。
4. Brief 生成 Prompt。
5. 初稿写作 Prompt。
6. Semrush 优化 Prompt。
7. QuillBot 后复检 Prompt。
8. 内链匹配 Prompt。
9. 图片生成 Prompt。
10. HTML 输出 Prompt。

每个 Prompt 需要记录：

```json
{
  "prompt_id": "brief-generator-v1",
  "version": "1.0.0",
  "input_schema": {},
  "output_schema": {},
  "created_at": "2026-06-07",
  "notes": "Generate SEO article brief based on SERP and site profile."
}
```

---

## 19. 人工审核节点

以下情况必须进入人工审核：

1. Semrush Overall Score 多轮优化后仍低于 9.5。
2. 内容涉及医疗、金融、法律、安全等 YMYL 领域。
3. AI 判断事实来源不足。
4. 内链匹配置信度低。
5. QuillBot 后语义发生明显偏移。
6. AI 图片可能与文章主题不匹配。
7. 文章存在过度营销、虚假承诺或不合规表达。

---

## 20. 最终输出清单

每篇文章完成后，系统应输出：

1. `article.html`：适配 WP/SaaS 的 HTML。
2. `article.md`：Markdown 版本。
3. `meta.txt`：标题、描述、slug、关键词。
4. `brief.md`：文章简报。
5. `brief.json`：结构化简报。
6. `semrush-report.json`：Semrush 检测结果。
7. `internal-links.csv`：内链植入表。
8. `image-alt-tags.csv`：图片 alt 标签表。
9. `schema.json`：结构化数据。
10. `images/`：配图文件夹。
11. `logs/workflow.log`：流程日志。
12. `logs/serp-snapshot.json`：SERP 快照。

---

## 21. 参考规范

1. Google Search Central：生成式 AI 内容指南，重点是内容质量和用户价值。
2. Google Search Central：Spam Policies，避免批量生成无增值内容。
3. Google Search Central：图片 SEO 最佳实践，alt text 应准确描述图片内容。
4. Semrush SEO Writing Assistant：用于 SEO、可读性、原创性和语气检测。
5. QuillBot Paraphraser：用于表达改写和语言优化，不作为规避引用或版权的工具。


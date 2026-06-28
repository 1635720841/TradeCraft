<!--
  登录页左侧品牌介绍区：功能卡片、增长链路与服务说明。
-->
<template>
  <section class="mw-hero" aria-label="品牌介绍">
    <div class="mw-brand" aria-label="MERWISE">
      <img :src="logo" alt="MERWISE" class="mw-brand-logo" />
    </div>

    <div class="mw-hero-copy">
      <h1>让外贸增长，<em>更有数</em></h1>
      <p>
        专为外贸企业打造的智能增长平台，用数据驱动客户发现、触达与转化，连接
        SEO 自动化、客户开发、数据洞察与流程协同。
      </p>
    </div>

    <div class="mw-hero-visual">
      <div class="mw-hero-visual-grid">
        <article class="mw-float-card mw-card-seo">
          <div class="mw-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.2-4.2" />
            </svg>
          </div>
          <div>
            <strong>SEO 自动化</strong>
            <p>关键词智能挖掘<br />内容自动化生产</p>
          </div>
        </article>

        <article class="mw-float-card mw-card-data">
          <div class="mw-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 2.3a7.73 7.73 0 0 1 6.7 6.7H13ZM11 4.3V13h8.7A7.72 7.72 0 1 1 11 4.3Z"
              />
            </svg>
          </div>
          <div>
            <strong>数据洞察</strong>
            <p>多维数据分析<br />洞察市场机会</p>
          </div>
        </article>

        <article class="mw-float-card mw-card-leads">
          <div class="mw-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"
              />
            </svg>
          </div>
          <div>
            <strong>客户获取</strong>
            <p>全球买家线索<br />多渠道触达转化</p>
          </div>
        </article>

        <article class="mw-float-card mw-orange mw-card-flow">
          <div class="mw-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="2.6" />
              <path
                d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1 .2l-.2.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 0 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1L4.8 9A1.8 1.8 0 1 1 7.3 6.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V6a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1-.2l.2-.1A1.8 1.8 0 1 1 19 9.3l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 0 1 0 3.6H20a1 1 0 0 0-.6.3Z"
              />
            </svg>
          </div>
          <div>
            <strong>流程优化</strong>
            <p>自动化工作流<br />提升团队效率</p>
          </div>
        </article>
      </div>

      <div class="mw-highlights-panel" aria-label="增长链路">
        <div class="mw-highlight">
          <strong>发现</strong>
          <span>关键词与买家洞察</span>
        </div>
        <div class="mw-highlight">
          <strong>生产</strong>
          <span>SEO 内容自动化</span>
        </div>
        <div class="mw-highlight">
          <strong>触达</strong>
          <span>多渠道线索跟进</span>
        </div>
        <div class="mw-highlight">
          <strong>增长</strong>
          <span>数据驱动持续优化</span>
        </div>
      </div>

      <div class="mw-service-row" aria-label="平台优势">
        <div class="mw-service-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M12 3 20 6v5c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10V6l8-3Z" />
            <path d="m8.5 12 2.2 2.2 4.8-4.8" />
          </svg>
          <span>数据安全加密</span>
        </div>
        <div class="mw-service-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 9h10M7 15h5" />
          </svg>
          <span>企业级稳定服务</span>
        </div>
        <div class="mw-service-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M6 19a4 4 0 1 1 1-7.9A5 5 0 0 1 19 12a3.5 3.5 0 0 1-.5 7H6Z" />
          </svg>
          <span>全球节点加速</span>
        </div>
        <div class="mw-service-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
            <circle cx="9.5" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.86" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>专业客户支持</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { logo } from "../utils/static";
</script>

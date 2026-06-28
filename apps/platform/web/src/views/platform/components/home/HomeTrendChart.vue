<!--
  首页内容发布趋势图（Merwise 参考稿静态 SVG）。
-->
<template>
  <div class="mw-chart" aria-label="内容发布趋势图">
    <div class="mw-chart-title">
      内容发布趋势
      <span class="mw-legend">
        <i class="mw-legend__dot" />
        本月
        <i class="mw-legend__dot mw-legend__dot--gray" />
        上月
      </span>
    </div>
    <svg viewBox="0 0 540 145" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mwChartFill" x1="0" x2="0" y1="0" y2="1">
          <stop stop-color="#1b70f5" />
          <stop offset="1" stop-color="#1b70f5" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line class="mw-gridline" x1="0" x2="540" y1="20" y2="20" />
      <line class="mw-gridline" x1="0" x2="540" y1="62" y2="62" />
      <line class="mw-gridline" x1="0" x2="540" y1="104" y2="104" />
      <path
        class="mw-area"
        d="M12 105 L48 95 L83 102 L118 87 L154 80 L190 78 L226 90 L262 67 L298 52 L334 43 L370 48 L406 37 L442 55 L478 30 L516 25 L516 145 L12 145 Z"
      />
      <path
        class="mw-line-sub"
        d="M12 130 L48 136 L83 135 L118 119 L154 132 L190 140 L226 115 L262 96 L298 79 L334 68 L370 76 L406 88 L442 80 L478 91 L516 103"
      />
      <path
        class="mw-line-main"
        d="M12 105 L48 95 L83 102 L118 87 L154 80 L190 78 L226 90 L262 67 L298 52 L334 43 L370 48 L406 37 L442 55 L478 30 L516 25"
      />
      <circle cx="12" cy="105" r="3" />
      <circle cx="48" cy="95" r="3" />
      <circle cx="83" cy="102" r="3" />
      <circle cx="118" cy="87" r="3" />
      <circle cx="154" cy="80" r="3" />
      <circle cx="190" cy="78" r="3" />
      <circle cx="226" cy="90" r="3" />
      <circle cx="262" cy="67" r="3" />
      <circle cx="298" cy="52" r="3" />
      <circle cx="334" cy="43" r="3" />
      <circle cx="370" cy="48" r="3" />
      <circle cx="406" cy="37" r="3" />
      <circle cx="442" cy="55" r="3" />
      <circle cx="478" cy="30" r="3" />
      <circle cx="516" cy="25" r="3" />
    </svg>
  </div>
</template>

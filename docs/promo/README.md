# Anime OOTD · 官方宣传物料

本目录存放系统的官方宣传网站与海报，均为**零依赖、自包含**的单文件 HTML，双击即可在浏览器中打开，也可以部署到任意静态托管（GitHub Pages / Vercel / OSS）。

## 文件清单

| 文件 | 说明 |
| --- | --- |
| `index.html` | 官方宣传网站（落地页）：Hero、AI 流水线、核心能力、AI 试衣间、运营成本、技术栈、CTA |
| `poster.html` | 宣传海报源文件，画布精确为 **1080 × 1440**（3:4 竖版） |
| `poster.png` | 已导出的海报成品（1080 × 1440） |
| `website-preview.png` | 宣传网站长截图预览（1440 宽） |

## 宣传网站（index.html）

- 纯 HTML + CSS + 少量原生 JS（滚动渐入动画），无外部依赖，可离线打开。
- 深色渐变风格，响应式布局，移动端自适应。
- 修改文案后直接保存即可；如需上线，把整个文件丢到任意静态服务器。

## 海报（poster.html / poster.png）

- 海报设计尺寸固定为 1080 × 1440 px。
- 当浏览器窗口 ≤ 海报尺寸时自动进入「精确导出模式」：去掉外边距与圆角，海报铺满视口。

### 重新导出 PNG（Windows / Chrome）

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1080,1440 \
  --screenshot="D:\working\opc\alibb\docs\promo\poster.png" \
  "file:///D:/working/opc/alibb/docs/promo/poster.html"
```

其他环境用任意无头浏览器 / Playwright / Puppeteer 以 `1080×1440` 视口截图即可。

## 内容口径

物料内容均来自系统真实能力：

- AI 内容流水线（`src/lib/pipeline/`）：选题 → 绘图提示词 → AI 出图 → 五语言标题 / 标签 / 描述 / 正文
- 五语言全球发行（`src/lib/config.ts`）：en / zh / jp / kr / es，hreflang + canonical + 301 归一
- AI 试衣间（`src/app/[lang]/tryon`、`src/lib/tryon/`）：每日配额 + 成本熔断
- 许愿池（`src/app/[lang]/wish`）
- 管理后台（`src/app/admin_config`）：内容队列、LLM 日志与分模型成本核算、Snippets 广告位（AdSense）

如产品功能迭代，请同步更新 `index.html` / `poster.html` 中的对应文案。

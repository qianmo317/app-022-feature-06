# app-022 · 田字格字帖与笔顺生成器

纯前端 Web 应用：输入汉字/词语/儿歌，自动生成可打印的田字格（田/米/回/方宫格、横线、四线格等）字帖，并为每个字提供逐笔笔顺动画与分解演示。全部功能在浏览器本地完成，笔顺数据离线内置，无需任何后端服务（部署容器仅提供静态托管）。

需求与验收标准见仓库根目录 `./calligraphy-worksheet-maker.md`。

## 功能特性

- **多种格子模板**：田字格、米字格、回宫格、方格、横线格、拼音四线格
- **笔顺动画与分解**：逐笔演示（rAF 动画 + 圆点标注 + 键盘 ←/→ 控制笔与前后字），可查看笔画分解列表
- **描红与临写**：浅灰描红字、空格临写，可按行混合排布
- **分页不拆字**：贪心分页算法保证同一个字的所有小格始终位于同一页同一行，绝不跨页拆字
- **多音字支持**：内置多音字词典，拼音按语境标注
- **1:1 校验尺**：每页附 100mm 校验尺（96dpi 下 ≈ 377.95px），打印后可核对实际物理尺寸
- **导出**：单页导出 SVG / PNG（4x 高清），打印走浏览器 `Ctrl/Cmd+P`（A4、页边距 0）
- **模板库**：预置五套模板（一年级生字、古诗、姓名练字、ABC、拼音）
- **离线笔顺数据**：`public/data/strokes.json` 内置 1096 个常用字（hanzi-writer-v1 格式，2.59MB），加载后完全离线可用
- **本地保存**：编辑内容与配置存于 localStorage，刷新不丢失

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 框架 | React 18 + TypeScript 5 |
| 构建 | Vite 5 |
| 路由 | react-router-dom 6 |
| 拼音 | pinyin-pro |
| 字体 | @fontsource/noto-sans-sc |
| 测试 | Vitest（单元）+ Playwright（E2E） |
| 部署 | Docker 多阶段构建 + nginx:1.27-alpine-slim（无第三方运行时依赖） |

## 目录结构

```
app-022/
├── public/data/strokes.json      # 离线笔顺数据（1096 字，必须保留，勿加入 ignore）
├── scripts/gen-data.mjs          # 数据再生成脚本（npm run gen:data）
├── src/
│   ├── lib/
│   │   ├── paint.tsx             # 各种格子渲染 + 笔画分解绘制（SVG 单位制：1 unit = cellMm/100mm）
│   │   ├── layout.ts             # 贪心分页（ROW_FACTOR=1.2，信息带 20 + 格 100 = 120 units/行）
│   │   ├── templates.ts          # 5 套预置模板
│   │   ├── exportImage.tsx       # renderToStaticMarkup 拼 SVG → 导出 SVG/PNG
│   │   ├── pinyin.ts             # 拼音标注（含多音字）
│   │   ├── charinfo.ts           # 精选字信息（部首/结构）
│   │   ├── data.ts / input.ts / storage.ts / types.ts
│   ├── components/
│   │   ├── StrokePlayer.tsx      # 笔顺逐笔动画播放器
│   │   ├── paint.tsx             # 渲染组件层
│   │   └── PageView.tsx          # 单页视图
│   ├── pages/                    # Home / Editor / PrintView / Library / Play
│   ├── hooks.ts                  # useWorksheetDoc / isFormTarget
│   ├── App.tsx / main.tsx / styles.css / types.ts
├── tests/unit/                   # 31 个单元测试（layout/pinyin/strokes-data/data-import）
├── e2e/                          # 24 个 Playwright E2E 用例（main-flow / print-and-perf）
├── playwright.config.ts          # E2E 端口 4322（preview 服务器）
├── Dockerfile                    # node:20-alpine 构建 → nginx:1.27-alpine-slim 运行
├── nginx.conf                    # gzip / /healthz / 静态缓存策略 / SPA 回退
├── docker-compose.yml            # 服务名 app-022，端口 8102:80
└── .gitignore / .dockerignore
```

## 本地开发

```bash
cd app-022
npm install
npm run dev          # 开发服务器（Vite）
npm run build        # tsc --noEmit 类型检查 + 生产构建
npm run preview      # 预览生产构建
```

## 数据再生成

笔顺数据来源于 `hanzi-writer-data` npm 包（devDependency），如需重新生成或扩充字表：

```bash
npm run gen:data     # 生成 public/data/strokes.json
```

> 注意：`public/data/` 为离线必需数据，`.gitignore` 已显式排除对其的忽略，切勿删除。

## 测试

```bash
# 单元测试（31 项：分页不拆字 / buildBlock 规则 / 笔顺数据完整性 / 拼音多音字 / 去重排序等）
npm test

# E2E 测试（24 项：主流程 / 去重 / 导出 / 100 字分页 10 页 / 1:1 校验尺 / PDF 页数 / 性能 / healthz）
npx playwright install chromium   # 首次需要
npm run e2e                       # 端口 4322，自动拉起 preview 服务器
```

## Docker 部署

compose 文件位于本目录（与 Dockerfile 同级）：

```bash
cd app-022
docker compose up -d --build
```

- 访问地址：<http://localhost:8102>
- 健康检查：`GET /healthz` 返回 200 `ok`（容器自带 HEALTHCHECK，`docker ps` 显示 healthy）
- gzip：大资源压缩传输（实测 2.59MB → 1.07MB）
- 镜像体积：48.5MB（`nginx:1.27-alpine-slim`，满足 < 60MB 要求）

```bash
docker compose down   # 停止
```

## 验收要点速查

| 验收项 | 结果 |
| --- | --- |
| 分页不拆字 | 同一字所有小格同页同行 |
| 1:1 校验尺 | 100mm ≈ 377.95px（±2px） |
| PDF 打印页数 | 与预览页数一致（如 100 字 → 10 页） |
| 100 字重排性能 | < 200ms |
| 笔顺数据 | 离线 1096 字，hanzi-writer-v1 格式 |
| 镜像 / 端口 / 服务名 | 48.5MB / 8102:80 / app-022 |

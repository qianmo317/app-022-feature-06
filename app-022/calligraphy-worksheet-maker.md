# 田字格字帖与笔顺生成 · Calligraphy Worksheet Maker

> 类型：前端 Web 应用（纯前端，无后端接口）｜技术栈：**React 18 + TypeScript 5 + Vite 5**（react-router-dom 6、pinyin-pro、@fontsource/noto-sans-sc；手写 CSS，不引入 UI 库）

## 1. 一句话简介
把一串汉字/字母/数字排成田字格（米字格、回宫格、方格、横线格、拼音四线格）字帖：每个字按「例字 + 笔顺分解 + 描红 + 临写空格」组合成块，按 A4 贪心分页且不拆字，可打印、可导出 SVG/PNG。

## 2. 真实场景与痛点
- 小学低年级每天要出练字页：用 Word 画格子调间距很费时间，字号和格宽很难对齐，一改行数整页重排。
- 识字教学要求笔顺正确，而现成字帖多是静态图片，看不出「先横后竖」，学生写错顺序无人纠正。
- 生字表里重复字多，手工去重容易漏；多音字（如「行」xíng/háng）标错读音会被学生记住。
- 打印是最容易出问题的一环：浏览器默认「适应页面」会缩放，格子印出来不是 20mm，无法用于实际测量。
- 学校与家庭的机器常不能装软件、不便联网，工具必须打开浏览器即用、离线可跑。

## 3. 目标用户
- 小学语文教师（识字与写字课、单元生字表）。
- 家长（课后练字、姓名练习、古诗抄写）。
- 教辅与兴趣班老师（批量出同类字帖）。
- 需要放大字格的低视力或书写启蒙场景使用者。

## 4. 核心功能（MVP）
1. **输入与去重**：粘贴文本后按 `parseInput` 过滤（只留汉字/字母/数字）、去重并保留首次出现顺序，可勾选按笔画数排序（无笔画数据的字排最后）。
2. **格线类型**：田字格 `tian`、米字格 `mi`、回宫格 `huigong`（外框 + 68×68 内框）、方格 `square`、横线格 `line`；`line` 下可切「拼音四线格」。
3. **每字小格组合**：`mix = { model, strokeSteps, trace, blank }`，例字 0/1 格、笔顺分解 0~8 格（格数取 `min(配置, 笔画数)`）、描红 0~8 格、临写空格 0~8 格。
4. **分页不拆字**：贪心按行填充，一个字的所有小格必须落在同一行同一页；一行不跨页。
5. **多音字**：字面板列出该字全部读音（如「行」共 4 个选项），选中的读音写入 `pinyinChoice` 并在预览信息带显示。
6. **笔顺动画**：`StrokePlayer` 用 `requestAnimationFrame` + `strokeDashoffset` 逐笔描边，已完成笔灰色、当前笔深色，支持播放/暂停/上一笔/下一笔/重置/圆点跳转。
7. **打印与导出**：`Ctrl/Cmd+P` 进入打印视图（A4、页边距 0）；单页导出 SVG 与 4x PNG。
8. **本地保存**：字帖存 localStorage（防抖 250ms 自动保存并记录页数），刷新不丢。
9. **模板库与校验尺**：5 套预置模板；第 1 页附 100mm 校验尺用于核对物理尺寸。

## 5. 进阶功能
- **自定义笔顺数据导入**：支持 `{chars:{...}}` 全量包、`{字:{strokes,...}}` 单字映射、`{strokes:[...]}` 绑定当前字三种格式，写入 localStorage 并即时生效。
- **按笔画数排序**：用于把生字表排成由易到难。
- **单字编辑**：面板内替换（同字去重）与删除该字，文本域与预览同步。
- **大屏笔顺播放页**：`/play/:id` 以 90mm 尺寸逐笔演示，速度预设 250/400/600ms，方向键切换字。
- **预览缩放**：适应窗口（按容器宽度算）、100%、±0.1 步进（0.2~2）。

## 6. 页面结构
```
/                    首页：输入生字生成字帖 + 最近字帖列表（打开/笔顺/删除）
/worksheet/:id       编辑器（左 300px 设置 | 中预览 | 右 280px 单字面板）
/worksheet/:id/print 打印视图（?autoprint=1 时字体就绪后自动唤起打印）
/library             模板库（5 套模板一键套用）
/play/:id            笔顺播放页（大屏逐笔 + 速度预设 + 字按钮）
*                    未匹配路由重定向到 /
```
应用启动时先 `initData()` 拉取 `/data/strokes.json`，加载失败显示错误与「重试」，成功后才挂路由。

## 7. 数据模型
```ts
type GridKind = 'tian' | 'mi' | 'huigong' | 'square' | 'line';
type Mix = { model: number; strokeSteps: number; trace: number; blank: number };
type Layout = {
  grid: GridKind; perLine: number; lines: number; cellMm: number; lineGapMm: number;
  mix: Mix; show: { pinyin: boolean; radical: boolean; strokeCount: boolean; structure: boolean };
  traceColor: string; fourLine?: boolean;
};
type Worksheet = {
  id: string; title: string; chars: string[]; layout: Layout; pages: number; updatedAt: number;
  pinyinChoice?: Record<string, number>; sortByStrokes?: boolean;
};
type CellKind = 'model' | 'step' | 'trace' | 'blank';
type Cell = { kind: CellKind; stepK?: number };
type Block = { char: string; cells: Cell[] };   // 一个字的小格组合
type Row = Block[]; type Page = Row[];
```
- 笔顺数据：`public/data/strokes.json`，`{ format: 'hanzi-writer-v1', count, chars: { 字: { strokes: string[], medians: number[][][] } } }`，实测 `count = 1096`、2,590,937 字节。
- localStorage 键：`app022:worksheets`（字帖数组，新存的排最前）、`app022:customStrokes`（导入的补充笔顺）。
- 部首/结构取自 `src/lib/charinfo.ts` 的 `CHAR_META`（字 → [部首, 结构]，结构取值 `left_right | top_bottom | single | enclosure`），未收录不展示。

## 8. 关键算法（关键实现点）
- **A4 页面几何**（`src/lib/layout.ts`）：`PAGE = { wMm: 210, hMm: 297, marginLMm: 5, marginRMm: 5, marginTMm: 8, marginBMm: 8, headerMm: 12 }`，可用宽 `usableWMm = 200`、行区高 `rowsAreaHMm = 269`。
- **格数与行数上限**：`maxPerLine = floor(200 / cellMm)`（20mm → 10 格）；`maxLines = floor(269 / (cellMm * 1.2 + lineGapMm))`（20mm/2mm → 10 行）。`clampLayout` 把 `cellMm` 夹到 12~35、`lineGapMm` 0~12、`mix` 各项分别夹到 `model 0~1`、`strokeSteps/trace/blank 0~8`。
- **块组合** `buildBlock`：`model` 先入；`strokeSteps > 0 且 strokeCount != null` 时入 `min(strokeSteps, strokeCount)` 个 `step`；**无笔顺数据的汉字（`strokeCount == null && isCjk`）不生成分解格也不生成描红格**（避免误教），只留例字与空格；最后 `slice(0, perLine)` 兜底，保证块不超一行。
- **贪心分页** `paginate`：逐字取块，若当前行已有内容且 `used + cells.length > perLine` 就换行，再按 `lines` 切页；空内容也返回一页空白字帖。
- **渲染单位制**（`src/components/paint.tsx`）：`INFO_H = 20`、`ROW_H = 100 + INFO_H = 120`、`ROW_FACTOR = ROW_H / 100 = 1.2`；1 unit = `cellMm/100` mm，即每格 100×100 units + 上方 20 units 信息带。预览、打印、导出共用 `RowContent`，所见即所得。
- **字形变换** `glyphTransform(cx, cy) = translate(cx cy) scale(0.092) translate(-512 -450) scale(1 -1) translate(0 -900)`，把 hanzi-writer 的 1024 em box（y 向上）映射到格中心；笔画宽 `STROKE_W = 58`、描红 `TRACE_W = 62`。
- **字形回退**：有笔顺数据用 SVG path；无数据的汉字/字母用字体 `text`（汉字 82、字母数字 64），并额外标注红色「无笔顺数据」。
- **导出**：`pageSvgMarkup` 用 `renderToStaticMarkup` 拼整页 SVG（`width/height` 用 mm、`viewBox` 用 px，`PX_MM = 96/25.4`）；PNG 走 `Image` + `canvas.drawImage`，倍率 4（A4 → 约 3175×4490 px）。
- **拼音**：`readingsOf` 调 `pinyin(ch, { multiple: true, type: 'array' })` 去重后缓存到 Map；`pinyinResolver` 按 `pinyinChoice[char] ?? 0` 取读音。
- **性能**：分页为纯函数、单次线性扫描；E2E 要求 100 字全量重排 < 200ms。

## 9. 交互与视觉要点
- 三栏编辑器固定 `300px | minmax(0,1fr) | 280px`；顶部工具条放标题输入、打印入口、导出页码下拉、导出 SVG/PNG。
- 键盘：编辑器 `←/→` 循环切换选中字，`Ctrl/Cmd+P` 直达打印视图；播放器聚焦时方向键改为逐笔（用 `.player` 判断避免双重响应），`Space` 播放/暂停；焦点在 `INPUT/TEXTAREA/SELECT/contentEditable` 时不抢键（`isFormTarget`）。
- 预览点击格块选中该字：把点击位置按行 SVG 宽度换算成 unit（`x / 宽度 * perLine * 100`），命中块区间后以 `#4a90d9` 描边高亮。
- 配色：例字 `#222`、已完成笔 `#bfbfbf`、辅助线 `#e8a3a3` 虚线、边框 `#9aa0a6`、拼音 `#c0563c`、信息 `#666`；描红三档 `#d9d9d9 / #cccccc / #b3b3b3`。
- 打印：`@page { size: A4 portrait; margin: 0 }`，`.sheet { page-break-after: always }`（末页 auto），工具栏 `.no-print` 隐藏；打印视图不显示选中态与点击行为（`plain`）。
- 可访问性：播放器是 `role="img"` + `aria-label`，圆点与按钮带 `aria-label`，播放器可聚焦并有焦点样式；导入的文案与页脚页码都是真实文本。

## 10. 验收标准
- **单元测试 31 项**（`tests/unit/`：layout 16、data-import 5、pinyin 5、strokes-data 5 个 `it`）全绿：去重保序、过滤标点、按笔画数排序稳定、`maxPerLine(20)=10`、`maxLines(20,2)=10`、`clampLayout` 边界、`buildBlock` 组合序列、块不超一行、分页不拆字、空内容一页、笔顺数据格式与抽查笔画数（火 4、必 5、方 4、里 7、女 3、绿 11、门 3、飞 3、马 3、鸟 5）、拼音多音字、模板 5 套。
- **E2E 24 项**（`e2e/`：main-flow 16、print-and-perf 8 个 `test`）通过：主流程统计为 `5 字 · 1 页`、100 字 → `10 页` 且 100 个块无孤儿；「花」7 画出现 7 个步骤圆点、「木」4 画；「行」4 个读音选项且选择后刷新仍在。
- **打印一致性**：100mm 校验尺在屏幕宽度落在 375.9~379.9px（1mm = 3.7795px）；`page.pdf({ format: 'A4' })` 的 `/Type /Page` 计数与预览页数一致（100 字 → 10 页）。
- **无笔顺数据**：`㐀` 显示「无笔顺数据」，块内描红路径数为 0；导入笔顺 JSON 后提示「已导入 1 条」且标注消失。
- **性能**：100 字全量重排 < 200ms。
- **健康检查**：`GET /healthz` 返回 200 与文本 `ok`，`GET /` 返回 200。
- **持久化**：编辑内容与配置自动存 localStorage，`/worksheet/no-such-id` 自动跳回首页。

## 11. 边界（刻意不做）
不做账号体系与云端同步、不做学生作业提交与批改、不做字帖商城与付费内容、不做拍照识字/OCR 取字、不做书法评分或笔画美观度打分、不做后端渲染 PDF（打印交给浏览器）、不做社区分享与排名。核心只做**输入 → 排版 → 预览 → 打印/导出**，避开黑名单中的博客 CMS、电商订单、音乐播放器方向。

### 已知实现边界
- README §目录结构把格子渲染画在 `src/lib/paint.tsx`（README.md:40），实际文件是 `src/components/paint.tsx`，同段 README.md:49 又列了一次同一文件。
- README.md:14 称「**每页**附 100mm 校验尺」，实现里只在整份文档第 1 页渲染（`src/components/PageView.tsx:121` 的 `pi === 0 && <Ruler />`）。
- README.md:13 称「内置多音字词典，拼音按**语境**标注」，实际没有本地词典，读音全部来自 pinyin-pro 的 `multiple: true`（`src/lib/pinyin.ts:14`），且按字选择、不看上下文。
- 模板 `grade1` 的描述写「常用基础生字 **100 字**，按笔画数排列」（`src/lib/templates.ts:24`），实测字符集 59 字，且 `worksheetFromTemplate` 固定 `sortByStrokes: false`（`src/lib/templates.ts:87`），不会按笔画数排序。
- README.md:81 称 `.gitignore` 已显式排除对 `public/data/` 的忽略，实际 `.gitignore:19` 只有一行注释，没有 `!public/data/` 规则（目前也没有规则会匹配到该目录）。
- README.md:106 的镜像体积 48.5MB 与 README.md:105 的 gzip 2.59MB → 1.07MB：gzip 数字已复核（源文件 2,590,937 字节，gzip 后 1,068,105 字节），镜像体积本次未重建镜像核对。

## 12. 容器化与构建（Docker）

交付必须能通过 Docker 构建与运行，验收以容器内结果为准。**无后端依赖**：排版、笔顺、导出全在浏览器内完成，容器只做静态托管，断网可用。

- **Dockerfile（多阶段）**：`node:20-alpine` 阶段 `npm ci` + `npm run build`（先 `tsc --noEmit`）→ 运行阶段 `nginx:1.27-alpine-slim`，拷 `nginx.conf` 到 `/etc/nginx/conf.d/default.conf`、拷 `/app/dist` 到 `/usr/share/nginx/html`，`EXPOSE 80`。
- **HEALTHCHECK**：`--interval=30s --timeout=3s --start-period=5s`，命令 `wget -qO- http://127.0.0.1/healthz || exit 1`。
- **docker-compose.yml**：服务名 `app-022`、镜像 `app-022:latest`、容器名 `app-022`、端口 **`8102:80`**、`restart: unless-stopped`（无环境变量、无数据卷）。
- **nginx.conf**：`gzip on`（level 6、`min_length 1024`，类型含 js/css/json/svg/woff2）；`location = /healthz` 直接 `return 200 'ok'`；`/assets/` 30 天 `immutable`；`/data/`（笔顺 JSON）1 天 `public`；`/index.html` 与 `/` 均 `no-cache`，SPA 回退 `try_files $uri $uri/ /index.html`。
- dev/preview 下由 Vite 插件提供同名 `/healthz`（`vite.config.ts`），E2E 因此无需先起容器。

```bash
cd app-022
docker compose up -d --build
curl http://localhost:8102/healthz     # 期望：ok（HTTP 200）
docker compose down
```

- **验收**：访问 `http://localhost:8102`，完成「输入生字 → 排版预览 → 打印视图 → 导出 SVG/PNG」；`docker ps` 中 `app-022` 状态为 healthy；笔顺数据从 `/data/strokes.json` 加载（不打包进 JS）。

### 忽略文件（.dockerignore / .gitignore）
- **`.dockerignore`**：`node_modules`、`dist`、`tests`、`e2e`、`playwright.config.ts`、`.env`、`.env.*`、`*.log`、`students`、`exports`、`*.pdf`、`.git`、`.gitignore`、`Dockerfile`、`.dockerignore`、`docker-compose.yml`、`README.md`。**保留** `package-lock.json`、`public/data/strokes.json`、`nginx.conf`。
- **`.gitignore`**：`node_modules/`、`dist/`、`.env`、`.env.*`、`*.local`、`students/`、`exports/`、`*.pdf`、`*.log`、`.DS_Store`；末行注释声明 `public/data/` 为离线数据必须保留，**不要 ignore**。
- **自检**：构建上下文不含 `node_modules`（本机约 78MB 的依赖目录）；`git status` 不出现 `.env`、`dist/` 与业务导出目录。

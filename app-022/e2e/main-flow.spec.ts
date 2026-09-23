import { expect, test, type Page } from '@playwright/test';

/** 恰好 100 个互不相同的汉字（与单测一致的集合来源） */
const HUNDRED = [
  ...new Set(
    '一二三四五六七八九十人口手足耳目日月水火山石田土禾木马虫鱼肉鸟竹米谷风云电天上下大小多少长短高矮进出开关来去坐立走飞东西南北前中外交里半分变成白黑红黄蓝绿紫灰粉金银行学习工作休息游玩吃喝看听读写说球场',
  ),
].slice(0, 100);

async function createWorksheet(page: Page, chars: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
  return page.url().split('/').pop()!;
}

/** 点击第 rowIndex 行的第 cellIndex 个格子（默认版式每行 10 格） */
async function clickCell(page: Page, rowIndex: number, cellIndex = 0) {
  const row = page.locator(`[data-row="${rowIndex}"]`).first();
  const box = await row.boundingBox();
  const cellW = box!.width / 10;
  await row.click({ position: { x: cellW * (cellIndex + 0.5), y: box!.height / 2 } });
}

test.describe('主流程', () => {
  test('首页 → 输入 → 生成 → 编辑器预览', async ({ page }) => {
    const id = await createWorksheet(page, '春天花会开');
    expect(id).toBeTruthy();
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('5 字 · 1 页');
    await expect(page.locator('[data-pages]')).toHaveAttribute('data-page-count', '1');
    for (const ch of '春天花会开') {
      await expect(page.locator(`[data-block="${ch}"]`).first()).toBeVisible();
    }
    // 自动保存到 localStorage，首页最近列表可见
    await page.goto('/');
    await expect(page.locator('.recent-item').first()).toContainText('春天花会');
  });

  test('输入自动去重并保留首次出现顺序', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="input-chars"]', '花春天 春天花会');
    await expect(page.locator('[data-testid="home-count"]')).toHaveText('已识别 4 个字');
    await page.click('[data-testid="create"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('4 字 · 1 页');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('花 春 天 会');
  });

  test('空输入给出提示', async ({ page }) => {
    await page.goto('/');
    await page.fill('[data-testid="input-chars"]', '，。！！');
    await page.click('[data-testid="create"]');
    await expect(page.locator('[data-testid="home-error"]')).toContainText('至少输入');
  });

  test('点击字块选中 → 单字面板/笔顺播放器', async ({ page }) => {
    await createWorksheet(page, '花木水');
    await clickCell(page, 0); // 第 1 行 = 花
    await expect(page.locator('[data-testid="char-panel"]')).toContainText('选中字：花');
    // 笔顺播放器：花 7 画，出现 7 个步骤圆点
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(7);
    await expect(page.locator('[data-testid="player-step"]')).toContainText('1 / 7');
    await page.click('[data-testid="player-next"]');
    await expect(page.locator('[data-testid="player-step"]')).toContainText('2 / 7');
    // 步骤圆点跳转
    await page.locator('[data-testid="stroke-dot"]').nth(4).click();
    await expect(page.locator('[data-testid="player-step"]')).toContainText('5 / 7');
    // 键盘 ← 上一笔
    await page.locator('[data-testid="stroke-player"]').press('ArrowLeft');
    await expect(page.locator('[data-testid="player-step"]')).toContainText('4 / 7');
  });

  test('←→ 切换选中字（编辑器键盘）', async ({ page }) => {
    await createWorksheet(page, '花木水');
    await page.locator('body').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-testid="char-panel"]')).toContainText('选中字：木');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-testid="char-panel"]')).toContainText('选中字：花');
    // 循环：最左再往左 → 最后一个
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-testid="char-panel"]')).toContainText('选中字：水');
  });

  test('多音字选择并持久化（行 xíng/háng）', async ({ page }) => {
    await createWorksheet(page, '行');
    // 行 是多音字：至少 xíng/háng 两个读音
    await expect(page.locator('[data-testid="pinyin-choice"]')).toHaveCount(4);
    await expect(page.locator('[data-pinyin]').first()).toHaveText(/xíng|háng|hàng|héng/);
    await page.locator('[data-testid="pinyin-choice"]').nth(1).click();
    const chosen = await page.locator('[data-pinyin]').first().textContent();
    await page.waitForTimeout(600); // 等待自动保存
    await page.reload();
    await expect(page.locator('[data-testid="pinyin-choice"]')).toHaveCount(4);
    await expect(page.locator('[data-pinyin]').first()).toHaveText(chosen!);
  });

  test('替换字：面板替换后块与文本同步', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1); // 第 2 行 = 乙
    await page.fill('[data-testid="replace-input"]', '丁');
    await page.click('[data-testid="replace-btn"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('3 字 · 1 页');
    await expect(page.locator('[data-block="丁"]')).toHaveCount(1);
    await expect(page.locator('[data-block="乙"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 丁 丙');
  });

  test('删除该字', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1); // 乙
    await page.click('[data-testid="delete-char"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('2 字 · 1 页');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 丙');
  });

  test('导入自定义笔顺数据（json 文件）', async ({ page }) => {
    await createWorksheet(page, '㐀');
    await expect(page.locator('[data-no-stroke]').first()).toBeVisible();
    const payload = JSON.stringify({
      chars: { 㐀: { strokes: ['M10 80 L90 20'], medians: [[[10, 80], [90, 20]]] } },
    });
    await page.locator('[data-testid="import-strokes"]').setInputFiles({
      name: 'strokes.json',
      mimeType: 'application/json',
      buffer: Buffer.from(payload),
    });
    await expect(page.locator('[data-testid="import-msg"]')).toContainText('已导入 1 条');
    await expect(page.locator('[data-no-stroke]')).toHaveCount(0);
  });

  test('导出 SVG / PNG 触发下载', async ({ page }) => {
    await createWorksheet(page, '春花');
    const svgDl = page.waitForEvent('download');
    await page.click('[data-testid="export-svg"]');
    expect((await svgDl).suggestedFilename()).toMatch(/\.svg$/);
    const pngDl = page.waitForEvent('download');
    await page.click('[data-testid="export-png"]');
    expect((await pngDl).suggestedFilename()).toMatch(/\.png$/);
  });

  test('模板库 → 一年级生字表', async ({ page }) => {
    await page.goto('/library');
    await expect(page.locator('[data-testid^="template-"]')).toHaveCount(5);
    await page.click('[data-testid="template-grade1"]');
    await expect(page).toHaveURL(/\/worksheet\//);
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('一年级生字表');
    await expect(page.locator('[data-testid="char-count"]')).toContainText(/5\d 字/);
  });

  test('模板库 → 拼音四线格', async ({ page }) => {
    await page.goto('/library');
    await page.click('[data-testid="template-pinyin"]');
    await expect(page.locator('[data-grid="line4"]').first()).toBeVisible();
  });

  test('笔顺播放页', async ({ page }) => {
    const id = await createWorksheet(page, '花木水');
    await page.goto(`/play/${id}`);
    await expect(page.locator('[data-testid="stroke-player"]')).toBeVisible();
    await expect(page.locator('[data-testid="player-step"]')).toContainText('1 / 7');
    await page.click('[data-testid="play-next"]');
    await expect(page.locator('[data-testid="play-chars"] button.active')).toHaveText('木');
    await expect(page.locator('[data-testid="stroke-dot"]')).toHaveCount(4); // 木 4 画
  });

  test('100 字分页：10 页、每块完整属于一个页', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.fill('[data-testid="editor-chars"]', HUNDRED.join(''));
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('100 字 · 10 页');
    await expect(page.locator('[data-pages]')).toHaveAttribute('data-page-count', '10');
    await expect(page.locator('.sheet')).toHaveCount(10);
    const stats = await page.evaluate(() => {
      const blocks = [...document.querySelectorAll('[data-block]')];
      const pages = [...document.querySelectorAll('[data-page]')];
      const orphan = blocks.filter((b) => !b.closest('[data-page]')).length;
      return { blockCount: blocks.length, pageCount: pages.length, orphan };
    });
    expect(stats).toEqual({ blockCount: 100, pageCount: 10, orphan: 0 });
  });

  test('格宽调整联动每行格数上限（35mm → 5 格）', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.fill('[data-testid="cell-mm"]', '35');
    await expect(page.locator('[data-testid="per-line"]')).toHaveValue('5');
  });

  test('米字格与描红颜色切换', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await expect(page.locator('[data-grid="mi"]').first()).toBeVisible();
    await page.locator('[data-testid="trace-color"]').nth(2).click(); // 深
    await expect(page.locator('.row-svg path[stroke="#b3b3b3"]').first()).toBeVisible();
  });
});

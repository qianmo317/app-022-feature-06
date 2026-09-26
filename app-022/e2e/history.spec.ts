import { expect, test, type Page } from '@playwright/test';

async function createWorksheet(page: Page, chars: string): Promise<string> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
  return page.url().split('/').pop()!;
}

/** 第 rowIndex 行第 cellIndex 格（默认每行 10 格） */
async function clickCell(page: Page, rowIndex: number, cellIndex = 0) {
  const row = page.locator(`[data-row="${rowIndex}"]`).first();
  const box = await row.boundingBox();
  const cellW = box!.width / 10;
  await row.click({ position: { x: cellW * (cellIndex + 0.5), y: box!.height / 2 } });
}

test.describe('撤销 / 重做历史栈', () => {
  test('删字 → 撤销恢复 → 重做再删', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1); // 乙
    await page.click('[data-testid="delete-char"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('2 字 · 1 页');

    // 历史面板里能看到「删除字 · 乙」与前后对照
    await page.click('[data-testid="history-toggle"]');
    const entry = page.locator('[data-testid="history-entry"]').first();
    await expect(entry).toContainText('删除字 · 乙');
    await expect(entry).toContainText('→');
    await entry.hover();
    const tip = page.locator('[data-testid="history-tip"]').first();
    await expect(tip).toContainText('改前');
    await expect(tip).toContainText('甲 乙 丙');
    await expect(tip).toContainText('改后');
    await expect(tip).toContainText('甲 丙');

    // 撤销：乙回来；此时已到栈底，撤销不可用、重做可用
    await page.click('[data-testid="undo-btn"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('3 字 · 1 页');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 乙 丙');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeEnabled();
    await page.click('[data-testid="redo-btn"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('2 字 · 1 页');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 丙');
  });

  test('点历史列表任意一步跳转（撤回到任意一步）', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await page.selectOption('[data-testid="grid-select"]', 'square');
    await expect(page.locator('[data-grid="square"]').first()).toBeVisible();

    await page.click('[data-testid="history-toggle"]');
    const entries = page.locator('[data-testid="history-entry"]');
    await expect(entries).toHaveCount(2);
    // 点第 1 步（田→米）
    await entries.first().click();
    await expect(page.locator('[data-grid="mi"]').first()).toBeVisible();
    // 回到栈底初始状态（田字格）
    await page.click('[data-testid="history-base"]');
    await expect(page.locator('[data-grid="tian"]').first()).toBeVisible();
    // 再跳到最新
    await entries.nth(1).click();
    await expect(page.locator('[data-grid="square"]').first()).toBeVisible();
  });

  test('连续撤销/重做与键盘快捷键', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await page.selectOption('[data-testid="grid-select"]', 'huigong');

    // 初始撤销按钮不可用
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
    // Ctrl+Z 连撤两步回田字格（焦点不在输入控件）
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-grid="mi"]').first()).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-grid="tian"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
    // Ctrl+Shift+Z 重做一步
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-grid="mi"]').first()).toBeVisible();
    // Ctrl+Y 再重做一步
    await page.keyboard.press('Control+y');
    await expect(page.locator('[data-grid="huigong"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeDisabled();
  });

  test('标题逐字输入合并为一步，撤销一次恢复', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.fill('[data-testid="title-input"]', '');
    await page.type('[data-testid="title-input"]', '春天的字帖', { delay: 30 });
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('春天的字帖');
    await page.click('[data-testid="history-toggle"]');
    await expect(page.locator('[data-testid="history-entry"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="history-entry"]').first()).toContainText('标题');
    await page.click('[data-testid="undo-btn"]');
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('春字帖');
  });

  test('栈满 50 步丢弃最早的一步', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.click('[data-testid="history-toggle"]');
    // 勾选「拼音」是离散操作，每次都独立入栈；快速连点 52 次 → 满 50 后丢弃最早的
    for (let i = 0; i < 52; i++) {
      await page.click('[data-testid="show-pinyin"]');
    }
    await expect(page.locator('[data-testid="history-entry"]')).toHaveCount(50);
    // 栈底文案提示更早的已被丢弃
    await expect(page.locator('[data-testid="history-base"]')).toContainText('已丢弃');
    // 计数显示 50/50
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('50/50');
  });

  test('重新生成内容（改原文）后历史清空并提示', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1);
    await page.click('[data-testid="delete-char"]');
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('1/50');
    // 在原文框重新输入 → 栈清空 + toast
    await page.fill('[data-testid="editor-chars"]', '春夏秋冬');
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('0/50');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
    const toast = page.locator('[data-testid="toast"]');
    await expect(toast).toContainText('重新生成');
    await expect(toast).toContainText('清空');
  });

  test('切换到另一份字帖后历史清空并提示', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1);
    await page.click('[data-testid="delete-char"]');
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('1/50');
    // 应用内回首页（SPA 导航，组件不卸载），再打开另一份字帖
    await page.click('.editor-bar .btn.ghost');
    await page.fill('[data-testid="input-chars"]', '春夏秋冬');
    await page.click('[data-testid="create"]');
    // 先断言 toast（会自动消失），再检查栈已清空
    await expect(page.locator('[data-testid="toast"]')).toContainText('切换');
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('春夏秋冬字帖');
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('0/50');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
  });

  test('导出到本机（SVG）后历史清空并提示', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('1/50');
    const dl = page.waitForEvent('download');
    await page.click('[data-testid="export-svg"]');
    expect((await dl).suggestedFilename()).toMatch(/\.svg$/);
    await expect(page.locator('[data-testid="history-toggle"]')).toContainText('0/50');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
    await expect(page.locator('[data-testid="toast"]')).toContainText('导出');
  });

  test('勾选信息显示项可撤销，步骤标注具体哪一项', async ({ page }) => {
    await createWorksheet(page, '春');
    await page.click('[data-testid="show-pinyin"]');
    await page.click('[data-testid="history-toggle"]');
    const entry = page.locator('[data-testid="history-entry"]').first();
    await expect(entry).toContainText('显示拼音');
    await expect(entry).toContainText('开 → 关');
    await page.click('[data-testid="undo-btn"]');
    await expect(page.locator('[data-testid="show-pinyin"]')).toBeChecked();
  });

  test('替换字可撤销，文本域与预览同步恢复', async ({ page }) => {
    await createWorksheet(page, '甲乙丙');
    await clickCell(page, 1); // 乙
    await page.fill('[data-testid="replace-input"]', '丁');
    await page.click('[data-testid="replace-btn"]');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 丁 丙');
    await page.click('[data-testid="undo-btn"]');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('甲 乙 丙');
    await expect(page.locator('[data-block="乙"]')).toHaveCount(1);
    await expect(page.locator('[data-block="丁"]')).toHaveCount(0);
  });
});

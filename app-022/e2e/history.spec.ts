import { expect, test, type Page } from '@playwright/test';

async function createWorksheet(page: Page, chars: string): Promise<void> {
  await page.goto('/');
  await page.fill('[data-testid="input-chars"]', chars);
  await page.click('[data-testid="create"]');
  await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
}

test.describe('编辑历史（撤销 / 重做）', () => {
  test('改版式可撤销、可重做，历史面板记录前后对照', async ({ page }) => {
    await createWorksheet(page, '春天花');
    // 改格线类型：田字格 → 米字格
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    // 改标题
    await page.fill('[data-testid="title-input"]', '我的字帖');

    // 历史栈有两步，能看出改的是哪一项
    await page.click('[data-testid="history-toggle"]');
    const items = page.locator('[data-testid="history-item"]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('版式 · 格线类型');
    await expect(items.nth(0)).toContainText('田字格 → 米字格');
    await expect(items.nth(1)).toContainText('标题');
    // 悬停可见前后对照
    await expect(items.nth(0)).toHaveAttribute('title', /改之前：田字格\n改之后：米字格/);
    await page.click('[data-testid="history-toggle"]');

    // 连续撤回
    await page.click('[data-testid="undo"]');
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('春天花字帖');
    await page.click('[data-testid="undo"]');
    await expect(page.locator('[data-testid="grid-select"]')).toHaveValue('tian');
    await expect(page.locator('[data-testid="undo"]')).toBeDisabled();

    // 重做回去
    await page.click('[data-testid="redo"]');
    await expect(page.locator('[data-testid="grid-select"]')).toHaveValue('mi');
    await page.keyboard.press('Control+Shift+Z');
    await expect(page.locator('[data-testid="title-input"]')).toHaveValue('我的字帖');
    await expect(page.locator('[data-testid="redo"]')).toBeDisabled();
  });

  test('删字可撤销找回，Ctrl+Z 在输入框聚焦时同样生效', async ({ page }) => {
    await createWorksheet(page, '花木水');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('3 字 · 1 页');
    // 删除选中的「花」
    await page.click('[data-testid="delete-char"]');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('2 字 · 1 页');
    // 历史里这一步标出动的是哪个字
    await page.click('[data-testid="history-toggle"]');
    await expect(page.locator('[data-testid="history-item"]').first()).toContainText('删除字 · 花');
    await page.click('[data-testid="history-toggle"]');
    // 焦点在原文输入框内按 Ctrl+Z 也能撤销
    await page.locator('[data-testid="editor-chars"]').click();
    await page.keyboard.press('Control+Z');
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('3 字 · 1 页');
    await expect(page.locator('[data-testid="editor-chars"]')).toHaveValue('花 木 水');
  });

  test('点击历史条目跳到任意一步', async ({ page }) => {
    await createWorksheet(page, '天地人');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await page.selectOption('[data-testid="grid-select"]', 'square');
    await page.click('[data-testid="history-toggle"]');
    // 跳回第 1 步之后（米字格）
    await page.locator('[data-testid="history-item"]').nth(0).click();
    await expect(page.locator('[data-testid="grid-select"]')).toHaveValue('mi');
    // 回到初始状态（面板保持打开，直接点）
    await page.locator('[data-testid="history-base"]').click();
    await expect(page.locator('[data-testid="grid-select"]')).toHaveValue('tian');
  });

  test('导出存到本机后历史清空并给出提示', async ({ page }) => {
    await createWorksheet(page, '日月');
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await expect(page.locator('[data-testid="undo"]')).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.click('[data-testid="export-svg"]');
    await download;
    await expect(page.locator('[data-testid="history-toast"]')).toContainText('编辑历史已清空');
    await expect(page.locator('[data-testid="undo"]')).toBeDisabled();
    await page.click('[data-testid="history-toggle"]');
    await expect(page.locator('[data-testid="history-empty"]')).toBeVisible();
  });

  test('切到另一份字帖后历史清空并提示', async ({ page }) => {
    await createWorksheet(page, '山石');
    const urlA = page.url();
    // 再建一份（重新生成内容 → 新字帖新会话，历史从零开始）
    await page.goto('/');
    await page.fill('[data-testid="input-chars"]', '风云');
    await page.click('[data-testid="create"]');
    await expect(page).toHaveURL(/\/worksheet\/[^/]+$/);
    await expect(page.locator('[data-testid="undo"]')).toBeDisabled();
    // 在第二份里改一步，历史非空
    await page.selectOption('[data-testid="grid-select"]', 'mi');
    await expect(page.locator('[data-testid="undo"]')).toBeEnabled();
    // 不离开编辑器直接切回第一份（等价于前进/后退或改地址栏带来的 id 变化）
    await page.evaluate((u) => {
      history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, urlA);
    await expect(page).toHaveURL(urlA);
    await expect(page.locator('[data-testid="history-toast"]')).toContainText('已切换到另一份字帖');
    await expect(page.locator('[data-testid="undo"]')).toBeDisabled();
  });
});

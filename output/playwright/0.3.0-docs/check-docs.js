async (page) => {
  const root = 'C:/Users/Misha/Documents/ChatGPT/LCT/output/playwright/0.3.0-docs';
  const pageErrors = [];
  const consoleErrors = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  await page.reload();
  const results = [];
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${root}/${viewport.name}-top.png` });
    await page.screenshot({ path: `${root}/${viewport.name}-full.png`, fullPage: true });
    const layout = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return {
        width,
        scrollWidth: document.documentElement.scrollWidth,
        pageOverflow: document.documentElement.scrollWidth > width,
        contentOutsidePage: [...document.querySelectorAll('body *')]
          .filter((element) => !element.closest('.table-wrap'))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width && (rect.left < -1 || rect.right > width + 1);
          })
          .map((element) => element.tagName + (element.id ? `#${element.id}` : '')),
        scenarioRows: document.querySelectorAll('#scenarios tbody tr').length,
        formatRows: document.querySelectorAll('#files tbody tr').length,
        reportHref: document.querySelector('a[href="showcase-0.3.0.md"]').getAttribute('href'),
        summaryHref: document.querySelector('a[href$="summary.json"]').getAttribute('href'),
      };
    });
    const anchors = [];
    const navigation = page.getByRole('navigation', { name: 'Разделы шпаргалки' });
    for (const label of ['План показа', 'Возможности', '9 сценариев', 'Варианты', 'Форматы', 'Доказательства и границы']) {
      const link = navigation.getByRole('link', { name: label, exact: true });
      const href = await link.getAttribute('href');
      await link.click();
      const position = await page.evaluate((target) => {
        const rect = document.querySelector(target).getBoundingClientRect();
        return {
          hash: location.hash,
          targetTop: rect.top,
          targetVisible: rect.top >= 0 && rect.top < innerHeight,
        };
      }, href);
      anchors.push({ label, href, ...position, pass: position.hash === href && position.targetVisible });
      if (href === '#scenarios' || href === '#files') {
        await page.screenshot({ path: `${root}/${viewport.name}-${href.slice(1)}.png` });
      }
    }
    const tables = await page.evaluate(() => [...document.querySelectorAll('.table-wrap')].map((element) => {
      const previous = element.scrollLeft;
      element.scrollLeft = element.scrollWidth;
      const maxScrollLeft = element.scrollLeft;
      element.scrollLeft = previous;
      return {
        viewportWidth: element.clientWidth,
        contentWidth: element.scrollWidth,
        maxScrollLeft,
        overflowContained: getComputedStyle(element).overflowX === 'auto',
      };
    }));
    results.push({ viewport, layout, anchors, tables });
  }
  return {
    url: page.url(),
    title: await page.title(),
    results,
    pageErrors,
    consoleErrors,
    remoteRequests,
    pass: results.every((r) => !r.layout.pageOverflow && !r.layout.contentOutsidePage.length && r.layout.scenarioRows === 9 && r.anchors.every((a) => a.pass)) && !pageErrors.length && !consoleErrors.length && !remoteRequests.length,
  };
}

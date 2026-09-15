const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');

(async () => {
  const browser = await chromium.launch({ executablePath:process.argv[3], headless:true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport:{ width, height:900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('https://**/*', (route) => route.abort());
      await page.goto(pathToFileURL(join(__dirname, '../index.html')).href);
      await page.waitForLoadState('domcontentloaded');
      async function position(selector, review = false) {
        await page.evaluate(({selector, review}) => {
          const detail = document.querySelector(selector);
          const zoneTop = innerHeight * (innerWidth >= 1024 ? .35 : .25);
          window.scrollTo({ top:scrollY + detail.getBoundingClientRect().top - zoneTop, behavior:'instant' });
          if (review) {
            const card = detail.closest('.review-card');
            const viewport = card.closest('.carousel-viewport');
            const rect = card.getBoundingClientRect();
            viewport.scrollTo({ left:viewport.scrollLeft + (rect.left + rect.right) / 2 - innerWidth / 2, behavior:'instant' });
          }
        }, {selector, review});
        await page.waitForTimeout(700);
      }
      await page.locator('[data-s4-more]').first().click();
      await position('#s4-v2-details-1');
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#s4-v2-details-1').evaluate(el=>el.hidden),false);
      await page.locator('[data-s4-more]').nth(1).click();
      assert.equal(await page.locator('#s4-v2-details-1').evaluate(el=>el.hidden),true);
      await page.locator('[data-s4-more]').first().click();

      await page.locator('.faq-item summary').first().click();
      await position('.faq-item .faq-answer');
      await page.locator('.faq-item summary').nth(1).click();
      assert.equal(await page.locator('.faq-item').first().evaluate(el=>el.open),false);

      await page.locator('.review-card .more').nth(2).click();
      await position('.review-slide:nth-child(3) .review-text',true);
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.waitForTimeout(100);
      const events = await page.evaluate(() => window.dataLayer.filter(e=>/^cro_content_/.test(e.event)));
      assert.deepEqual(errors,[]);
      for(const type of ['risk','review','faq']) {
        assert.ok(events.some(e=>e.event==='cro_content_time'&&e.content_type===type&&e.content_engagement_time>0), `${width}: no time for ${type}`);
      }
      const firstRisk = events.filter(e=>e.event==='cro_content_expand'&&e.content_id==='too_early');
      assert.deepEqual(firstRisk.map(e=>e.content_open_type),['first','reopen']);
      assert.ok(events.every(e=>e.content_id && e.content_position>0));
      console.log(JSON.stringify({width,events:events.map(e=>({event:e.event,id:e.content_id,index:e.content_open_index,time:e.content_engagement_time})),errors}));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

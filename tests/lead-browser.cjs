const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:process.argv[3],headless:true});
  try {
    for(const width of [390,1440]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{window.turnstile={render(el,options){setTimeout(()=>options.callback('mock-token'),0);return 'mock';},remove(){}};});
      let success=false;const requests=[];
      await page.route('https://**/*',async route=>{
        if(route.request().url().endsWith('/submit')){
          requests.push(route.request().postDataJSON());
          return route.fulfill({status:success?202:503,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({ok:success,accepted:success})});
        }
        return route.abort();
      });
      await page.goto(pathToFileURL(join(__dirname,'../index.html')).href);
      for(const type of ['estimation','bilan']) {
        success=false;
        await page.locator(type==='estimation'?'[data-estimate-open]':'[data-expertise-open]').first().click();
        const form=page.locator(type==='estimation'?'#estimate-form':'#expertise-form');
        const submit=()=>form.evaluate(el=>el.requestSubmit());
        if(type==='bilan'){await form.locator('[name="postcode"]').fill('69001');await submit();}
        await form.locator('label:has([name="roof_surface_range"][value="225_300"])').click();await page.waitForTimeout(350);
        if(type==='estimation') {
          await form.locator('label:has([name="roof_material"][value="beton"])').click();await page.waitForTimeout(350);
          await form.locator('label:has([name="hydrofuge_type"][value="incolore"])').click();await page.waitForTimeout(350);
          await form.locator('[name="postcode"]').fill('69001');await submit();
          await form.locator('[name="full_name"]').fill('Test Person');
          await form.locator('[name="consent_contact"]').check();
        } else await form.locator('[name="first_name"]').fill('Test');
        await form.locator('[name="phone"]').fill('0612345678');
        await form.locator('[name="email"]').fill('tester@example.org');
        const count=()=>page.evaluate(t=>dataLayer.filter(e=>e.event==='cro_lead_success'&&e.form_type===t).length,type);
        const before=await count();
        await submit();await page.waitForTimeout(300);
        assert.equal(await count(),before,'no success on server error');
        assert.equal(await form.locator('[name="email"]').inputValue(),'tester@example.org');
        success=true;await submit();await page.waitForTimeout(300);
        assert.equal(await count(),before+1,'one success after acceptance');
        const last=requests.slice(-2);assert.equal(last[0].request_id,last[1].request_id,'retry keeps id');
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(errors,[]);console.log({width,submissions:requests.length,success:'both forms'});await page.close();
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

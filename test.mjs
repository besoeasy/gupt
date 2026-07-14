import { chromium } from 'playwright';

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.toString());
    console.error("Page error: ", err);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.error("Console error: ", msg.text());
    }
  });

  console.log("Navigating to app...");
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  const title = await page.title();
  console.log("Page title:", title);

  // Wait a few seconds to let startup routines complete
  await page.waitForTimeout(5000);

  if (errors.length > 0) {
    console.error(`Found ${errors.length} errors during startup.`);
    process.exit(1);
  } else {
    console.log("Startup completed cleanly with no errors!");
  }

  await browser.close();
})();

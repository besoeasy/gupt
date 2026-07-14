import { chromium } from 'playwright';

(async () => {
  console.log("Launching browser for route testing...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let hasErrors = false;
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore some expected network/websocket errors from nostr relays
      if (text.includes('WebSocket connection to') || text.includes('Unexpected response code: 503')) {
         return;
      }
      console.error(`[Console Error]:`, text);
      hasErrors = true;
    }
  });

  page.on('pageerror', err => {
    console.error(`[Page Error]:`, err);
    hasErrors = true;
  });

  console.log("Navigating to index and initializing identity...");
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  
  // Wait for the Vue app to mount and the pinia store to be ready
  await page.waitForFunction(() => !!document.querySelector('#app'));

  // Initialize identity
  await page.evaluate(async () => {
    const { useIdentityStore } = await import('/src/stores/identity.js');
    const { generateKeypair } = await import('/src/lib/crypto.js');
    const identity = useIdentityStore();
    const keypair = generateKeypair();
    await identity.restorePrivateKey(keypair.privkeyHex);
    await identity.init();
    await new Promise(r => setTimeout(r, 500));
  });

  const dummyPubkey = "0000000000000000000000000000000000000000000000000000000000000000";
  const dummyRoomId = "room123";
  const dummyGroupId = "group123";
  
  const routesToTest = [
    '/messages',
    '/new',
    '/new/start',
    '/new/share',
    '/me',
    `/groups/${dummyGroupId}`,
    `/room/${dummyRoomId}`,
    `/call/${dummyPubkey}`,
    '/settings',
    '/notifications',
    '/stats',
    `/profile/${dummyPubkey}`,
    '/invite/testcode123',
    '/donate',
    '/share',
    '/share/view',
    '/vault'
  ];

  for (const route of routesToTest) {
    console.log(`Testing route: ${route}`);
    
    // We use the Vue router to navigate programmatically to avoid full page reloads
    // which would lose the identity state if not persisted.
    await page.evaluate(async (path) => {
        const { default: router } = await import('/src/router/index.js');
        await router.push(path);
        // Wait for vue to render the new route
        await new Promise(r => setTimeout(r, 500));
    }, route);

    // Give it a moment to catch any async errors on mount
    await new Promise(r => setTimeout(r, 500));
    
    // Check if any error flags were set
    if (hasErrors) {
       console.error(`❌ Errors encountered while testing route ${route}`);
       // Reset for the next route
       hasErrors = false;
    } else {
       console.log(`✅ Route ${route} passed.`);
    }
  }

  console.log("All routes tested.");
  await browser.close();
})();

import { chromium } from 'playwright';

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => { if (msg.type() === 'error') console.log(`[Error]`, msg.text()); });
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#app'));

  console.log("Initializing identity...");
  await page.evaluate(async () => {
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const { generateKeypair } = await import('/src/lib/crypto.js');
      const identity = useIdentityStore();
      const keypair = generateKeypair();
      await identity.restorePrivateKey(keypair.privkeyHex);
      await identity.init();
      await new Promise(r => setTimeout(r, 500));
  });

  console.log("Creating test group...");
  const groupId = await page.evaluate(async () => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      const group = await groupsApi.createGroup(identity, {
          name: "Test Specific Users", description: "Testing specific pubkeys", memberPubkeys: []
      });
      return group.groupId;
  });
  console.log("Created group ID:", groupId);
  
  await new Promise(r => setTimeout(r, 2000));

  const pubkeysToAdd = [
      "767ff9797bbc94242afc0deed08a6a7b1711b37e5fc577d8614a139480919812",
      "7b9237505e6e2f20670a8dbeae7dd4d37fa4d589bbf872579b3881047faf8e25"
  ];

  console.log("Adding specific pubkeys to the group...");
  await page.evaluate(async ({ groupId, pubkeysToAdd }) => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      await groupsApi.addMembers(identity, groupId, pubkeysToAdd);
  }, { groupId, pubkeysToAdd });

  console.log("Successfully added keys to the group!");
  
  await browser.close();
})();

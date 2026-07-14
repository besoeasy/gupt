import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('#app'));

  const now = new Date();
  const timeString = `${String(now.getHours()).padStart(2, '0')} - ${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getSeconds()).padStart(2, '0')}`;

  await page.evaluate(async (timeString) => {
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const { generateKeypair } = await import('/src/lib/crypto.js');
      const { messenger } = await import('/src/stores/messenger.js');
      const { groupsApi } = await import('/src/lib/groups.js');
      
      const identity = useIdentityStore();
      const keypair = generateKeypair();
      await identity.restorePrivateKey(keypair.privkeyHex);
      await identity.init();
      await new Promise(r => setTimeout(r, 1000));
      
      const group = await groupsApi.createGroup(identity, {
          name: "Time Group", description: "Testing", memberPubkeys: []
      });
      const groupId = group.groupId;
      
      const pubkeysToAdd = [
          "767ff9797bbc94242afc0deed08a6a7b1711b37e5fc577d8614a139480919812",
          "7b9237505e6e2f20670a8dbeae7dd4d37fa4d589bbf872579b3881047faf8e25"
      ];
      await groupsApi.addMembers(identity, groupId, pubkeysToAdd);
      
      await messenger.start(identity);
      await new Promise(r => setTimeout(r, 2000));
      
      await messenger.sendGroupMessage(identity, groupId, {
          type: "text",
          text: timeString
      });
  }, timeString);

  console.log(`Sent message: ${timeString}`);
  await browser.close();
})();

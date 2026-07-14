import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  for (let i=0; i<5; i++) {
     const context = await browser.newContext();
     const page = await context.newPage();
     page.on('console', msg => { if (msg.type() === 'error') console.log(`[Page ${i}]`, msg.text()); });
     await page.goto('http://localhost:5173', { waitUntil: 'load' });
     
     // Wait for Pinia
     await page.waitForFunction(() => window.__VUE_APP__ !== undefined);
     
     pages.push(page);
  }
  console.log("App loaded in 5 contexts.");

  const pubkeys = [];
  for (let i = 0; i < 5; i++) {
     const pubkey = await pages[i].evaluate(async () => {
         const { useIdentityStore } = await import('/src/stores/identity.js');
         const { generateKeypair } = await import('/src/lib/crypto.js');
         const identity = useIdentityStore();
         const keypair = generateKeypair();
         await identity.restorePrivateKey(keypair.privkeyHex);
         await identity.init();
         await new Promise(r => setTimeout(r, 1000));
         return identity.pubkeyHex;
     });
     pubkeys.push(pubkey);
  }

  const groupId = await pages[0].evaluate(async (members) => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      const group = await groupsApi.createGroup(identity, {
          name: "Test Group", description: "Test", memberPubkeys: members
      });
      console.log("Created group!", group.groupId);
      return group.groupId;
  }, pubkeys.slice(1));
  
  await new Promise(r => setTimeout(r, 5000));
  
  for (let i = 0; i < 5; i++) {
     await pages[i].evaluate(async () => {
         const { messenger } = await import('/src/stores/messenger.js');
         const { useIdentityStore } = await import('/src/stores/identity.js');
         await messenger.start(useIdentityStore());
     });
  }

  for (let i = 1; i < 5; i++) {
      await pages[i].evaluate(async ({ groupId }) => {
          const { groupsApi } = await import('/src/lib/groups.js');
          let group = null;
          for (let attempts = 0; attempts < 100; attempts++) {
             const groups = await groupsApi.listGroups();
             if (groups.some(g => g.groupId === groupId)) {
                 group = true;
                 break;
             }
             await new Promise(r => setTimeout(r, 200));
          }
          if (!group) {
              const groups = await groupsApi.listGroups();
              throw new Error("Failed to receive group invite. Has groups: " + JSON.stringify(groups));
          }
      }, { groupId });
  }

  console.log("Sending 100 messages round-robin...");
  let sentCount = 0;
  for (let i = 0; i < 100; i++) {
      const senderIdx = i % 5;
      await pages[senderIdx].evaluate(async ({ groupId, i }) => {
          const { groupsApi } = await import('/src/lib/groups.js');
          const { useIdentityStore } = await import('/src/stores/identity.js');
          const identity = useIdentityStore();
          await groupsApi.sendGroupMessage(identity, groupId, { type: "text", text: `Message ${i}` });
      }, { groupId, i });
      sentCount++;
      if (sentCount % 20 === 0) console.log(`Sent ${sentCount}/100 messages`);
      await new Promise(r => setTimeout(r, 50));
  }

  console.log("Waiting 15s for users to sync messages...");
  await new Promise(r => setTimeout(r, 15000));

  const receivedCounts = [];
  for (let i = 0; i < 5; i++) {
      const msgs = await pages[i].evaluate(async (groupId) => {
          const { messenger } = await import('/src/stores/messenger.js');
          return messenger.groupMessages.value[groupId]?.length || 0;
      }, groupId);
      receivedCounts.push(msgs);
  }

  console.log("Message counts per user:", receivedCounts);
  if (receivedCounts.every(c => c >= 100)) {
      console.log("SUCCESS: All users received all 100 messages!");
  } else {
      console.error("FAIL: Some users missed messages.");
      process.exit(1);
  }

  await browser.close();
})();

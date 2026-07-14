import { chromium } from 'playwright';

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const pages = [];
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.log(`[Page ${i}]`, msg.text()); });
    await page.goto('http://localhost:5173', { waitUntil: 'load' });
    await page.waitForFunction(() => !!document.querySelector('#app'));
    pages.push(page);
  }

  // User 0 (Creator), User 1 (Member 1), User 2 (Member 2)
  console.log("Initializing identities...");
  const pubkeys = [];
  for (let i = 0; i < 3; i++) {
     const pubkey = await pages[i].evaluate(async () => {
         const { useIdentityStore } = await import('/src/stores/identity.js');
         const { generateKeypair } = await import('/src/lib/crypto.js');
         const identity = useIdentityStore();
         const keypair = generateKeypair();
         await identity.restorePrivateKey(keypair.privkeyHex);
         await identity.init();
         await new Promise(r => setTimeout(r, 500));
         return identity.pubkeyHex;
     });
     pubkeys.push(pubkey);
     console.log(`User ${i} pubkey: ${pubkey}`);
  }

  // Create group with User 0
  console.log("User 0 creating a group (empty)...");
  const groupId = await pages[0].evaluate(async () => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      const group = await groupsApi.createGroup(identity, {
          name: "Add Members Test", description: "Test", memberPubkeys: []
      });
      return group.groupId;
  });
  console.log("Created group!", groupId);
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Start messengers for all users so they subscribe to DMs
  for (let i = 0; i < 3; i++) {
     await pages[i].evaluate(async () => {
         const { messenger } = await import('/src/stores/messenger.js');
         const { useIdentityStore } = await import('/src/stores/identity.js');
         await messenger.start(useIdentityStore());
     });
  }

  // Now, User 0 adds User 1 and User 2 using addMembers!
  console.log("User 0 adding User 1 and User 2 to group...");
  await pages[0].evaluate(async ({ groupId, newMembers }) => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      await groupsApi.addMembers(identity, groupId, newMembers);
  }, { groupId, newMembers: [pubkeys[1], pubkeys[2]] });

  console.log("Waiting for users to receive invites...");
  for (let i = 1; i < 3; i++) {
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
      console.log(`User ${i} received the group successfully!`);
  }
  
  await browser.close();
})();

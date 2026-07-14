import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  
  // Create Context for User A
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto('http://localhost:5173', { waitUntil: 'load' });
  await pageA.waitForFunction(() => !!document.querySelector('#app'));

  // Create Context for User B
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto('http://localhost:5173', { waitUntil: 'load' });
  await pageB.waitForFunction(() => !!document.querySelector('#app'));

  console.log("Initializing identities...");

  const pubkeyA = await pageA.evaluate(async () => {
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const { generateKeypair } = await import('/src/lib/crypto.js');
      const { messenger } = await import('/src/stores/messenger.js');
      const identity = useIdentityStore();
      const keypair = generateKeypair();
      await identity.restorePrivateKey(keypair.privkeyHex);
      await identity.init();
      await messenger.start(identity);
      await new Promise(r => setTimeout(r, 500));
      return identity.pubkeyHex;
  });

  const pubkeyB = await pageB.evaluate(async () => {
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const { generateKeypair } = await import('/src/lib/crypto.js');
      const { messenger } = await import('/src/stores/messenger.js');
      const identity = useIdentityStore();
      const keypair = generateKeypair();
      await identity.restorePrivateKey(keypair.privkeyHex);
      await identity.init();
      await messenger.start(identity);
      await new Promise(r => setTimeout(r, 500));
      return identity.pubkeyHex;
  });

  console.log(`User A: ${pubkeyA}`);
  console.log(`User B: ${pubkeyB}`);

  console.log("User A creating group and adding User B...");
  const groupId = await pageA.evaluate(async (pubkeyB) => {
      const { groupsApi } = await import('/src/lib/groups.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      const identity = useIdentityStore();
      const group = await groupsApi.createGroup(identity, {
          name: "Time Test Group", description: "Testing", memberPubkeys: []
      });
      await groupsApi.addMembers(identity, group.groupId, [pubkeyB]);
      return group.groupId;
  }, pubkeyB);
  
  await new Promise(r => setTimeout(r, 2000));

  const now = new Date();
  const timeString = `${String(now.getHours()).padStart(2, '0')} - ${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getSeconds()).padStart(2, '0')}`;
  
  console.log("User A sending message: " + timeString);
  await pageA.evaluate(async ({ groupId, timeString }) => {
      const { messenger } = await import('/src/stores/messenger.js');
      const { useIdentityStore } = await import('/src/stores/identity.js');
      await messenger.sendGroupMessage(useIdentityStore(), groupId, {
          type: "text",
          text: timeString
      });
  }, { groupId, timeString });

  console.log("Waiting for User B to receive group and message...");
  const success = await pageB.evaluate(async ({ groupId, timeString }) => {
      const { messenger } = await import('/src/stores/messenger.js');
      
      let receivedMsg = false;
      for (let i = 0; i < 50; i++) {
          const msgs = messenger.groupMessages[groupId] || [];
          if (msgs.some(m => m.text === timeString)) {
              receivedMsg = true;
              break;
          }
          await new Promise(r => setTimeout(r, 200));
      }
      return receivedMsg;
  }, { groupId, timeString });

  if (success) {
      console.log(`✅ User B successfully received the time message: "${timeString}"`);
  } else {
      console.error(`❌ User B did NOT receive the message!`);
      process.exit(1);
  }

  await browser.close();
})();

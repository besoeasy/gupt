import { buildOriginlessUploadUrl, DEFAULT_BLOSSOM_SERVERS, DEFAULT_ORIGINLESS_SERVERS } from '../src/config/servers.js';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function tryUploadToServer(server) {
  try {
    const uploadUrl = buildOriginlessUploadUrl(server);
    if (!uploadUrl) return { ok: false, server, reason: 'invalid upload url' };

    const content = `gupt-test-${Date.now()}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const fd = new FormData();
    fd.append('file', blob, 'gupt-test.txt');

    const res = await fetch(uploadUrl, { method: 'POST', body: fd, redirect: 'follow' });
    if (!res.ok) return { ok: false, server, status: res.status, reason: await res.text().catch(()=>'') };

    const json = await res.json().catch(() => null);
    const cid = json?.cid || json?.hash || json?.location || json?.url || '';
    return { ok: true, server, status: res.status, cid: cid || '', raw: json };
  } catch (err) {
    return { ok: false, server, reason: String(err) };
  }
}

async function findWorkingServers(targetCount = 2) {
  const servers = shuffle([...DEFAULT_BLOSSOM_SERVERS, ...DEFAULT_ORIGINLESS_SERVERS]);
  const results = [];

  for (const server of servers) {
    console.log('Trying', server);
    const r = await tryUploadToServer(server);
    console.log('Result:', r.ok ? 'OK' : 'FAIL', r.server, r.status || r.reason || '');
    results.push(r);
    if (results.filter((s) => s.ok).length >= targetCount) break;
  }

  return results;
}

(async () => {
  const results = await findWorkingServers(2);
  console.log('\nSummary:');
  for (const r of results) console.log(r);
  process.exit(0);
})();

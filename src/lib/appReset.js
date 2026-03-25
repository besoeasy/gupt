import { deleteCacheDatabase } from "@/lib/idb";

const LS_PRIVKEY = "gupt_privkey";

async function clearBrowserCaches() {
  if (typeof caches === "undefined") return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

async function clearSessionState() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.clear();
}

function resetLocalStorage() {
  if (typeof localStorage === "undefined") return;
  const privkey = localStorage.getItem(LS_PRIVKEY);
  localStorage.clear();
  if (privkey) {
    localStorage.setItem(LS_PRIVKEY, privkey);
  }
}

export async function resetPersistedStateForPwaUpdate() {
  await Promise.allSettled([deleteCacheDatabase(), clearBrowserCaches(), clearSessionState()]);
  resetLocalStorage();
}

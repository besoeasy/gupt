import { queryEvents, fetchEvent } from "../rabta/index.js";
import { readRelays } from "./selection.js";
import { recordOutcomes } from "./outcomes.js";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_BACKOFF_MS = 30000;

function adaptFilterToRabtaQuery(filter) {
  const query = {};
  if (filter.collection) query.collection = filter.collection;
  if (filter.labels) query.labels = Array.isArray(filter.labels) ? filter.labels : [filter.labels];
  if (filter.owner) query.owner = filter.owner;
  if (filter.limit) query.limit = Math.min(Math.max(1, Number(filter.limit) || 20), 100);
  if (filter.cursor) query.cursor = filter.cursor;

  if (!query.collection && filter["#t"] && filter["#t"].length) {
    const tag = filter["#t"][0];
    if (tag.startsWith("gupt_note")) query.collection = "gupt/vault/notes";
    else if (tag.startsWith("gupt_password")) query.collection = "gupt/vault/passwords";
    else if (tag.startsWith("gupt_bookmark")) query.collection = "gupt/vault/bookmarks";
    else if (tag.startsWith("gupt_feed")) query.collection = "gupt/feed";
    query.labels = filter["#t"];
  }

  if (!query.owner && filter.authors && filter.authors.length) {
    const author = filter.authors[0];
    query.owner = author.startsWith("ed25519:") ? author : `ed25519:${author}`;
  }

  if (!query.labels && filter["#p"] && filter["#p"].length) {
    const peer = filter["#p"][0];
    query.labels = [peer];
  }

  if (!query.collection && filter.kinds) {
    if (filter.kinds.includes(4)) query.collection = "gupt/chat/dm";
    else if (filter.kinds.includes(0)) query.collection = "gupt/profiles";
    else if (filter.kinds.includes(20004)) query.collection = "gupt/calls/signal";
    else if (filter.kinds.includes(21004)) query.collection = "gupt/chat/typing";
  }

  return query;
}

function adaptRabtaEventToAppShape(ev) {
  if (!ev) return null;
  if (!ev.pubkey && ev.owner) {
    ev.pubkey = ev.owner.replace(/^ed25519:/i, "");
  }
  if (!ev.content && ev.data) {
    if (typeof ev.data === "string") {
      ev.content = ev.data;
    } else if (ev.data.ciphertext && ev.data.nonce) {
      ev.content = `v1:${ev.data.nonce}:${ev.data.ciphertext}`;
    } else if (ev.data.content) {
      ev.content = ev.data.content;
    } else {
      ev.content = "";
    }
  }
  if (!ev.tags) {
    const tags = [];
    const labels = Array.isArray(ev.labels) ? ev.labels : [];
    let recipientPubkey = null;

    for (const l of labels) {
      if (typeof l === "string" && /^[0-9a-f]{64}$/i.test(l)) {
        recipientPubkey = l.toLowerCase();
        tags.push(["p", recipientPubkey]);
      } else {
        tags.push(["t", l]);
      }
    }

    if (ev.collection && !tags.some((t) => t[0] === "t" && t[1] === ev.collection)) {
      tags.push(["t", ev.collection]);
    }
    if (ev.expires_at) {
      tags.push(["expiration", String(ev.expires_at)]);
    }

    ev.tags = tags;
    if (recipientPubkey) {
      ev.recipientPubkey = recipientPubkey;
      ev.peerPubkey = recipientPubkey;
    }
  }
  if (ev.kind === undefined) {
    if (ev.data?.kind !== undefined) {
      ev.kind = ev.data.kind;
    } else if (ev.collection === "gupt/chat/dm") {
      ev.kind = 4;
    } else if (ev.collection === "gupt/profiles") {
      ev.kind = 0;
    } else if (ev.collection === "gupt/calls/signal") {
      ev.kind = 20004;
    } else if (ev.collection === "gupt/chat/typing") {
      ev.kind = 21004;
    } else if (ev.collection === "gupt/feed") {
      ev.kind = 1;
    }
  }
  return ev;
}

export async function query(filter, maxWait = 5000) {
  const relays = await readRelays();
  const list = Array.isArray(filter) ? filter : [filter];
  const allEvents = [];
  const seen = new Set();

  for (const f of list) {
    if (f.ids && f.ids.length === 1) {
      const single = await fetchEvent(f.ids[0], relays);
      if (single && !seen.has(single.id)) {
        seen.add(single.id);
        allEvents.push(adaptRabtaEventToAppShape(single));
      }
      continue;
    }

    const q = adaptFilterToRabtaQuery(f);
    const res = await queryEvents(q, relays, maxWait);
    for (const ev of res.events || []) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        allEvents.push(adaptRabtaEventToAppShape(ev));
      }
    }
  }

  recordOutcomes(
    "query",
    relays.map((r) => ({ relay: r, ok: true })),
  );
  return allEvents;
}

/**
 * Polling stands in for a relay subscription. Each poll schedules the next
 * only after it settles, so a slow or hung relay can never stack requests.
 */
export async function subscribe(relays, filters, observer, maxWait = 5000) {
  let stopped = false;
  let timer = null;
  let inFlight = false;
  let backoffMs = POLL_INTERVAL_MS;

  async function poll() {
    if (stopped || inFlight) return;
    inFlight = true;
    let delay = POLL_INTERVAL_MS;
    try {
      const events = await query(filters, maxWait);
      if (stopped) return;
      for (const ev of events) observer?.next?.(ev);
      backoffMs = POLL_INTERVAL_MS;
    } catch (err) {
      if (stopped) return;
      delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, POLL_MAX_BACKOFF_MS);
      observer?.error?.(err);
    } finally {
      inFlight = false;
      if (!stopped) timer = setTimeout(poll, delay);
    }
  }

  void poll();

  return {
    unsubscribe() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

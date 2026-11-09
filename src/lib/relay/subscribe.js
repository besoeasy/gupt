import { queryEvents, fetchEvent } from "@/lib/rabta";
import { readRelays, dedupeRelays } from "./selection.js";
import { recordOutcomes } from "./outcomes.js";

function adaptFilterToRabtaQuery(filter) {
  const query = {};
  if (filter.collection) query.collection = filter.collection;
  if (filter.labels) query.labels = Array.isArray(filter.labels) ? filter.labels : [filter.labels];
  if (filter.owner) query.owner = filter.owner;
  if (filter.limit) query.limit = filter.limit;
  if (filter.cursor) query.cursor = filter.cursor;

  if (!query.collection && filter["#t"] && filter["#t"].length) {
    const tag = filter["#t"][0];
    if (tag.startsWith("gupt_note")) query.collection = "vault/notes";
    else if (tag.startsWith("gupt_password")) query.collection = "vault/passwords";
    else if (tag.startsWith("gupt_bookmark")) query.collection = "vault/bookmarks";
    else if (tag.startsWith("gupt_feed")) query.collection = "feed";
    query.labels = filter["#t"];
  }

  if (!query.owner && filter.authors && filter.authors.length) {
    const author = filter.authors[0];
    query.owner = author.startsWith("ed25519:") ? author : `ed25519:${author}`;
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
    ev.content =
      typeof ev.data === "string" ? ev.data : ev.data.content || ev.data.ciphertext || "";
  }
  if (!ev.tags) {
    ev.tags = ev.data?.tags || [
      ...(ev.collection ? [["t", ev.collection]] : []),
      ...(ev.labels || []).map((l) => ["t", l]),
    ];
  }
  if (ev.kind === undefined && ev.data?.kind !== undefined) {
    ev.kind = ev.data.kind;
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
    const res = await queryEvents(q, relays);
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

export async function queryMany(filters, maxWait = 5000, extraRelays = []) {
  const baseRelays = await readRelays();
  const relays = dedupeRelays([...baseRelays, ...extraRelays]);
  const list = Array.isArray(filters) ? filters : [filters];
  const allEvents = [];
  const seen = new Set();

  for (const f of list) {
    const q = adaptFilterToRabtaQuery(f);
    const res = await queryEvents(q, relays);
    for (const ev of res.events || []) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        allEvents.push(adaptRabtaEventToAppShape(ev));
      }
    }
  }

  return allEvents;
}

export async function requestEventsFromRelays(relays, filters, maxWait = 5000) {
  const list = Array.isArray(filters) ? filters : [filters];
  const targets = dedupeRelays(relays);
  const allEvents = [];
  const seen = new Set();

  for (const f of list) {
    const q = adaptFilterToRabtaQuery(f);
    const res = await queryEvents(q, targets);
    for (const ev of res.events || []) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        allEvents.push(adaptRabtaEventToAppShape(ev));
      }
    }
  }

  return allEvents;
}

export async function subscribe(relays, filters, observer, maxWait = 5000) {
  let closedByClient = false;
  let active = true;

  async function poll() {
    if (closedByClient || !active) return;
    try {
      const events = await query(filters, maxWait);
      for (const ev of events) {
        observer?.next?.(ev);
      }
      observer?.complete?.();
    } catch (err) {
      observer?.error?.(err);
    }
  }

  void poll();
  const timer = setInterval(() => {
    if (closedByClient || !active) {
      clearInterval(timer);
      return;
    }
    void poll();
  }, 3000);

  return {
    unsubscribe() {
      closedByClient = true;
      active = false;
      clearInterval(timer);
    },
  };
}

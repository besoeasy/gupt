// Message propagation trace. Temporary diagnostics: every stage from compose
// to relay ack (and the arrival on the other side) prints one console line
// with the wall clock, the elapsed time since compose and the cost of that
// step, so a slow message can be read off the console instead of guessed at.
// Grep the console for "[gupt:send]" and follow one event id. Uses console.info
// because vite.config's esbuild.pure drops console.log/console.debug in the
// production build, which would erase these lines from a real deployment.
const PREFIX = "[gupt:send]";
const TRACE_MAX = 256;
const TRACE_TTL_MS = 10 * 60 * 1000;

/** eventId -> { at, lastAt }: compose time and the previous stage. */
const traces = new Map();

function keyOf(eventId) {
  return String(eventId || "").toLowerCase();
}

function clock(at) {
  try {
    return new Date(at).toISOString().slice(11, 23); // HH:MM:SS.sss
  } catch {
    return String(at);
  }
}

function prune(now) {
  for (const [key, trace] of traces) {
    if (traces.size <= TRACE_MAX && now - trace.lastAt <= TRACE_TTL_MS) break;
    if (now - trace.lastAt > TRACE_TTL_MS || traces.size > TRACE_MAX) traces.delete(key);
  }
}

/** Composed at `startedAt` (default now); later stages measure from here. */
export function startSendTrace(eventId, startedAt = Date.now()) {
  const key = keyOf(eventId);
  if (!key) return;
  prune(Date.now());
  const at = Number(startedAt) || Date.now();
  traces.set(key, { at, lastAt: at });
  console.info(`${PREFIX} ${clock(at)} start id=${key.slice(0, 8)} (compose)`);
}

/** One send stage: elapsed from compose and the cost since the last stage.
 * Only traces started by startSendTrace (i.e. real message sends) log, so
 * unrelated outbox ack traffic stays out of the console. */
export function logSendStage(eventId, stage, detail = null) {
  const key = keyOf(eventId);
  if (!key) return;
  const trace = traces.get(key);
  if (!trace) return;
  const now = Date.now();
  prune(now);
  const elapsed = now - trace.at;
  const delta = now - trace.lastAt;
  trace.lastAt = now;
  const line = `${PREFIX} ${clock(now)} ${stage} id=${key.slice(0, 8)} +${elapsed}ms (d=${delta}ms)`;
  if (detail) console.info(line, detail);
  else console.info(line);
}

/** Inbound copy: how old the message is by the sender's own timestamp. */
export function logSendArrival(eventId, sentAt, detail = null) {
  const key = keyOf(eventId);
  if (!key) return;
  const now = Date.now();
  const age = Math.max(0, now - (Number(sentAt) || now));
  const line = `${PREFIX} ${clock(now)} arrived id=${key.slice(0, 8)} age=${age}ms`;
  if (detail) console.info(line, detail);
  else console.info(line);
}

/** Retry from Message Info: continue the trace if it is still warm. */
export function hasSendTrace(eventId) {
  const key = keyOf(eventId);
  if (!key) return false;
  const trace = traces.get(key);
  return Boolean(trace && Date.now() - trace.lastAt <= TRACE_TTL_MS);
}

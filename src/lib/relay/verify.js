// A relay is not trusted because it answered a TCP connect: it has to prove it
// speaks Rabta v1 with the expected node identity. Invites and relay hints both
// use this one probe, so a node that passes for one is exactly a node that
// passes for the other.
export const RELAY_VERIFY_TIMEOUT_MS = 5_000;

const NODE_ID_RE = /^[0-9a-f]{64}$/;
const NODE_KEY_RE = /^ed25519:[0-9a-f]{64}$/;

const FAILED = Object.freeze({
  ok: false,
  reachable: false,
  nodeId: "",
  latencyMs: 0,
  mode: null,
  error: "unreachable",
});

/**
 * Fetch GET /api/v1/node once and report everything the caller needs to both
 * verify and describe the node. Never throws.
 *
 * @param {string} relay
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, reachable: boolean, nodeId: string, latencyMs: number, mode: string|null, error?: string }>}
 */
export async function probeRabtaNode(relay, { timeoutMs = RELAY_VERIFY_TIMEOUT_MS } = {}) {
  const base = String(relay || "")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return { ...FAILED, error: "not https" };

  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/node`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.max(0, Date.now() - started);
    if (!res.ok) {
      return { ...FAILED, reachable: true, latencyMs, error: `HTTP ${res.status}` };
    }

    const node = await res.json();
    const nodeId = String(node?.node_id || "")
      .trim()
      .toLowerCase();
    const ok =
      node?.algorithm === "ed25519" &&
      node?.api_version === "v1" &&
      NODE_ID_RE.test(nodeId) &&
      NODE_KEY_RE.test(
        String(node?.public_key || "")
          .trim()
          .toLowerCase(),
      );
    return {
      ok,
      reachable: true,
      latencyMs,
      nodeId: NODE_ID_RE.test(nodeId) ? nodeId : "",
      mode: node?.peers?.battery?.mode || null,
      error: ok ? undefined : "not a Rabta v1 node",
    };
  } catch (err) {
    return {
      ...FAILED,
      reachable: false,
      latencyMs: Math.max(0, Date.now() - started),
      error: err?.name === "TimeoutError" ? "timeout" : "unreachable",
    };
  }
}

/** True only for a reachable Rabta v1 node with a valid ed25519 identity. */
export async function verifyRabtaNode(relay, options = {}) {
  const probe = await probeRabtaNode(relay, options);
  return probe.ok;
}

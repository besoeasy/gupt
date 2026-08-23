import test from "node:test";
import assert from "node:assert/strict";
import { NEUTRAL_SCORE, relayScore, trafficSamples, updateOkEwma } from "../src/lib/relay/score.js";

test("untested relays score neutral and have no traffic samples", () => {
  const row = {};
  assert.equal(relayScore(row), NEUTRAL_SCORE);
  assert.equal(trafficSamples(row), 0);
});

test("connect-only rows do not rank", () => {
  const row = {
    connectOk: 12,
    connectFail: 1,
    connectOkEwma: 0.99,
    publishOk: 0,
    publishFail: 0,
    queryOk: 0,
    queryFail: 0,
  };
  assert.equal(relayScore(row), NEUTRAL_SCORE);
  assert.equal(trafficSamples(row), 0);
});

test("seeded EWMA without samples does not rank", () => {
  const row = {
    publishOkEwma: 0.99,
    queryOkEwma: 0.99,
    connectOkEwma: 0.99,
    publishOk: 0,
    publishFail: 0,
    queryOk: 0,
    queryFail: 0,
  };
  assert.equal(relayScore(row), NEUTRAL_SCORE);
  assert.equal(trafficSamples(row), 0);
});

test("write-only score uses publish EWMA, including a true zero", () => {
  assert.equal(
    relayScore({ publishOk: 0, publishFail: 4, publishOkEwma: 0, queryOk: 0, queryFail: 0 }),
    0,
  );
  assert.equal(
    relayScore({ publishOk: 3, publishFail: 0, publishOkEwma: 0.8, queryOk: 0, queryFail: 0 }),
    0.8,
  );
});

test("read-only score uses query EWMA", () => {
  assert.equal(
    relayScore({ publishOk: 0, publishFail: 0, queryOk: 2, queryFail: 1, queryOkEwma: 0.7 }),
    0.7,
  );
});

test("when both read and write have samples, score is the min", () => {
  assert.equal(
    relayScore({
      publishOk: 5,
      publishFail: 0,
      publishOkEwma: 0.9,
      queryOk: 1,
      queryFail: 4,
      queryOkEwma: 0.2,
    }),
    0.2,
  );
});

test("first success EWMA starts from neutral, not zero", () => {
  assert.equal(updateOkEwma(0, 0, true), 0.55);
});

test("first failure EWMA starts from neutral", () => {
  assert.equal(updateOkEwma(0, 0, false), 0.25);
});

test("failures weigh more than successes", () => {
  const afterOk = updateOkEwma(0.5, 1, true);
  const afterFail = updateOkEwma(0.5, 1, false);
  assert.ok(afterFail < afterOk);
  assert.equal(afterFail, 0.25);
  assert.equal(afterOk, 0.55);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeMessageFormat,
  hrefHost,
  messagePlainText,
  resolveMessageFormat,
} from "../src/lib/messageFormat.js";

function walk(nodes, visit) {
  for (const node of nodes || []) {
    visit(node);
    if (Array.isArray(node.children)) walk(node.children, visit);
    if (Array.isArray(node.items)) {
      for (const item of node.items) walk(item.children, visit);
    }
  }
}

function typesOf(nodes) {
  const types = [];
  walk(nodes, (node) => types.push(node.type));
  return types;
}

test("formats the core inline constructs", () => {
  const result = analyzeMessageFormat("**bold** *italic* ~~gone~~ `code`");
  const types = typesOf(result.nodes);
  assert.ok(types.includes("bold"));
  assert.ok(types.includes("italic"));
  assert.ok(types.includes("strike"));
  assert.ok(types.includes("code"));
  assert.equal(result.hasStrong, true);
});

test("auto-detect needs a strong construct", () => {
  assert.equal(resolveMessageFormat({ text: "*hugs*" }), null);
  assert.equal(resolveMessageFormat({ text: "2 * 3 * 4" }), null);
  assert.equal(resolveMessageFormat({ text: "foo*bar*baz" }), null);
  assert.equal(resolveMessageFormat({ text: "**hello**" }) !== null, true);
  assert.equal(resolveMessageFormat({ text: "*hugs* and **hello**" }) !== null, true);
});

test("template true forces rendering and false forces plain text", () => {
  const forced = resolveMessageFormat({ text: "*hugs*", template: true });
  assert.ok(forced);
  assert.ok(typesOf(forced.nodes).includes("italic"));

  assert.equal(resolveMessageFormat({ text: "**hello**", template: false }), null);
  assert.equal(messagePlainText({ text: "**hello**", template: false }), "**hello**");
});

test("malformed markup stays literal", () => {
  for (const text of ["**hello", "~gone", "`code", '{{button "x" nope}}']) {
    assert.equal(resolveMessageFormat({ text }), null);
    assert.equal(messagePlainText({ text }), text);
  }
});

test("links carry a normalized href and host", () => {
  const result = analyzeMessageFormat("[Docs](https://example.com/docs)");
  let link = null;
  walk(result.nodes, (node) => {
    if (node.type === "link") link = node;
  });
  assert.ok(link);
  assert.equal(link.href, "https://example.com/docs");
  assert.equal(link.host, "example.com");
  assert.equal(link.label, "Docs");
  assert.equal(result.hasStrong, true);
});

test("unsafe schemes never become links or buttons", () => {
  const link = analyzeMessageFormat("[x](javascript:alert(1))");
  assert.equal(typesOf(link.nodes).includes("link"), false);

  const button = analyzeMessageFormat('{{button "Open" javascript:alert(1)}}');
  assert.equal(typesOf(button.nodes).includes("button"), false);
});

test("buttons render label and host", () => {
  const result = analyzeMessageFormat('{{button "Open dashboard" https://example.com/app}}');
  let button = null;
  walk(result.nodes, (node) => {
    if (node.type === "button") button = node;
  });
  assert.ok(button);
  assert.equal(button.label, "Open dashboard");
  assert.equal(button.host, "example.com");
  assert.equal(result.hasStrong, true);
});

test("lists, quotes and code fences are block constructs", () => {
  const result = analyzeMessageFormat("- one\n- two\n\n> quote\n\n```js\nconst x = 1;\n```");
  const types = typesOf(result.nodes);
  assert.ok(types.includes("list"));
  assert.ok(types.includes("quote"));
  assert.ok(types.includes("codeblock"));
  assert.equal(result.hasStrong, true);
});

test("ordered lists preserve items", () => {
  const result = analyzeMessageFormat("1. one\n2. two");
  const list = result.nodes.find((node) => node.type === "list");
  assert.ok(list);
  assert.equal(list.ordered, true);
  assert.equal(list.items.length, 2);
});

test("autolinks do not opt a message into template rendering", () => {
  const result = analyzeMessageFormat("see https://example.com/path, ok");
  let autolink = null;
  walk(result.nodes, (node) => {
    if (node.type === "autolink") autolink = node;
  });
  assert.ok(autolink);
  assert.equal(autolink.label, "https://example.com/path");
  assert.equal(result.hasStrong, false);
  assert.equal(resolveMessageFormat({ text: "see https://example.com/path, ok" }), null);
});

test("code spans protect their contents", () => {
  const result = analyzeMessageFormat("`a**b**c`");
  assert.deepEqual(
    typesOf(result.nodes).filter((type) => type !== "paragraph"),
    ["code"],
  );
  assert.equal(result.hasStrong, true);
});

test("escapes produce literal characters", () => {
  assert.equal(messagePlainText({ text: "\\*not italic\\* **bold**" }), "*not italic* bold");
  assert.equal(messagePlainText({ text: "\\`not code\\` **bold**" }), "`not code` bold");
});

test("plain text strips markup and can keep URLs", () => {
  assert.equal(messagePlainText({ text: "**hi**\n\n- one\n- two" }), "hi - one - two");
  assert.equal(
    messagePlainText({ text: "[Docs](https://example.com/docs)" }, { includeUrls: true }),
    "Docs (https://example.com/docs)",
  );
  assert.equal(
    messagePlainText({ text: '{{button "Open" https://example.com}}' }, { includeUrls: true }),
    "Open (https://example.com/)",
  );
});

test("line breaks survive non-compact plain text", () => {
  assert.equal(messagePlainText({ text: "**one**\ntwo" }, { compact: false }), "one\ntwo");
});

test("mailto hosts are readable", () => {
  assert.equal(hrefHost("mailto:hi@example.com"), "hi@example.com");
});

test("the length cap falls back to plain text", () => {
  const text = `**${"a".repeat(8000)}**`;
  assert.equal(resolveMessageFormat({ text }), null);
  assert.equal(resolveMessageFormat({ text, template: true }), null);
  assert.equal(messagePlainText({ text, template: true }), text);
});

test("sender HTML is only ever text", () => {
  const text = "<script>alert(1)</script> **ok**";
  const result = analyzeMessageFormat(text);
  let sawText = false;
  walk(result.nodes, (node) => {
    if (node.type === "text" && node.value.includes("<script>")) sawText = true;
    assert.notEqual(node.type, "html");
    assert.notEqual(node.type, "raw");
  });
  assert.equal(sawText, true);
});

test("template true with no syntax still resolves to a text tree", () => {
  const result = resolveMessageFormat({ text: "plain words", template: true });
  assert.ok(result);
  assert.equal(messagePlainText({ text: "plain words", template: true }), "plain words");
});

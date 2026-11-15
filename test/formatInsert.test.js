import test from "node:test";
import assert from "node:assert/strict";

import { applyFormatAction } from "../src/lib/formatInsert.js";

function apply(text, action, from = text.length, to = from) {
  return applyFormatAction(text, from, to, action);
}

test("wraps a selection and keeps it selected", () => {
  const result = apply("hello world", "bold", 6, 11);
  assert.equal(result.text, "hello **world**");
  assert.equal(result.text.slice(result.selectionStart, result.selectionEnd), "world");
});

test("inserts a placeholder when nothing is selected", () => {
  const result = apply("", "italic");
  assert.equal(result.text, "*italic text*");
  assert.equal(result.text.slice(result.selectionStart, result.selectionEnd), "italic text");
});

test("prefixes every line of the block", () => {
  const text = "one\ntwo\nthree";
  const result = apply(text, "list", 0, text.length);
  assert.equal(result.text, "- one\n- two\n- three");
});

test("quote prefixes the current line only", () => {
  const text = "before\nafter";
  const result = apply(text, "quote", 8, 8);
  assert.equal(result.text, "before\n> after");
});

test("link insertion selects the example URL", () => {
  const result = apply("docs", "link", 0, 4);
  assert.equal(result.text, "[docs](https://example.com)");
  assert.equal(
    result.text.slice(result.selectionStart, result.selectionEnd),
    "https://example.com",
  );
});

test("button insertion escapes quotes in the label", () => {
  const result = apply('say "hi"', "button", 0, 9);
  assert.equal(result.text, "{{button \"say 'hi'\" https://example.com}}");
});

test("code block insertion wraps in fences", () => {
  const result = apply("const x = 1;", "codeblock", 0, 12);
  assert.equal(result.text, "```\nconst x = 1;\n```");
});

test("clamps a reversed or out-of-range selection", () => {
  const text = "abc";
  assert.equal(applyFormatAction(text, 9, 2, "strike").text, "abc~~strikethrough~~");
  assert.equal(applyFormatAction(text, -5, 99, "code").text, "`abc`");
});

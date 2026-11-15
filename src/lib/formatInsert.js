const WRAP_ACTIONS = {
  bold: { open: "**", close: "**", placeholder: "bold text" },
  italic: { open: "*", close: "*", placeholder: "italic text" },
  strike: { open: "~~", close: "~~", placeholder: "strikethrough" },
  code: { open: "`", close: "`", placeholder: "code" },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapSelection(value, from, to, open, close, placeholder) {
  const selected = value.slice(from, to);
  const inner = selected || placeholder;
  const next = value.slice(0, from) + open + inner + close + value.slice(to);
  const start = from + open.length;
  return { text: next, selectionStart: start, selectionEnd: start + inner.length };
}

function prefixLines(value, from, to, prefix) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", to);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const nextBlock = lines.map((line) => `${prefix}${line}`).join("\n");
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  return {
    text: next,
    selectionStart: from + prefix.length,
    selectionEnd: to + prefix.length * lines.length,
  };
}

function insertLink(value, from, to) {
  const selected = (value.slice(from, to) || "link text").replace(/[\]\n]/g, " ");
  const url = "https://example.com";
  const prefix = `[${selected}](`;
  const next = value.slice(0, from) + prefix + url + ")" + value.slice(to);
  const start = from + prefix.length;
  return { text: next, selectionStart: start, selectionEnd: start + url.length };
}

function insertButton(value, from, to) {
  const selected = (value.slice(from, to) || "Button label").replace(/["\n]/g, "'");
  const url = "https://example.com";
  const prefix = `{{button "${selected}" `;
  const next = value.slice(0, from) + prefix + url + "}}" + value.slice(to);
  const start = from + prefix.length;
  return { text: next, selectionStart: start, selectionEnd: start + url.length };
}

export function applyFormatAction(text, selectionStart, selectionEnd, action) {
  const value = String(text ?? "");
  const from = clamp(Number(selectionStart) || 0, 0, value.length);
  const to = clamp(Number(selectionEnd) || from, from, value.length);

  const wrap = WRAP_ACTIONS[action];
  if (wrap) {
    return wrapSelection(value, from, to, wrap.open, wrap.close, wrap.placeholder);
  }

  switch (action) {
    case "codeblock":
      return wrapSelection(value, from, to, "```\n", "\n```", "code");
    case "list":
      return prefixLines(value, from, to, "- ");
    case "quote":
      return prefixLines(value, from, to, "> ");
    case "link":
      return insertLink(value, from, to);
    case "button":
      return insertButton(value, from, to);
    default:
      return { text: value, selectionStart: from, selectionEnd: to };
  }
}

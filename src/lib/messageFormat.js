/**
 * A deliberately small message template grammar.
 *
 * The sender's text stays the source of truth. Parsing happens on the reading
 * device and returns an AST that is rendered as Vue nodes, so sender content
 * never becomes HTML. Plain messages are left alone unless they contain at
 * least one strong construct; see `resolveMessageFormat`.
 */

export const MAX_FORMAT_LENGTH = 8000;

const MAX_NODES = 1200;
const MAX_DEPTH = 3;

const OPEN_BEFORE_RE = /[\s\(\[\{'"“”«».,;:!?\/\\-]/;
const CLOSE_AFTER_RE = /[\s\)\]\}'"“”».,;:!?\/\\-]/;
const ESCAPABLE = new Set(["\\", "`", "*", "~", "[", "]", "{", "}", "(", ")"]);
const HINT_RE = /(\*\*|~~|`|\[[^\]\n]{1,300}\]\(|^[-]\s|^\d+[.)]\s|^>\s|\{\{button\s)/m;

const BUTTON_RE =
  /^\{\{button\s+"([^"\n]{1,80})"\s+(https?:\/\/[^\s"{}<>]+|mailto:[^\s"{}<>]+)\s*\}\}/i;
const LINK_RE = /^\[([^\]\n]{1,300})\]\(((?:https?:\/\/|mailto:)[^\s()<>]+)\)/i;
const AUTOLINK_RE = /^https?:\/\/[^\s<>"'*~]+/i;

const STRONG_TYPES = new Set([
  "bold",
  "strike",
  "code",
  "link",
  "button",
  "list",
  "quote",
  "codeblock",
]);

function isEscaped(source, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

function canOpen(source, index, length) {
  if (index > 0 && !OPEN_BEFORE_RE.test(source[index - 1])) return false;
  const next = source[index + length];
  return Boolean(next) && !/\s/.test(next);
}

function canClose(source, index, length) {
  const before = source[index - 1];
  if (!before || /\s/.test(before)) return false;
  const after = source[index + length];
  return after === undefined || CLOSE_AFTER_RE.test(after);
}

function findRawClosing(source, delimiter, from) {
  let index = from;
  while (index <= source.length - delimiter.length) {
    const found = source.indexOf(delimiter, index);
    if (found === -1) return -1;
    if (!isEscaped(source, found)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

function findClosing(source, delimiter, from) {
  let index = from;
  while (index <= source.length - delimiter.length) {
    const found = source.indexOf(delimiter, index);
    if (found === -1) return -1;
    if (!isEscaped(source, found) && canClose(source, found, delimiter.length)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

function findSingleStarClosing(source, from) {
  for (let i = from; i < source.length; i++) {
    if (source[i] !== "*" || isEscaped(source, i)) continue;
    if (source[i - 1] === "*" || source[i + 1] === "*") continue;
    if (canClose(source, i, 1)) return i;
  }
  return -1;
}

export function hrefHost(href) {
  try {
    const url = new URL(href);
    if (url.protocol === "mailto:") return url.pathname.split("?")[0];
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeHref(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) return null;
    if (url.protocol === "mailto:" && !url.pathname) return null;
    return url.href;
  } catch {
    return null;
  }
}

function trimAutolink(url) {
  let value = url;
  while (/[.,;:!?'"]$/.test(value)) value = value.slice(0, -1);
  while (
    value.endsWith(")") &&
    (value.match(/\(/g) || []).length < (value.match(/\)/g) || []).length
  ) {
    value = value.slice(0, -1);
  }
  while (
    value.endsWith("]") &&
    (value.match(/\[/g) || []).length < (value.match(/\]/g) || []).length
  ) {
    value = value.slice(0, -1);
  }
  return value;
}

function parseInline(source, depth = 0) {
  if (depth >= MAX_DEPTH) return [{ type: "text", value: source }];

  const nodes = [];
  let text = "";
  let i = 0;

  const flush = () => {
    if (!text) return;
    nodes.push({ type: "text", value: text });
    text = "";
  };

  while (i < source.length) {
    const char = source[i];

    if (char === "\\" && i + 1 < source.length && ESCAPABLE.has(source[i + 1])) {
      text += source[i + 1];
      i += 2;
      continue;
    }

    if (char === "\n") {
      flush();
      nodes.push({ type: "break" });
      i++;
      continue;
    }

    if (char === "`") {
      const close = findRawClosing(source, "`", i + 1);
      if (close !== -1) {
        const value = source.slice(i + 1, close);
        if (value && !value.includes("\n")) {
          flush();
          nodes.push({ type: "code", value });
          i = close + 1;
          continue;
        }
      }
    }

    if (char === "{") {
      const match = BUTTON_RE.exec(source.slice(i));
      if (match) {
        const href = normalizeHref(match[2]);
        if (href) {
          flush();
          nodes.push({ type: "button", label: match[1], href, host: hrefHost(href) });
          i += match[0].length;
          continue;
        }
      }
    }

    if (char === "[") {
      const match = LINK_RE.exec(source.slice(i));
      if (match) {
        const href = normalizeHref(match[2]);
        if (href) {
          flush();
          nodes.push({
            type: "link",
            href,
            host: hrefHost(href),
            label: match[1],
            children: [{ type: "text", value: match[1] }],
          });
          i += match[0].length;
          continue;
        }
      }
    }

    if (char === "*" && source[i + 1] === "*" && canOpen(source, i, 2)) {
      const close = findClosing(source, "**", i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        nodes.push({ type: "bold", children: parseInline(source.slice(i + 2, close), depth + 1) });
        i = close + 2;
        continue;
      }
    }

    if (char === "*" && source[i + 1] !== "*" && source[i - 1] !== "*" && canOpen(source, i, 1)) {
      const close = findSingleStarClosing(source, i + 1);
      if (close !== -1 && close > i + 1) {
        flush();
        nodes.push({
          type: "italic",
          children: parseInline(source.slice(i + 1, close), depth + 1),
        });
        i = close + 1;
        continue;
      }
    }

    if (char === "~" && source[i + 1] === "~" && canOpen(source, i, 2)) {
      const close = findClosing(source, "~~", i + 2);
      if (close !== -1 && close > i + 2) {
        flush();
        nodes.push({
          type: "strike",
          children: parseInline(source.slice(i + 2, close), depth + 1),
        });
        i = close + 2;
        continue;
      }
    }

    if ((char === "h" || char === "H") && (i === 0 || !/[A-Za-z0-9_@]/.test(source[i - 1]))) {
      const match = AUTOLINK_RE.exec(source.slice(i));
      if (match) {
        const raw = trimAutolink(match[0]);
        const href = normalizeHref(raw);
        if (href) {
          flush();
          nodes.push({ type: "autolink", href, label: raw });
          i += raw.length;
          continue;
        }
      }
    }

    text += char;
    i++;
  }

  flush();
  return nodes;
}

function isListItem(line) {
  return /^[-]\s+/.test(line);
}

function isOrderedItem(line) {
  return /^\d+[.)]\s+/.test(line);
}

function listItemText(line) {
  return line.replace(/^([-]|\d+[.)])\s+/, "");
}

function hasClosingFence(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (/^```\s*$/.test(lines[i])) return true;
  }
  return false;
}

function parseBlocks(source) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = /^```([\w+-]*)\s*$/.exec(line);
    if (fence) {
      const code = [];
      let cursor = i + 1;
      let closed = false;
      for (; cursor < lines.length; cursor++) {
        if (/^```\s*$/.test(lines[cursor])) {
          closed = true;
          break;
        }
        code.push(lines[cursor]);
      }
      if (closed) {
        blocks.push({ type: "codeblock", value: code.join("\n"), lang: fence[1] || "" });
        i = cursor + 1;
        continue;
      }
      blocks.push({ type: "paragraph", children: parseInline(line) });
      i++;
      continue;
    }

    if (isListItem(line) || isOrderedItem(line)) {
      const ordered = isOrderedItem(line);
      const items = [];
      let cursor = i;
      while (cursor < lines.length) {
        const current = lines[cursor];
        if (ordered ? !isOrderedItem(current) : !isListItem(current)) break;
        items.push({ children: parseInline(listItemText(current)) });
        cursor++;
      }
      blocks.push({ type: "list", ordered, items });
      i = cursor;
      continue;
    }

    if (/^>\s+/.test(line)) {
      const quoteLines = [];
      let cursor = i;
      while (cursor < lines.length && /^>\s+/.test(lines[cursor])) {
        quoteLines.push(lines[cursor].replace(/^>\s+/, ""));
        cursor++;
      }
      blocks.push({ type: "quote", children: parseInline(quoteLines.join("\n")) });
      i = cursor;
      continue;
    }

    const paragraph = [];
    let cursor = i;
    while (cursor < lines.length) {
      const current = lines[cursor];
      if (!current.trim()) break;
      if (/^```/.test(current) && hasClosingFence(lines, cursor + 1)) break;
      if (isListItem(current) || isOrderedItem(current) || /^>\s+/.test(current)) break;
      paragraph.push(current);
      cursor++;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
    i = cursor;
  }

  return blocks;
}

function countNodes(nodes) {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (Array.isArray(node.children)) count += countNodes(node.children);
    if (Array.isArray(node.items)) {
      for (const item of node.items) count += 1 + countNodes(item.children || []);
    }
  }
  return count;
}

function nodeHasStrong(node) {
  if (STRONG_TYPES.has(node.type)) return true;
  if (Array.isArray(node.children)) return node.children.some(nodeHasStrong);
  return false;
}

export function hasFormattingHint(text) {
  return HINT_RE.test(String(text ?? ""));
}

export function analyzeMessageFormat(source) {
  const text = String(source ?? "");
  if (!text.trim()) return { nodes: [], hasStrong: false };
  if (text.length > MAX_FORMAT_LENGTH) {
    return { nodes: [{ type: "text", value: text }], hasStrong: false };
  }

  let nodes;
  try {
    nodes = parseBlocks(text);
  } catch {
    return { nodes: [{ type: "text", value: text }], hasStrong: false };
  }

  if (countNodes(nodes) > MAX_NODES) {
    return { nodes: [{ type: "text", value: text }], hasStrong: false };
  }

  return { nodes, hasStrong: nodes.some(nodeHasStrong) };
}

/**
 * Returns the parsed template for a message, or null when the message should
 * render as plain text.
 *
 * template === true  force template rendering
 * template === false force plain rendering
 * absent/null        auto-detect: only strong constructs opt in
 */
export function resolveMessageFormat(message) {
  if (message?.template === false) return null;
  const text = String(message?.text ?? "");
  if (!text.trim() || text.length > MAX_FORMAT_LENGTH) return null;

  const forced = message?.template === true;
  if (!forced && !hasFormattingHint(text)) return null;

  const analysis = analyzeMessageFormat(text);
  if (!forced && !analysis.hasStrong) return null;
  return analysis;
}

export function plainTextFromNodes(nodes, { includeUrls = false } = {}) {
  let out = "";

  for (const node of nodes || []) {
    switch (node.type) {
      case "text":
        out += node.value || "";
        break;
      case "bold":
      case "italic":
      case "strike":
        out += plainTextFromNodes(node.children, { includeUrls });
        break;
      case "code":
        out += node.value || "";
        break;
      case "link":
      case "button": {
        const label = node.label || plainTextFromNodes(node.children, { includeUrls });
        const suffix = includeUrls && node.href && node.href !== label ? ` (${node.href})` : "";
        out += `${label}${suffix}`;
        break;
      }
      case "autolink":
        out += node.label || node.href || "";
        break;
      case "break":
        out += "\n";
        break;
      case "paragraph":
      case "quote":
        out += `${plainTextFromNodes(node.children, { includeUrls })}\n`;
        break;
      case "list": {
        const items = (node.items || []).map((item, index) => {
          const prefix = node.ordered ? `${index + 1}. ` : "- ";
          return `${prefix}${plainTextFromNodes(item.children, { includeUrls })}`;
        });
        out += `${items.join("\n")}\n`;
        break;
      }
      case "codeblock":
        out += `${node.value || ""}\n`;
        break;
      default:
        if (Array.isArray(node.children)) out += plainTextFromNodes(node.children, { includeUrls });
        break;
    }
  }

  return out;
}

function collapseWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function messagePlainText(message, { includeUrls = false, compact = true } = {}) {
  const raw = String(message?.text ?? "");
  const resolved = resolveMessageFormat(message);
  if (!resolved) return compact ? collapseWhitespace(raw) : raw;
  const plain = plainTextFromNodes(resolved.nodes, { includeUrls });
  return compact ? collapseWhitespace(plain) : plain.trim();
}

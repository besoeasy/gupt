<script>
import { defineComponent, h } from "vue";
import { ExternalLink } from "@/icons";

function renderNodes(nodes) {
  return (nodes || []).map((node, index) => renderNode(node, index)).filter((node) => node != null);
}

function renderChildren(node) {
  return Array.isArray(node.children) ? renderNodes(node.children) : [];
}

function renderNode(node, key) {
  if (!node) return null;

  switch (node.type) {
    case "text":
      return node.value || "";
    case "break":
      return h("br", { key });
    case "paragraph":
      return h("p", { key, class: "msg-body__p" }, renderChildren(node));
    case "bold":
      return h("strong", { key, class: "msg-body__strong" }, renderChildren(node));
    case "italic":
      return h("em", { key }, renderChildren(node));
    case "strike":
      return h("s", { key }, renderChildren(node));
    case "code":
      return h(
        "code",
        {
          key,
          class:
            "msg-body__code",
        },
        node.value || "",
      );
    case "autolink":
      return h(
        "a",
        {
          key,
          href: node.href,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          class:
            "msg-body__link",
        },
        node.label || node.href,
      );
    case "link": {
      const showHost = Boolean(node.host) && node.host !== node.label;
      return h(
        "a",
        {
          key,
          href: node.href,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          title: node.href,
          class:
            "msg-body__link",
        },
        [
          ...renderChildren(node),
          showHost
            ? h(
                "span",
                { key: "host", class: "msg-body__host" },
                ` (${node.host})`,
              )
            : null,
        ],
      );
    }
    case "button":
      return h(
        "a",
        {
          key,
          href: node.href,
          target: "_blank",
          rel: "noopener noreferrer nofollow",
          title: node.href,
          class:
            "msg-body__card",
        },
        [
          h(
            "span",
            { key: "label", class: "msg-body__card-label" },
            [
              node.label,
              h(ExternalLink, { class: "msg-body__card-icon", strokeWidth: 1.8 }),
            ],
          ),
          h(
            "span",
            { key: "host", class: "msg-body__card-host" },
            node.host || node.href,
          ),
        ],
      );
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const listClass = node.ordered
        ? "msg-body__list msg-body__list--ordered"
        : "msg-body__list";
      return h(
        tag,
        { key, class: listClass },
        (node.items || []).map((item, index) =>
          h("li", { key: index, class: "msg-body__item" }, renderNodes(item.children)),
        ),
      );
    }
    case "quote":
      return h(
        "blockquote",
        { key, class: "msg-body__quote" },
        renderChildren(node),
      );
    case "codeblock":
      return h(
        "pre",
        {
          key,
          class:
            "msg-body__pre",
        },
        h("code", { class: "msg-body__pre-code" }, node.value || ""),
      );
    default:
      return Array.isArray(node.children) ? renderChildren(node) : null;
  }
}

export default defineComponent({
  name: "ChatMessageBody",
  props: {
    nodes: { type: Array, default: () => [] },
  },
  setup(props) {
    return () =>
      h(
        "div",
        {
          class:
            "msg-body",
        },
        renderNodes(props.nodes),
      );
  },
});
</script>

<style>
/* Ledger pass: the message body is prose, code and one link card. */

.msg-body {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.msg-body > :not(:last-child) {
  margin-block-end: 6px;
}

.msg-body__p {
  margin: 0;
  max-width: 100%;
  min-width: 0;
}

.msg-body__strong {
  font-weight: 600;
}

.msg-body__link {
  color: inherit;
  text-decoration-line: underline;
  text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: break-word;
  transition: text-decoration-color var(--app-dur-fast) var(--app-ease-standard);
}

.msg-body__host {
  font-family: var(--font-mono);
  font-size: 0.78em;
  color: var(--app-muted-2);
}

.msg-body__code {
  padding: 1px 4px;
  border: 1px solid var(--app-border);
  border-radius: 3px;
  background: var(--app-surface-inset);
  font-family: var(--font-mono);
  font-size: 0.86em;
  color: var(--app-text-soft);
  box-shadow: none;
}

/* ---- Link card ---- */

.msg-body__card {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  max-width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-soft);
  font-size: 10.5px;
  font-weight: 500;
  text-align: left;
  text-decoration: none;
  color: var(--app-text);
  transition:
    background-color var(--app-dur-fast) var(--app-ease-standard),
    border-color var(--app-dur-fast) var(--app-ease-standard);
}

.msg-body__card-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  overflow-wrap: break-word;
}

.msg-body__card-icon {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  opacity: 0.7;
}

.msg-body__card-host {
  max-width: 100%;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 8.5px;
  font-weight: 400;
  color: var(--app-muted-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Lists ---- */

.msg-body__list {
  margin: 0;
  padding-left: 18px;
  list-style-type: disc;
}

.msg-body__list--ordered {
  list-style-type: decimal;
}

.msg-body__item {
  min-width: 0;
  padding-left: 2px;
}

.msg-body__item + .msg-body__item {
  margin-top: 2px;
}

/* ---- Quote & code block ---- */

.msg-body__quote {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--app-border-strong);
  color: var(--app-muted);
}

.msg-body__pre {
  max-width: 100%;
  margin: 0;
  padding: 10px;
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-inset);
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--app-text-soft);
  tab-size: 2;
}

.msg-body__pre-code {
  white-space: pre;
}

@media (hover: hover) {
  .msg-body__link:hover {
    text-decoration-color: currentColor;
  }

  .msg-body__card:hover {
    border-color: var(--app-border-strong);
    background: var(--app-surface);
  }
}

@media (prefers-reduced-motion: reduce) {
  .msg-body__link,
  .msg-body__card {
    transition: none;
  }
}
</style>

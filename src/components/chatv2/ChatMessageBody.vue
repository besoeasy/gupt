<script>
import { defineComponent, h } from "vue";
import { ExternalLink } from "@lucide/vue";

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
      return h("p", { key, class: "chat-message-body__variant-1" }, renderChildren(node));
    case "bold":
      return h("strong", { key, class: "chat-message-body__variant-2" }, renderChildren(node));
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
            "chat-message-body__variant-3",
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
            "chat-message-body__variant-4",
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
            "chat-message-body__variant-5",
        },
        [
          ...renderChildren(node),
          showHost
            ? h(
                "span",
                { key: "host", class: "chat-message-body__muted" },
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
            "chat-message-body__variant-7",
        },
        [
          h(
            "span",
            { key: "label", class: "chat-message-body__variant-8" },
            [
              node.label,
              h(ExternalLink, { class: "chat-message-body__variant-9", strokeWidth: 1.8 }),
            ],
          ),
          h(
            "span",
            { key: "host", class: "chat-message-body__muted-2" },
            node.host || node.href,
          ),
        ],
      );
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const listClass = node.ordered
        ? "chat-message-body__variant-11"
        : "chat-message-body__variant-12";
      return h(
        tag,
        { key, class: listClass },
        (node.items || []).map((item, index) =>
          h("li", { key: index, class: "chat-message-body__variant-13" }, renderNodes(item.children)),
        ),
      );
    }
    case "quote":
      return h(
        "blockquote",
        { key, class: "chat-message-body__muted-3" },
        renderChildren(node),
      );
    case "codeblock":
      return h(
        "pre",
        {
          key,
          class:
            "chat-message-body__variant-15",
        },
        h("code", { class: "chat-message-body__variant-16" }, node.value || ""),
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
            "chat-message-body chat-message-body__variant-17",
        },
        renderNodes(props.nodes),
      );
  },
});
</script>

<style>
@layer base, gupt-components;

/* Light theme adjustments */

@layer gupt-components {
@supports (color:color-mix(in lab,red,red)) {
.chat-message-body__variant-3 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-body__variant-15 {
  background-color: color-mix(in oklab,var(--ui-zinc-950) 70%,transparent);
}
}

@supports (color:color-mix(in lab,red,red)) {
.chat-message-body__variant-3 {
  --ring-color: color-mix(in oklab, var(--ui-zinc-800) 70%, transparent);
}
}

@media (hover:hover) {
.chat-message-body__variant-7:hover {
  border-color: var(--ui-zinc-600);
}
}

@media (hover:hover) {
.chat-message-body__variant-7:hover {
  background-color: var(--ui-zinc-800);
}
}

@media (hover:hover) {
.chat-message-body__variant-4:hover {
  -webkit-text-decoration-color: var(--ui-zinc-300);
  text-decoration-color: var(--ui-zinc-300);
}
}

@media (hover:hover) {
.chat-message-body__variant-5:hover {
  -webkit-text-decoration-color: var(--ui-zinc-300);
  text-decoration-color: var(--ui-zinc-300);
}
}

@layer gupt-components {
.chat-message-body {
  overflow-wrap: anywhere;
}
.chat-message-body__variant-7 {
  display: inline-flex;
}
.chat-message-body__variant-8 {
  display: inline-flex;
}
.chat-message-body__variant-9 {
  height: calc(var(--spacing) * 3);
}
.chat-message-body__variant-9 {
  width: calc(var(--spacing) * 3);
}
.chat-message-body__variant-1 {
  max-width: 100%;
}
.chat-message-body__variant-7 {
  max-width: 100%;
}
.chat-message-body__variant-8 {
  max-width: 100%;
}
.chat-message-body__muted-2 {
  max-width: 100%;
}
.chat-message-body__variant-15 {
  max-width: 100%;
}
.chat-message-body__variant-17 {
  max-width: 100%;
}
.chat-message-body__variant-1 {
  min-width: 0;
}
.chat-message-body__variant-13 {
  min-width: 0;
}
.chat-message-body__variant-17 {
  min-width: 0;
}
.chat-message-body__variant-9 {
  flex-shrink: 0;
}
.chat-message-body__variant-11 {
  list-style-type: decimal;
}
.chat-message-body__variant-12 {
  list-style-type: disc;
}
.chat-message-body__variant-7 {
  flex-direction: column;
}
.chat-message-body__variant-8 {
  align-items: center;
}
.chat-message-body__variant-7 {
  align-items: flex-start;
}
.chat-message-body__variant-7 {
  gap: calc(var(--spacing) * .5);
}
.chat-message-body__variant-8 {
  gap: calc(var(--spacing) * 1.5);
}
:where(.chat-message-body__variant-11>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.chat-message-body__variant-12>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * .5) * 0);
  margin-block-end: calc(calc(var(--spacing) * .5) * calc(1 - 0));
}
:where(.chat-message-body__variant-17>:not(:last-child)) {
  --space-y-reverse: 0;
  margin-block-start: calc(calc(var(--spacing) * 1.5) * 0);
  margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - 0));
}
.chat-message-body__muted-2 {
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow: hidden;
}
.chat-message-body__variant-15 {
  overflow-x: auto;
}
.chat-message-body__variant-3 {
  border-radius: .25rem;
}
.chat-message-body__variant-7 {
  border-radius: var(--radius-lg);
}
.chat-message-body__variant-15 {
  border-radius: var(--radius-lg);
}
.chat-message-body__variant-7 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-body__variant-15 {
  border-style: var(--border-style,solid);
  border-width: 1px;
}
.chat-message-body__muted-3 {
  border-left-style: var(--border-style,solid);
  border-left-width: 2px;
}
.chat-message-body__muted-3 {
  border-color: var(--ui-zinc-600);
}
.chat-message-body__variant-7 {
  border-color: var(--ui-zinc-700);
}
.chat-message-body__variant-15 {
  border-color: var(--ui-zinc-800);
}
.chat-message-body__variant-7 {
  background-color: var(--ui-zinc-900);
}
.chat-message-body__variant-3 {
  background-color: var(--ui-zinc-950);
}
.chat-message-body__variant-15 {
  background-color: var(--ui-zinc-950);
}
.chat-message-body__variant-15 {
  padding: calc(var(--spacing) * 2.5);
}
.chat-message-body__variant-3 {
  padding-inline: var(--spacing);
}
.chat-message-body__variant-7 {
  padding-inline: calc(var(--spacing) * 3);
}
.chat-message-body__variant-3 {
  padding-block: calc(var(--spacing) * .5);
}
.chat-message-body__variant-7 {
  padding-block: calc(var(--spacing) * 1.5);
}
.chat-message-body__variant-13 {
  padding-left: calc(var(--spacing) * .5);
}
.chat-message-body__muted-3 {
  padding-left: calc(var(--spacing) * 2.5);
}
.chat-message-body__variant-11 {
  padding-left: calc(var(--spacing) * 5);
}
.chat-message-body__variant-12 {
  padding-left: calc(var(--spacing) * 5);
}
.chat-message-body__variant-7 {
  text-align: left;
}
.chat-message-body__variant-3 {
  font-family: var(--font-mono);
}
.chat-message-body__muted {
  font-family: var(--font-mono);
}
.chat-message-body__muted-2 {
  font-family: var(--font-mono);
}
.chat-message-body__variant-15 {
  font-family: var(--font-mono);
}
.chat-message-body__variant-7 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-body__variant-15 {
  font-size: var(--text-xs);
  line-height: var(--leading,var(--text-xs--line-height));
}
.chat-message-body__muted {
  font-size: .78em;
}
.chat-message-body__variant-3 {
  font-size: .86em;
}
.chat-message-body__muted-2 {
  font-size: 10px;
}
.chat-message-body__variant-15 {
  --leading: var(--leading-relaxed);
  line-height: var(--leading-relaxed);
}
.chat-message-body__variant-7 {
  --font-weight: var(--font-weight-medium);
  font-weight: var(--font-weight-medium);
}
.chat-message-body__variant-2 {
  --font-weight: var(--font-weight-semibold);
  font-weight: var(--font-weight-semibold);
}
.chat-message-body__variant-5 {
  overflow-wrap: break-word;
}
.chat-message-body__variant-8 {
  overflow-wrap: break-word;
}
.chat-message-body__variant-17 {
  overflow-wrap: break-word;
}
.chat-message-body__variant-4 {
  word-break: break-all;
}
.chat-message-body__variant-16 {
  white-space: pre;
}
.chat-message-body__variant-7 {
  color: var(--ui-zinc-100);
}
.chat-message-body__variant-3 {
  color: var(--ui-zinc-200);
}
.chat-message-body__variant-15 {
  color: var(--ui-zinc-200);
}
.chat-message-body__muted-3 {
  color: var(--ui-zinc-400);
}
.chat-message-body__muted {
  color: var(--ui-zinc-500);
}
.chat-message-body__muted-2 {
  color: var(--ui-zinc-500);
}
.chat-message-body__variant-7 {
  text-decoration-line: none;
}
.chat-message-body__variant-4 {
  text-decoration-line: underline;
}
.chat-message-body__variant-5 {
  text-decoration-line: underline;
}
.chat-message-body__variant-4 {
  -webkit-text-decoration-color: var(--ui-zinc-500);
  text-decoration-color: var(--ui-zinc-500);
}
.chat-message-body__variant-5 {
  -webkit-text-decoration-color: var(--ui-zinc-500);
  text-decoration-color: var(--ui-zinc-500);
}
.chat-message-body__variant-4 {
  text-underline-offset: 2px;
}
.chat-message-body__variant-5 {
  text-underline-offset: 2px;
}
.chat-message-body__variant-9 {
  opacity: .7;
}
.chat-message-body__variant-3 {
  --ring-shadow: var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor);
  box-shadow: var(--inset-shadow,0 0 #0000), var(--inset-ring-shadow,0 0 #0000), var(--ring-offset-shadow,0 0 #0000), var(--ring-inset,) 0 0 0 calc(1px + var(--ring-offset-width,0px)) var(--ring-color,currentcolor), var(--shadow,0 0 #0000);
}
.chat-message-body__variant-3 {
  --ring-color: var(--ui-zinc-800);
}
.chat-message-body__variant-7 {
  transition-property: color,background-color,border-color,outline-color,text-decoration-color,fill,stroke;
  transition-timing-function: var(--ease,var(--default-transition-timing-function));
  transition-duration: var(--duration,var(--default-transition-duration));
}
[data-theme="light"] .chat-message-body__muted-3 {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-body__muted {
  color: var(--app-muted);
}
[data-theme="light"] .chat-message-body__muted-2 {
  color: var(--app-muted);
}
}
}
</style>

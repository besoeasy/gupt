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
      return h("p", { key, class: "min-w-0 max-w-full" }, renderChildren(node));
    case "bold":
      return h("strong", { key, class: "font-semibold" }, renderChildren(node));
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
            "rounded bg-zinc-950/70 px-1 py-0.5 font-mono text-[0.86em] text-zinc-200 ring-1 ring-zinc-800/70",
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
            "break-all underline underline-offset-2 decoration-zinc-500 hover:decoration-zinc-300",
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
            "underline underline-offset-2 decoration-zinc-500 hover:decoration-zinc-300 break-words",
        },
        [
          ...renderChildren(node),
          showHost
            ? h(
                "span",
                { key: "host", class: "font-mono text-[0.78em] text-zinc-500" },
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
            "inline-flex max-w-full flex-col items-start gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-left text-xs font-medium text-zinc-100 no-underline transition-colors hover:border-zinc-600 hover:bg-zinc-800",
        },
        [
          h(
            "span",
            { key: "label", class: "inline-flex max-w-full items-center gap-1.5 break-words" },
            [
              node.label,
              h(ExternalLink, { class: "h-3 w-3 shrink-0 opacity-70", strokeWidth: 1.8 }),
            ],
          ),
          h(
            "span",
            { key: "host", class: "max-w-full truncate font-mono text-[10px] text-zinc-500" },
            node.host || node.href,
          ),
        ],
      );
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const listClass = node.ordered
        ? "list-decimal pl-5 space-y-0.5"
        : "list-disc pl-5 space-y-0.5";
      return h(
        tag,
        { key, class: listClass },
        (node.items || []).map((item, index) =>
          h("li", { key: index, class: "min-w-0 pl-0.5" }, renderNodes(item.children)),
        ),
      );
    }
    case "quote":
      return h(
        "blockquote",
        { key, class: "border-l-2 border-zinc-600 pl-2.5 text-zinc-400" },
        renderChildren(node),
      );
    case "codeblock":
      return h(
        "pre",
        {
          key,
          class:
            "max-w-full overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-2.5 font-mono text-xs leading-relaxed text-zinc-200",
        },
        h("code", { class: "whitespace-pre" }, node.value || ""),
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
            "chat-message-body min-w-0 max-w-full overflow-wrap-anywhere break-words space-y-1.5",
        },
        renderNodes(props.nodes),
      );
  },
});
</script>

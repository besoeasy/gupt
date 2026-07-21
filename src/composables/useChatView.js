import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { messenger } from "@/stores/messenger";

export function parseConversationId(paramStr) {
  if (!paramStr) return { type: null, id: "", raw: "" };
  const str = String(paramStr);
  if (str.startsWith("dm:")) {
    return { type: "dm", id: str.slice(3), raw: str };
  }
  if (str.startsWith("group:")) {
    return { type: "group", id: str.slice(6), raw: str };
  }
  // Fallback heuristic if prefix is missing: check groupMeta
  if (messenger.groupMeta[str]) {
    return { type: "group", id: str, raw: `group:${str}` };
  }
  return { type: "dm", id: str, raw: `dm:${str}` };
}

export function formatConversationId(type, id) {
  if (!id) return "";
  return type === "group" ? `group:${id}` : `dm:${id}`;
}

export function useChatView() {
  const route = useRoute();
  const router = useRouter();

  const isDesktop = ref(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);

  function handleResize() {
    isDesktop.value = window.innerWidth >= 1024;
  }

  onMounted(() => {
    window.addEventListener("resize", handleResize);
  });

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
  });

  const rawParam = computed(() => String(route.params.conversationId || ""));

  const parsed = computed(() => parseConversationId(rawParam.value));

  const activeConversationId = computed(() => parsed.value.raw);
  const activeType = computed(() => parsed.value.type);
  const activeRawId = computed(() => parsed.value.id);

  function selectConversation(conv) {
    if (!conv) return;
    const type = conv.isGroup ? "group" : "dm";
    const id = conv.roomId || conv.id;
    const formatted = formatConversationId(type, id);
    if (route.params.conversationId !== formatted) {
      router.push(`/chat/${formatted}`);
    }
  }

  function closeConversation() {
    router.push("/chat");
  }

  return {
    isDesktop,
    rawParam,
    activeConversationId,
    activeType,
    activeRawId,
    selectConversation,
    closeConversation,
    parseConversationId,
    formatConversationId,
  };
}

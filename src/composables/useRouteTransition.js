import { ref } from "vue";

export const routeTransitionName = ref("route-fade");
export const routeTransitionMode = ref("out-in");

const CHAT_ROOTS = ["/", "/room/", "/groups/"];

function isChatPath(path) {
  return path === "/" || path.startsWith("/room/") || path.startsWith("/groups/");
}

function chatDepth(path) {
  if (path === "/") return 0;
  if (path.startsWith("/room/") || path.startsWith("/groups/")) return 1;
  return -1;
}

/**
 * Pick a direction-aware transition name for route changes.
 * Chat navigation uses push/pop slides; settings and other pages keep fade.
 */
export function resolveRouteTransition(to, from) {
  const fromDepth = chatDepth(from.path);
  const toDepth = chatDepth(to.path);

  if (isChatPath(from.path) && isChatPath(to.path) && from.path !== to.path) {
    if (toDepth !== fromDepth) {
      routeTransitionName.value = toDepth > fromDepth ? "route-push" : "route-pop";
      routeTransitionMode.value = undefined;
    } else {
      // Same depth (room→room, group→group): simple crossfade, no slide
      routeTransitionName.value = "route-fade";
      routeTransitionMode.value = "out-in";
    }
    return;
  }

  if (!isChatPath(from.path) && isChatPath(to.path)) {
    routeTransitionName.value = "route-push";
    routeTransitionMode.value = undefined;
    return;
  }

  if (isChatPath(from.path) && !isChatPath(to.path)) {
    routeTransitionName.value = "route-pop";
    routeTransitionMode.value = undefined;
    return;
  }

  routeTransitionName.value = "route-fade";
  routeTransitionMode.value = "out-in";
}

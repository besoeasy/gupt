import { ref } from "vue";

export const routeTransitionName = ref("route-fade");
export const routeTransitionMode = ref("out-in");

function routeTier(path) {
  if (!path || path === "/") return 0;

  if (
    path.startsWith("/room/") ||
    path.startsWith("/groups/") ||
    path.startsWith("/call/") ||
    path.startsWith("/profile/") ||
    path.startsWith("/invite/") ||
    path === "/new/start" ||
    path === "/new/share" ||
    path === "/share/view"
  ) {
    return 2;
  }

  return 1;
}

function isAppShellPath(path) {
  return routeTier(path) >= 0;
}

export function resolveRouteTransition(to, from) {
  const fromPath = from?.path || "";
  const toPath = to?.path || "";

  if (!fromPath || fromPath === toPath) {
    routeTransitionName.value = "route-fade";
    routeTransitionMode.value = "out-in";
    return;
  }

  const fromTier = routeTier(fromPath);
  const toTier = routeTier(toPath);

  if (fromTier !== toTier) {
    routeTransitionName.value = toTier > fromTier ? "route-push" : "route-pop";
    routeTransitionMode.value = undefined;
    return;
  }

  if (isAppShellPath(fromPath) && isAppShellPath(toPath)) {
    routeTransitionName.value = "route-fade";
    routeTransitionMode.value = "out-in";
    return;
  }

  routeTransitionName.value = "route-fade";
  routeTransitionMode.value = "out-in";
}

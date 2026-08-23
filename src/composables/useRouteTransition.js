import { ref } from "vue";

export const routeTransitionName = ref("route-fade");
export const routeTransitionMode = ref("out-in");

function routeTier(route) {
  if (!route?.path || route.path === "/") return 0;
  return Number(route.meta?.tier) || 1;
}

function isAppShellPath(route) {
  return routeTier(route) >= 0;
}

export function resolveRouteTransition(to, from) {
  const fromPath = from?.path || "";
  const toPath = to?.path || "";

  if (!fromPath || fromPath === toPath) {
    routeTransitionName.value = "route-fade";
    routeTransitionMode.value = "out-in";
    return;
  }

  const fromTier = routeTier(from);
  const toTier = routeTier(to);

  if (fromTier !== toTier) {
    routeTransitionName.value = toTier > fromTier ? "route-push" : "route-pop";
    routeTransitionMode.value = undefined;
    return;
  }

  if (isAppShellPath(from) && isAppShellPath(to)) {
    routeTransitionName.value = "route-fade";
    routeTransitionMode.value = "out-in";
    return;
  }

  routeTransitionName.value = "route-fade";
  routeTransitionMode.value = "out-in";
}

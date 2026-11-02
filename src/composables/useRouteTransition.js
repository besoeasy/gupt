import { ref } from "vue";

export const routeTransitionName = ref("route-fade");
export const routeTransitionMode = ref("out-in");

/**
 * Stack depth of a route. Routes without an explicit `meta.tier` sit at the
 * app's root level, so only explicit detail surfaces (composer, profile,
 * call, an open conversation) get a push/pop slide.
 */
function routeDepth(route) {
  if (!route?.path || route.path === "/") return 0;
  return Number(route.meta?.tier) || 1;
}

function useFade() {
  routeTransitionName.value = "route-fade";
  routeTransitionMode.value = "out-in";
}

export function resolveRouteTransition(to, from) {
  const fromPath = from?.path || "";
  const toPath = to?.path || "";

  if (!fromPath || fromPath === toPath) {
    useFade();
    return;
  }

  const fromDepth = routeDepth(from);
  const toDepth = routeDepth(to);

  if (fromDepth !== toDepth) {
    routeTransitionName.value = toDepth > fromDepth ? "route-push" : "route-pop";
    // Both panels have to stay mounted while they slide past each other.
    routeTransitionMode.value = undefined;
    return;
  }

  useFade();
}

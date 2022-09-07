import { liveQuery } from "dexie";
import { onBeforeUnmount, ref, watch } from "vue";

export function useDexieLiveQuery(queryFn, options = {}) {
  const { deps = [], initialValue = null } = options;

  const data = ref(initialValue);
  const loading = ref(true);
  const error = ref("");
  let subscription = null;
  let stopWatch = null;

  function stopSubscription() {
    subscription?.unsubscribe?.();
    subscription = null;
  }

  function refresh() {
    stopSubscription();
    // Only show loading spinner when there is no data yet — avoids flashing
    // the loading state on every liveQuery re-run triggered by a DB write.
    loading.value = data.value === initialValue;
    error.value = "";

    subscription = liveQuery(() => queryFn()).subscribe({
      next(value) {
        data.value = value;
        loading.value = false;
      },
      error(err) {
        error.value = err instanceof Error ? err.message : String(err);
        loading.value = false;
      },
    });
  }

  if (deps.length) {
    stopWatch = watch(deps, refresh, { immediate: true });
  } else {
    refresh();
  }

  onBeforeUnmount(() => {
    stopWatch?.();
    stopSubscription();
  });

  return {
    data,
    loading,
    error,
    refresh,
  };
}

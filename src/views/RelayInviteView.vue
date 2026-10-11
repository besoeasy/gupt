<script setup>
// Never rendered: `relayInviteGuard` (src/lib/relayInvite.js) redirects out of
// this route before it can mount. The component only has to exist — vue-router
// skips `beforeEnter` on a component-less route record.
</script>

<template>
  <div />
</template>

import { createRouter, createWebHashHistory } from "vue-router";
import { resolveRouteTransition } from "@/composables/useRouteTransition";
import { relayInviteGuard } from "@/lib/relayInvite";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: "/chat" },
    {
      path: "/chat",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat", skeleton: "inbox" },
    },
    {
      path: "/chat/new",
      component: () => import("@/views/ChatNewView.vue"),
      meta: { title: "Start chat", tier: 2, skeleton: "detail" },
    },
    {
      path: "/chat/:conversationId",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat", skeleton: "conversation" },
    },
    {
      path: "/messages",
      redirect: "/chat",
    },
    {
      path: "/add/:pubkey/:relays?",
      // Seeds relays then redirects to the profile; the guard always returns a
      // redirect so nothing here is ever shown.
      //
      // `component` must be present: vue-router skips `beforeEnter` entirely on
      // a component-less record, which would render an empty route and never
      // redirect. Do not add a `redirect` field either — that is resolved
      // before `beforeEnter` and would skip the seeding side effect.
      component: () => import("@/views/RelayInviteView.vue"),
      beforeEnter: relayInviteGuard,
      meta: { title: "Relay invite", tier: 2, skeleton: "full" },
    },
    {
      path: "/me",
      component: () => import("@/views/MeView.vue"),
      meta: { title: "Me", skeleton: "detail" },
    },
    {
      path: "/switch",
      component: () => import("@/views/SwitchChooserView.vue"),
      meta: { title: "Switch account", skeleton: "detail" },
    },
    {
      path: "/switch/kdf",
      component: () => import("@/views/SwitchAccountView.vue"),
      meta: { title: "Memory identity", skeleton: "detail" },
    },
    {
      path: "/switch/key",
      component: () => import("@/views/SwitchKeyView.vue"),
      meta: { title: "Paste secret", skeleton: "detail" },
    },
    {
      path: "/switch-account",
      redirect: "/switch",
    },
    {
      path: "/room/:roomId",
      redirect: (to) => `/chat/dm:${to.params.roomId}`,
    },
    {
      path: "/groups/:groupId",
      redirect: (to) => `/chat/group:${to.params.groupId}`,
    },
    {
      path: "/call/:peerPubkey",
      component: () => import("@/views/CallView.vue"),
      meta: { title: "Call", tier: 2, skeleton: "full" },
    },
    {
      path: "/search",
      redirect: "/",
    },
    {
      path: "/settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "Settings", skeleton: "list" },
    },
    {
      path: "/servers",
      redirect: "/settings",
    },
    {
      path: "/settings/servers",
      redirect: "/settings",
    },
    {
      path: "/notifications",
      component: () => import("@/views/NotificationsView.vue"),
      meta: { title: "Notifications", skeleton: "list" },
    },
    {
      path: "/stats",
      component: () => import("@/views/StatsView.vue"),
      meta: { title: "Stats", skeleton: "list" },
    },
    {
      path: "/cache",
      component: () => import("@/views/CacheAnalyticsView.vue"),
      meta: { title: "Cache Analytics", skeleton: "list" },
    },
    {
      path: "/settings/cache",
      redirect: "/cache",
    },
    {
      path: "/profile/:pubkey",
      component: () => import("@/views/ProfileView.vue"),
      meta: { title: "Profile", tier: 2, skeleton: "detail" },
    },
    {
      path: "/donate",
      component: () => import("@/views/DonationTimerView.vue"),
      meta: { title: "Support gupt", skeleton: "detail" },
    },
    {
      path: "/share",
      component: () => import("@/views/ShareView.vue"),
      meta: { title: "Share Note", skeleton: "detail" },
    },
    {
      path: "/share/view",
      component: () => import("@/views/ShareReceiveView.vue"),
      meta: { title: "View Shared Note", tier: 2, skeleton: "detail" },
    },
    {
      path: "/bookmarks",
      component: () => import("@/views/BookmarksView.vue"),
      meta: { title: "Bookmarks", skeleton: "list" },
    },
    {
      path: "/bookmarks/new",
      component: () => import("@/views/BookmarkDetailView.vue"),
      meta: { title: "New Bookmark", skeleton: "detail" },
    },
    {
      path: "/bookmarks/:id",
      component: () => import("@/views/BookmarkDetailView.vue"),
      meta: { title: "Bookmark Details", skeleton: "detail" },
    },
    {
      path: "/passwords",
      component: () => import("@/views/PasswordsView.vue"),
      meta: { title: "Passwords", skeleton: "list" },
    },
    {
      path: "/passwords/new",
      component: () => import("@/views/PasswordDetailView.vue"),
      meta: { title: "New Password", skeleton: "detail" },
    },
    {
      path: "/passwords/:id",
      component: () => import("@/views/PasswordDetailView.vue"),
      meta: { title: "Password Details", skeleton: "detail" },
    },
    {
      path: "/notes",
      component: () => import("@/views/NotesView.vue"),
      meta: { title: "Notes", skeleton: "list" },
    },
    {
      path: "/notes/new",
      component: () => import("@/views/NoteDetailView.vue"),
      meta: { title: "New Note", skeleton: "detail" },
    },
    {
      path: "/notes/:id",
      component: () => import("@/views/NoteDetailView.vue"),
      meta: { title: "Note Details", skeleton: "detail" },
    },
    {
      path: "/feed",
      component: () => import("@/views/FeedView.vue"),
      meta: { title: "Feed", skeleton: "list" },
    },
    {
      path: "/feed/new",
      component: () => import("@/views/FeedDetailView.vue"),
      meta: { title: "New Post", skeleton: "detail" },
    },
    {
      path: "/feed/:id",
      component: () => import("@/views/FeedDetailView.vue"),
      meta: { title: "Post", skeleton: "detail" },
    },
    {
      path: "/hotlink/bookmark",
      component: () => import("@/views/HotlinkBookmarkView.vue"),
      meta: { title: "Add bookmark", skeleton: "detail" },
    },
    {
      path: "/queue",
      component: () => import("@/views/QueueView.vue"),
      meta: { title: "Pending actions", skeleton: "list" },
    },
    {
      path: "/donate-timer",
      redirect: "/donate",
    },
  ],
});

router.beforeEach((to, from) => {
  resolveRouteTransition(to, from);
});

export default router;

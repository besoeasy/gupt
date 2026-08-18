import { createRouter, createWebHashHistory } from "vue-router";
import { resolveRouteTransition } from "@/composables/useRouteTransition";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: "/chat" },
    {
      path: "/chat",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat" },
    },
    {
      path: "/chat/new",
      component: () => import("@/views/ChatNewView.vue"),
      meta: { title: "Start chat", tier: 2 },
    },
    {
      path: "/chat/:conversationId",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat" },
    },
    {
      path: "/messages",
      redirect: "/chat",
    },
    {
      path: "/invite/new",
      component: () => import("@/views/InviteNewView.vue"),
      meta: { title: "Share invite", tier: 2 },
    },
    {
      path: "/invite/scan",
      component: () => import("@/views/InviteScanView.vue"),
      meta: { title: "Scan QR", tier: 2 },
    },
    {
      path: "/invite/:code",
      component: () => import("@/views/InviteView.vue"),
      meta: { title: "Invite", tier: 2 },
    },
    {
      path: "/me",
      component: () => import("@/views/MeView.vue"),
      meta: { title: "Me" },
    },
    {
      path: "/switch",
      component: () => import("@/views/SwitchChooserView.vue"),
      meta: { title: "Switch account" },
    },
    {
      path: "/switch/kdf",
      component: () => import("@/views/SwitchAccountView.vue"),
      meta: { title: "Memory identity" },
    },
    {
      path: "/switch/key",
      component: () => import("@/views/SwitchKeyView.vue"),
      meta: { title: "Paste secret" },
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
      meta: { title: "Call", tier: 2 },
    },
    {
      path: "/search",
      redirect: "/",
    },
    {
      path: "/settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "Settings" },
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
      meta: { title: "Notifications" },
    },
    {
      path: "/stats",
      component: () => import("@/views/StatsView.vue"),
      meta: { title: "Stats" },
    },
    {
      path: "/cache",
      component: () => import("@/views/CacheAnalyticsView.vue"),
      meta: { title: "Cache Analytics" },
    },
    {
      path: "/settings/cache",
      redirect: "/cache",
    },
    {
      path: "/profile/:pubkey",
      component: () => import("@/views/ProfileView.vue"),
      meta: { title: "Profile", tier: 2 },
    },
    {
      path: "/donate",
      component: () => import("@/views/DonationTimerView.vue"),
      meta: { title: "Support gupt" },
    },
    {
      path: "/share",
      component: () => import("@/views/ShareView.vue"),
      meta: { title: "Share Note" },
    },
    {
      path: "/share/view",
      component: () => import("@/views/ShareReceiveView.vue"),
      meta: { title: "View Shared Note", tier: 2 },
    },
    {
      path: "/bookmarks",
      component: () => import("@/views/BookmarksView.vue"),
      meta: { title: "Bookmarks" },
    },
    {
      path: "/bookmarks/new",
      component: () => import("@/views/BookmarkDetailView.vue"),
      meta: { title: "New Bookmark" },
    },
    {
      path: "/bookmarks/:id",
      component: () => import("@/views/BookmarkDetailView.vue"),
      meta: { title: "Bookmark Details" },
    },
    {
      path: "/passwords",
      component: () => import("@/views/PasswordsView.vue"),
      meta: { title: "Passwords" },
    },
    {
      path: "/passwords/new",
      component: () => import("@/views/PasswordDetailView.vue"),
      meta: { title: "New Password" },
    },
    {
      path: "/passwords/:id",
      component: () => import("@/views/PasswordDetailView.vue"),
      meta: { title: "Password Details" },
    },
    {
      path: "/notes",
      component: () => import("@/views/NotesView.vue"),
      meta: { title: "Notes" },
    },
    {
      path: "/notes/new",
      component: () => import("@/views/NoteDetailView.vue"),
      meta: { title: "New Note" },
    },
    {
      path: "/notes/:id",
      component: () => import("@/views/NoteDetailView.vue"),
      meta: { title: "Note Details" },
    },
    {
      path: "/hotlink/bookmark",
      component: () => import("@/views/HotlinkBookmarkView.vue"),
      meta: { title: "Add bookmark" },
    },
    {
      path: "/queue",
      component: () => import("@/views/QueueView.vue"),
      meta: { title: "Pending actions" },
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

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
      path: "/chat/:conversationId",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat" },
    },
    {
      path: "/messages",
      redirect: "/chat",
    },
    {
      path: "/new",
      component: () => import("@/views/NewChatView.vue"),
      meta: { title: "New chat" },
    },
    {
      path: "/new/start",
      component: () => import("@/views/NewChatStartView.vue"),
      meta: { title: "Start chat" },
    },
    {
      path: "/new/share",
      component: () => import("@/views/NewChatShareView.vue"),
      meta: { title: "Share invite" },
    },
    {
      path: "/me",
      component: () => import("@/views/MeView.vue"),
      meta: { title: "Me" },
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
      meta: { title: "Call" },
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
      path: "/profile/:pubkey",
      component: () => import("@/views/ProfileView.vue"),
      meta: { title: "Profile" },
    },
    {
      path: "/invite/:code",
      component: () => import("@/views/InviteView.vue"),
      meta: { title: "Invite" },
    },
    {
      path: "/donate",
      redirect: "/donate-timer",
    },
    {
      path: "/share",
      component: () => import("@/views/ShareView.vue"),
      meta: { title: "Share Note" },
    },
    {
      path: "/share/view",
      component: () => import("@/views/ShareReceiveView.vue"),
      meta: { title: "View Shared Note" },
    },
    {
      path: "/vault",
      component: () => import("@/views/VaultView.vue"),
      meta: { title: "Vault" },
    },
    {
      path: "/queue",
      component: () => import("@/views/QueueView.vue"),
      meta: { title: "Pending actions" },
    },
    {
      path: "/donate-timer",
      component: () => import("@/views/DonationTimerView.vue"),
      meta: { title: "Support gupt" },
    },
  ],
});

const APP_LAUNCH_TIME = Date.now();
const DONATION_TIMER_ACTIVATION_DELAY_SEC = 200;

router.beforeEach((to, from) => {
  resolveRouteTransition(to, from);

  const TIMER_ROUTES = ["/me", "/settings", "/vault", "/share"];
  const sessionAgeSec = Math.floor((Date.now() - APP_LAUNCH_TIME) / 1000);

  if (
    TIMER_ROUTES.includes(to.path) &&
    to.query.bypassTimer !== "1" &&
    sessionAgeSec >= DONATION_TIMER_ACTIVATION_DELAY_SEC
  ) {
    return {
      path: "/donate-timer",
      query: { target: to.fullPath },
    };
  }
});

export default router;

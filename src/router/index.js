import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { resolveRouteTransition } from "@/composables/useRouteTransition";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: HomeView, meta: { title: "Dashboard" } },
    {
      path: "/messages",
      component: () => import("@/views/MessagesPlaceholderView.vue"),
      meta: { title: "Messages" },
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
      path: "/groups/:groupId",
      component: () => import("@/views/GroupRoomView.vue"),
      meta: { title: "Group" },
    },
    {
      path: "/room/:roomId",
      component: () => import("@/views/RoomView.vue"),
      meta: { title: "Room" },
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
      component: () => import("@/views/DonateView.vue"),
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
      meta: { title: "View Shared Note" },
    },
    {
      path: "/vault",
      component: () => import("@/views/VaultView.vue"),
      meta: { title: "Vault" },
    },
  ],
});

router.afterEach((to, from) => {
  resolveRouteTransition(to, from);
});

export default router;

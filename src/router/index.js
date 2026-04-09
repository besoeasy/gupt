import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: HomeView, meta: { title: "Gupt" } },
    {
      path: "/about",
      component: () => import("@/views/AboutView.vue"),
      meta: { title: "About" },
    },
    {
      path: "/identity",
      component: () => import("@/views/IdentityView.vue"),
      meta: { title: "Identity" },
    },
    {
      path: "/keys",
      component: () => import("@/views/KeysView.vue"),
      meta: { title: "Keys" },
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
      path: "/search",
      redirect: "/",
    },
    {
      path: "/settings",
      component: () => import("@/views/SettingsView.vue"),
      meta: { title: "Settings" },
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
  ],
});

export default router;

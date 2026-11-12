import { createRouter, createWebHashHistory } from "vue-router";
import { resolveRouteTransition } from "@/composables/useRouteTransition";
import { rememberPendingRoute, takePendingRoute } from "@/lib/entryPoint";
import { hasStoredAccount } from "@/stores/identity";

const WELCOME_PATHS = ["/welcome", "/welcome/secret", "/welcome/file"];

function isWelcomePath(path) {
  return WELCOME_PATHS.includes(path);
}

/** No account in this browser? Send them to /welcome instead of the app. */
function homeForAccount() {
  return hasStoredAccount() ? "/chat" : "/welcome";
}

/**
 * Where to land once an account exists. Honours the `?next=` bounce the guard
 * added, but only for internal paths — anything else falls back to the entry
 * point remembered when login was forced, then to /.
 */
export function resumeTarget(query) {
  const next = String(query?.next || "");
  if (next.startsWith("/") && !next.startsWith("//") && !isWelcomePath(next)) return next;
  return takePendingRoute() || "/";
}

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", redirect: homeForAccount },
    {
      path: "/chat",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat", skeleton: "inbox" },
    },
    {
      path: "/inin",
      component: () => import("@/views/InviteView.vue"),
      meta: { title: "Invite", skeleton: "detail" },
    },
    {
      path: "/chat/new",
      component: () => import("@/views/ChatNewView.vue"),
      meta: { title: "Start chat", tier: 2, skeleton: "detail" },
    },
    {
      // Legacy deep links published before the route moved — keep them working.
      path: "/new/start",
      redirect: (to) => ({ path: "/chat/new", query: to.query }),
    },
    {
      path: "/chat/:conversationId",
      component: () => import("@/views/ChatView.vue"),
      meta: { title: "Chat", tier: 2, skeleton: "conversation" },
    },
    {
      path: "/messages",
      redirect: "/chat",
    },
    {
      path: "/me",
      component: () => import("@/views/MeView.vue"),
      meta: { title: "Me", skeleton: "detail" },
    },
    {
      path: "/welcome",
      component: () => import("@/views/WelcomeView.vue"),
      meta: { title: "Welcome", skeleton: "detail", public: true, welcomeOnly: true },
    },
    {
      path: "/welcome/secret",
      component: () => import("@/views/SecretIdentityView.vue"),
      meta: { title: "Paste secret", skeleton: "detail", public: true, welcomeOnly: true },
    },
    {
      path: "/welcome/file",
      component: () => import("@/views/SecretFileView.vue"),
      meta: { title: "Secret file", skeleton: "detail", public: true, welcomeOnly: true },
    },
    {
      path: "/welcome/file",
      component: () => import("@/views/SecretFileView.vue"),
      meta: { title: "Secret file", skeleton: "detail", public: true, welcomeOnly: true },
    },
    {
      // Legacy deep links published before the file option merged into /welcome/file.
      path: "/welcome/file-pin",
      redirect: "/welcome/file",
    },
    {
      path: "/account",
      redirect: "/welcome",
    },
    {
      path: "/switch",
      redirect: "/welcome",
    },
    {
      path: "/welcome/key",
      redirect: "/welcome/secret",
    },
    {
      path: "/switch/key",
      redirect: "/welcome/secret",
    },
    {
      path: "/switch-account",
      redirect: "/welcome",
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
      path: "/integrations",
      component: () => import("@/views/IntegrationsView.vue"),
      meta: { title: "Integrations", skeleton: "list" },
    },
    {
      path: "/integrations/backup",
      component: () => import("@/views/BackupIntegrationView.vue"),
      meta: { title: "Local backup node", skeleton: "detail" },
    },
    {
      path: "/integrations/gupt-mark",
      component: () => import("@/views/GuptMarkIntegrationView.vue"),
      meta: { title: "gupt-mark", skeleton: "detail" },
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
      // Public metadata is readable by anyone; only the "Message" action on it
      // needs an account, and that button is disabled without one.
      meta: { title: "Profile", tier: 2, skeleton: "detail", public: true },
    },
    {
      path: "/donate",
      component: () => import("@/views/DonationTimerView.vue"),
      meta: { title: "Support gupt", skeleton: "detail", public: true },
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
      // Public on purpose: gupt-mark lands here in a fresh tab that has no
      // session. The view queues the link for the next signed-in visit.
      meta: { title: "Add bookmark", skeleton: "detail", public: true },
    },
    {
      path: "/donate-timer",
      redirect: "/donate",
    },
  ],
});

router.beforeEach((to, from) => {
  resolveRouteTransition(to, from);

  const account = hasStoredAccount();

  // One account per browser. Anything that signs with your key needs it, so
  // gate on `meta.public` rather than a denylist: a new route defaults to
  // gated, which is the safe failure mode for an identity app. Public routes
  // are the ones that work with no account — public profiles, relay invites,
  // /welcome and donations.
  if (!account && !to.meta.public) {
    // The destination may not survive the query chain (the welcome chooser's
    // method links drop ?next=), so it is remembered here for the post-login
    // retract.
    rememberPendingRoute(to.fullPath);
    return { path: "/welcome", query: to.fullPath === "/" ? {} : { next: to.fullPath } };
  }

  // /welcome is onboarding. Once an account exists there is nothing to
  // onboard, so it gets out of the way; /account is the switcher for that
  // case and renders the same view.
  if (account && to.meta.welcomeOnly) return "/chat";
});

export default router;

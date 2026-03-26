<script setup>
import { MessageCircle, RefreshCw, Users, Inbox } from "lucide-vue-next";
import RoboAvatar from "@/components/RoboAvatar.vue";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

defineProps({
  activeTab: { type: String, default: "messages" },
  searchActive: { type: Boolean, default: false },
  messages: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
  requests: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "update:activeTab",
  "open-room",
  "open-group",
  "open-profile",
  "refresh-all",
]);
</script>

<template>
  <section v-if="!searchActive">
    <Tabs
      v-if="messages.length || groups.length || requests.length"
      :model-value="activeTab"
      @update:model-value="emit('update:activeTab', $event)"
      class="w-full"
    >
      <div class="flex items-center justify-between mb-4 px-1 mt-2 gap-4">
        <TabsList class="w-full flex h-12">
          <TabsTrigger
            v-if="messages.length"
            value="messages"
            class="flex-1 text-xs sm:text-sm h-10"
          >
            <MessageCircle class="w-4 h-4 mr-1.5" />
            <span class="hidden sm:inline">Messages</span>
            <Badge variant="secondary" class="ml-1.5 h-5 px-1.5 text-[10px]">{{
              messages.length
            }}</Badge>
          </TabsTrigger>
          <TabsTrigger v-if="groups.length" value="groups" class="flex-1 text-xs sm:text-sm h-10">
            <Users class="w-4 h-4 mr-1.5" />
            <span class="hidden sm:inline">Groups</span>
            <Badge variant="secondary" class="ml-1.5 h-5 px-1.5 text-[10px]">{{
              groups.length
            }}</Badge>
          </TabsTrigger>
          <TabsTrigger
            v-if="requests.length"
            value="requests"
            class="flex-1 text-xs sm:text-sm h-10 text-amber-500 data-[state=active]:text-amber-500"
          >
            <Inbox class="w-4 h-4 mr-1.5" />
            <span class="hidden sm:inline">Requests</span>
            <Badge
              variant="destructive"
              class="ml-1.5 h-5 px-1.5 text-[10px] bg-amber-500 text-black hover:bg-amber-600"
              >{{ requests.length }}</Badge
            >
          </TabsTrigger>
        </TabsList>
        <Button
          variant="ghost"
          size="icon"
          class="h-10 w-10 shrink-0 text-muted-foreground hover:bg-muted/50 transition-colors"
          title="Refresh All"
          @click="emit('refresh-all')"
        >
          <RefreshCw class="w-4 h-4" />
        </Button>
      </div>

      <TabsContent value="messages" class="mt-2 outline-none">
        <button
          v-for="room in messages"
          :key="room.id"
          class="group w-full px-3 py-3 text-left rounded-xl border border-transparent transition-all duration-200 hover:bg-muted/50 hover:border-border/50 hover:shadow-sm active:scale-[0.98]"
          @click="emit('open-room', room.roomId)"
        >
          <div class="flex items-center gap-3">
            <button
              v-if="room.peerPubkey"
              class="shrink-0 focus:outline-none"
              :title="room.profileTitle"
              @click.stop="emit('open-profile', room.peerPubkey)"
            >
              <RoboAvatar
                :pubkey="room.peerPubkey"
                :src="room.avatarSrc"
                size="lg"
                :story-ring="true"
                :hoverable="true"
                :alt="room.displayName"
              />
            </button>
            <div
              v-else
              class="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0 text-foreground font-bold text-lg"
            >
              {{ room.fallbackInitial }}
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-sm font-semibold text-foreground truncate leading-snug">
                  {{ room.displayName }}
                </p>
                <span
                  v-if="room.ageLabel"
                  class="text-[11px] text-muted-foreground shrink-0 tabular-nums"
                >
                  {{ room.ageLabel }}
                </span>
              </div>
              <p
                class="text-[11px] text-muted-foreground truncate mt-0.5 transition-opacity duration-150 group-hover:opacity-0 group-focus:opacity-0"
              >
                {{ room.secondaryLabel }}
              </p>
            </div>
          </div>
        </button>
      </TabsContent>

      <TabsContent value="groups" class="mt-2 outline-none">
        <button
          v-for="group in groups"
          :key="group.id"
          class="group w-full px-3 py-3 text-left rounded-xl border border-transparent transition-all duration-200 hover:bg-muted/50 hover:border-border/50 hover:shadow-sm active:scale-[0.98]"
          @click="emit('open-group', group.groupId)"
        >
          <div class="flex items-center gap-3">
            <RoboAvatar :group-id="group.avatarKey" :alt="group.displayName" size="lg" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-foreground truncate leading-snug">
                {{ group.displayName }}
              </p>
              <p class="text-[11px] text-muted-foreground truncate mt-0.5">
                {{ group.secondaryLabel }}
              </p>
            </div>
          </div>
        </button>
      </TabsContent>

      <TabsContent value="requests" class="mt-2 outline-none">
        <button
          v-for="room in requests"
          :key="room.id"
          class="group w-full px-3 py-3 text-left rounded-xl border border-transparent transition-all duration-200 hover:bg-amber-500/10 hover:border-amber-500/20 hover:shadow-sm active:scale-[0.98]"
          @click="emit('open-room', room.roomId)"
        >
          <div class="flex items-center gap-3">
            <button
              class="shrink-0 focus:outline-none relative"
              :title="room.profileTitle"
              @click.stop="emit('open-profile', room.peerPubkey)"
            >
              <RoboAvatar
                :pubkey="room.peerPubkey"
                :src="room.avatarSrc"
                size="lg"
                :alt="room.displayName"
                :hoverable="true"
                class="opacity-70"
              />
              <span
                class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-background"
              />
            </button>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-foreground truncate leading-snug">
                {{ room.displayName }}
              </p>
              <p class="text-[11px] text-amber-500/80 mt-0.5">Message request</p>
            </div>
          </div>
        </button>
      </TabsContent>
    </Tabs>

    <div v-else class="py-16 text-center">
      <MessageCircle class="w-8 h-8 text-muted-foreground mx-auto mb-3" />
      <p class="text-muted-foreground text-sm font-semibold">No conversations yet</p>
      <p class="text-muted-foreground text-xs mt-1">Use the actions above to start chatting</p>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useTheme } from "@/lib/theme";
import { Plus, RotateCcw, Activity, LoaderCircle, X } from "lucide-vue-next";

import AppAlertBanner from "@/components/AppAlertBanner.vue";
import {
  buildOriginlessUploadUrl,
  DEFAULT_BLOSSOM_SERVERS,
  DEFAULT_ORIGINLESS_SERVERS,
  normalizeOriginlessServerUrl,
  readUserBlossomServers,
  readUserOriginlessServers,
  saveUserBlossomServers,
  saveUserOriginlessServers,
} from "@/config/servers";
import { testUploadServers } from "@/lib/upload";
import { toast } from "vue-sonner";

// Shadcn UI
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const { appTheme, setTheme } = useTheme();

const appThemes = [
  { value: "default", label: "Gupt", color: "bg-zinc-800 dark:bg-zinc-200" },
  { value: "whatsapp", label: "WhatsApp", color: "bg-[#25D366]" },
  { value: "telegram", label: "Telegram", color: "bg-[#229ED9]" },
  { value: "signal", label: "Signal", color: "bg-[#3A76F0]" },
  { value: "discord", label: "Discord", color: "bg-[#5865F2]" },
  { value: "rose", label: "Rose", color: "bg-[#E11D48]" },
  { value: "orange", label: "Orange", color: "bg-[#F97316]" },
  { value: "green", label: "Green", color: "bg-[#22C55E]" },
  { value: "violet", label: "Violet", color: "bg-[#8B5CF6]" },
];

const blossomServers = ref([]);
const originlessServers = ref([]);
const draftServerUrl = ref("");
const draftServerType = ref("blossom");
const saving = ref(false);
const testingServers = ref(false);
const message = ref("");
const error = ref("");
const testResults = ref({});
const serverScores = ref({});

function splitCsv(value) {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

const envBlossomServers = splitCsv(
  import.meta.env.VITE_BLOSSOM_SERVERS || import.meta.env.VITE_BLOSSOM_SERVER,
)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const envOriginlessServers = splitCsv(import.meta.env.VITE_UPLOAD_URL)
  .map(normalizeOriginlessServerUrl)
  .filter(Boolean);

const effectiveBlossomServers = computed(() =>
  dedupe([...blossomServers.value, ...envBlossomServers, ...DEFAULT_BLOSSOM_SERVERS]),
);

const effectiveOriginlessServers = computed(() =>
  dedupe([...originlessServers.value, ...envOriginlessServers, ...DEFAULT_ORIGINLESS_SERVERS]),
);

const availableServers = computed(() => {
  const blossomCustom = new Set(blossomServers.value);
  const originlessCustom = new Set(originlessServers.value);

  return [
    ...effectiveBlossomServers.value.map((server) => ({
      id: `blossom:${server}`,
      server,
      uploadUrl: buildOriginlessUploadUrl(server),
      type: "Blossom",
      removable: blossomCustom.has(server),
    })),
    ...effectiveOriginlessServers.value.map((server) => ({
      id: `originless:${server}`,
      server,
      uploadUrl: buildOriginlessUploadUrl(server),
      type: "Originless",
      removable: originlessCustom.has(server),
    })),
  ];
});

function loadInputs() {
  blossomServers.value = readUserBlossomServers();
  originlessServers.value = readUserOriginlessServers();
}

function clearTestResults() {
  testResults.value = {};
}

function persistInputs() {
  blossomServers.value = saveUserBlossomServers(blossomServers.value);
  originlessServers.value = saveUserOriginlessServers(originlessServers.value);
}

function addServer() {
  const normalized = normalizeOriginlessServerUrl(draftServerUrl.value);
  if (!normalized) {
    toast.error("Enter a valid http or https server URL.");
    return;
  }

  const target = draftServerType.value === "blossom" ? blossomServers : originlessServers;
  if (target.value.includes(normalized)) {
    toast.error(
      `${draftServerType.value === "blossom" ? "Blossom" : "Originless"} server already added.`,
    );
    return;
  }

  target.value = [...target.value, normalized];
  persistInputs();

  draftServerUrl.value = "";
  toast.success(
    `${draftServerType.value === "blossom" ? "Blossom" : "Originless"} server added and saved.`,
  );
  clearTestResults();
}

function removeServer(server, type) {
  if (type === "Blossom") {
    blossomServers.value = blossomServers.value.filter((entry) => entry !== server);
  } else {
    originlessServers.value = originlessServers.value.filter((entry) => entry !== server);
  }
  persistInputs();

  toast.success("Server removed and saved.");
  clearTestResults();
}

async function runServerTests() {
  testingServers.value = true;

  try {
    const results = await testUploadServers(availableServers.value);
    testResults.value = Object.fromEntries(results.map((result) => [result.id, result]));

    const passing = results.filter((result) => result.ok).length;
    const msg =
      passing === results.length
        ? "All servers responded."
        : `${passing} of ${results.length} servers responded.`;

    if (passing === results.length) {
      toast.success(msg);
    } else if (passing > 0) {
      toast.warning(msg);
    } else {
      toast.error(msg);
    }
  } catch (testError) {
    toast.error(testError?.message || "Unable to test servers.");
  } finally {
    testingServers.value = false;
  }
}

async function resetUploadSettings() {
  saving.value = true;

  try {
    saveUserBlossomServers([]);
    saveUserOriginlessServers([]);
    loadInputs();

    clearTestResults();
    toast.success("Upload servers reset to defaults.");
  } catch (resetError) {
    toast.error(resetError?.message || "Unable to reset upload servers.");
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadInputs();
});
</script>

<template>
  <div class="flex-1 flex flex-col">
    <main class="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-bold tracking-tight">Privacy & Transport</h1>
        <p class="text-sm text-muted-foreground">
          Manage encrypted upload servers for E2E-encrypted attachments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose a primary color theme for the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-4">
            <button
              v-for="theme in appThemes"
              :key="theme.value"
              @click="setTheme(theme.value)"
              class="flex flex-col items-center gap-2 transition-all active:scale-95 outline-none"
            >
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all"
                :class="
                  appTheme === theme.value
                    ? 'border-foreground shadow-sm scale-110'
                    : 'border-transparent ring-1 ring-border shadow-sm hover:scale-105'
                "
              >
                <div class="h-8 w-8 rounded-full" :class="theme.color"></div>
              </div>
              <span
                class="text-xs font-medium transition-colors"
                :class="appTheme === theme.value ? 'text-foreground' : 'text-muted-foreground'"
              >
                {{ theme.label }}
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex flex-row items-center justify-between pb-4">
          <div class="space-y-1">
            <CardTitle>Available servers</CardTitle>
            <CardDescription
              >Hover a row to inspect each server and its current score.</CardDescription
            >
          </div>
          <Button
            variant="outline"
            :disabled="testingServers || !availableServers.length"
            @click="runServerTests"
          >
            <Activity v-if="!testingServers" class="h-4 w-4 mr-2" />
            <LoaderCircle v-else class="h-4 w-4 mr-2 animate-spin" />
            {{ testingServers ? "Testing…" : "Test Servers" }}
          </Button>
        </CardHeader>
        <CardContent>
          <div class="rounded-md border" v-if="availableServers.length">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Server</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead class="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="entry in availableServers" :key="entry.id">
                  <TableCell class="align-top space-y-1 max-w-[200px]">
                    <p class="truncate font-medium">{{ entry.server }}</p>
                    <p class="truncate text-xs text-muted-foreground">{{ entry.uploadUrl }}</p>
                    <div v-if="testResults[entry.id]" class="text-xs text-muted-foreground mt-1">
                      {{
                        testResults[entry.id].status
                          ? `HTTP ${testResults[entry.id].status}`
                          : "No HTTP response"
                      }}
                      · {{ testResults[entry.id].summary }}
                    </div>
                    <p
                      v-if="testResults[entry.id]?.returnedUrl"
                      class="break-all text-[10px] text-emerald-500 mt-1"
                    >
                      URL: {{ testResults[entry.id].returnedUrl }}
                    </p>
                  </TableCell>
                  <TableCell class="align-top">
                    <Badge variant="secondary">{{ entry.type }}</Badge>
                  </TableCell>
                  <TableCell class="align-top">
                    <Badge
                      v-if="testResults[entry.id]"
                      :variant="testResults[entry.id].ok ? 'default' : 'destructive'"
                    >
                      {{ testResults[entry.id].ok ? "OK" : "Fail" }}
                    </Badge>
                    <span v-else class="text-xs text-muted-foreground">Not tested</span>
                  </TableCell>
                  <TableCell class="align-top text-right">
                    <Button
                      v-if="entry.removable"
                      variant="ghost"
                      size="icon"
                      @click="removeServer(entry.server, entry.type)"
                    >
                      <X class="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <span v-else class="text-xs text-muted-foreground">Locked</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div v-else class="text-sm text-muted-foreground py-4 text-center border rounded-md">
            No upload servers available.
          </div>
        </CardContent>
      </Card>

      <div class="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Add server</CardTitle>
            <CardDescription>Choose the type, then paste the base URL.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label>Type</Label>
                <Select v-model="draftServerType">
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="blossom">Blossom</SelectItem>
                      <SelectItem value="originless">Originless</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div class="space-y-2">
                <Label>Server URL</Label>
                <Input
                  v-model="draftServerUrl"
                  type="url"
                  placeholder="https://24242.io"
                  spellcheck="false"
                  @keydown.enter="addServer"
                />
              </div>
            </div>
            <div class="pt-2">
              <Button @click="addServer" class="w-full sm:w-auto">
                <Plus class="h-4 w-4 mr-2" /> Add Server
              </Button>
            </div>
            <div class="rounded-lg border bg-muted/50 p-4 mt-6">
              <p class="text-sm font-medium">Recommended: run Originless yourself.</p>
              <p class="text-xs text-muted-foreground mt-1 mb-2">
                If you want a stable private fallback, self-host Originless and add that URL here.
              </p>
              <a
                href="https://github.com/besoeasy/Originless"
                target="_blank"
                rel="noreferrer"
                class="text-xs font-medium text-primary hover:underline"
              >
                https://github.com/besoeasy/Originless
              </a>
            </div>
          </CardContent>
        </Card>

        <Card class="flex flex-col">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Additional upload and cache settings.</CardDescription>
          </CardHeader>
          <CardContent class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button
              variant="outline"
              @click="resetUploadSettings"
              :disabled="saving"
              class="w-full justify-start"
            >
              <RotateCcw class="h-4 w-4 mr-2 text-muted-foreground" />
              Reset Upload Servers
            </Button>
            <Button variant="outline" class="w-full justify-start" as-child>
              <RouterLink to="/stats"> View Cache Stats &rarr; </RouterLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>

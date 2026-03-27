const fs = require('fs');

let content = fs.readFileSync('src/views/GroupRoomView.vue', 'utf8');

// 1. Remove Tabs, TabsList, TabsTrigger, TabsContent imports and add Sheet imports
content = content.replace(
  'import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";',
  ''
);

// 2. Remove the people trigger from inside the member list loop and move it to the header
content = content.replace(
  /      <!-- People drawer trigger -->[\s\S]*?<\/button>\s*<button/m,
  '<button'
);

// 3. Move the people trigger to the header next to refresh
content = content.replace(
  '<button\n        @click="refresh"',
  `      <button
        @click="showPeopleDrawer = true"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full hover:bg-muted px-3 py-1.5 text-xs font-semibold transition-colors mr-1"
      >
        <Users class="h-4 w-4" :stroke-width="1.8" />
        <span class="hidden sm:inline">People</span>
      </button>
      <button
        @click="refresh"`
);

// 4. Remove Tabs component wrapper and extract the People section to a Sheet
const tabsStart = content.indexOf('<Tabs\n        :default-value="activeMobilePanel"');
const tabsContentPeopleStart = content.indexOf('<TabsContent\n          value="people"');
const tabsContentChatStart = content.indexOf('<!-- Chat panel -->\n        <TabsContent');

// Rebuild the main section without tabs
const beforeTabs = content.substring(0, tabsStart);

// We want to turn the People panel into a Sheet
const peopleContentStr = content.substring(tabsContentPeopleStart, tabsContentChatStart);

const sheetVersion = peopleContentStr
  .replace(/<TabsContent[\s\S]*?>/, `
    <Sheet v-model:open="showPeopleDrawer">
      <SheetContent side="right" class="w-full sm:w-[400px] overflow-y-auto p-0 flex flex-col h-full bg-background border-l border-border shadow-2xl">
        <SheetHeader class="px-6 py-4 border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur-xl">
          <SheetTitle class="text-left text-lg font-bold">Group People</SheetTitle>
          <SheetDescription class="text-left">Manage members and admin settings</SheetDescription>
        </SheetHeader>
        <div class="flex-1 flex-col m-0 outline-none max-w-2xl mx-auto w-full px-4 pt-4 pb-12 space-y-6">
  `)
  .replace('</TabsContent>', '</div>\n      </SheetContent>\n    </Sheet>');

const chatContentEnd = content.indexOf('</TabsContent>\n      </Tabs>\n    </main>\n  </div>\n</template>');
let chatContentStr = content.substring(tabsContentChatStart, chatContentEnd);

// Remove the TabsContent wrapper from Chat panel
chatContentStr = chatContentStr.replace(/<!-- Chat panel -->\n        <TabsContent[\s\S]*?>/, '');

const finalTemplate = beforeTabs + chatContentStr + peopleContentStr + '\n    </main>\n  </div>\n</template>';

// Just replacing the tabs entirely by doing it manually to avoid bad matches
const fullRebuild = beforeTabs + 
`      <div class="order-1 flex flex-1 min-h-0 min-w-0 flex-col bg-background relative">
` + 
content.substring(
  content.indexOf('<div v-if="loading"'),
  content.indexOf('</TabsContent>\n      </Tabs>\n    </main>\n  </div>\n</template>')
) + 
`      </div>` + 
sheetVersion + 
`\n    </main>\n  </div>\n</template>`;

fs.writeFileSync('src/views/GroupRoomView.vue', fullRebuild, 'utf8');

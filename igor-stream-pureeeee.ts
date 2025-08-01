import type { APIRoute } from 'astro';
import { createClient } from '@wix/sdk';
import { collections, items } from '@wix/data'
// Conditional imports - only import Node.js modules when running in Node.js
// @ts-ignore - Ignore TypeScript errors for dynamic imports
let fs: any = null;
let path: any = null;

export const stringifiedType = `{
  loginEmail?: 'type is string'
  loginEmailVerified?: 'type is boolean'
  status?: 'type is enum of "UNKNOWN" | "PENDING" | "APPROVED" | "BLOCKED" | "OFFLINE"'
  contact?: {
    firstName?: 'type is string'
    lastName?: 'type is string'
    phones?: 'type is string[]'
  },
  profile?: {
    nickname?: 'type is string'
    photo?: {
      url?: 'type is string'
      height?: 'type is number'
      width?: 'type is number'
      offsetX?: 'type is number'
      offsetY?: 'type is number'
    },
    title?: 'type is string'
  },
  _createdDate?: 'type is Date'
  _updatedDate?: 'type is Date'
  lastLoginDate?: 'type is Date'
}`;




const authInstructions = `
<login-logout-guidelines>

<when-to-implement-auth>
**IMPLEMENT LOGIN/LOGOUT when the app has any of these features:**
- User-specific data (todos, notes, profiles, settings, etc.)
- Personal content (my items, my dashboard, user preferences)
- User-generated content (posts, comments, uploads)
- Personalized experiences (recommendations, history, favorites)
- Any feature that requires knowing who the user is

**DO NOT implement auth for:**
- Simple informational websites
- Pure public content (blogs, landing pages)
- Apps that don't store or display user-specific data
</when-to-implement-auth>

- Authentication is managed via the Wix Members SDK (under @/integrations). All login and logout actions use redirects only.
- The app uses a React Context provider. Import \`useMember\` from \`@/integrations\` to access member data and actions.
- The \`MemberProvider\` is already set up and wraps the entire application, automatically checking authentication on app load.
- The login function automatically redirects users back to the current page after successful authentication.
- Use the pre-built \`SignIn\` and \`LoadingSpinner\` components from \`@/components/ui\` for consistent authentication UI.

**IMPORTANT: When implementing login/logout functionality, always create a profile page and add it to the router.**

<member-type-structure>
The Member type structure:

\`\`\`typescript
${stringifiedType}
\`\`\`
</member-type-structure>

<use-member-hook>
Use the \`useMember\` hook to access:
- \`member\`: Current member object (see Member type above)
- \`isAuthenticated\`: Boolean if user is logged in (for public/mixed pages only)
- \`isLoading\`: Boolean if authentication check is in progress (for layout/navigation only)
- \`actions\`: { loadCurrentMember, login, logout, clearMember }

**FOR PROTECTED PAGES:** While using \`MemberProtectedRoute\`, just use \`member\` directly (if needed) - no need to check \`isAuthenticated\` or \`isLoading\`.
**FOR PUBLIC/MIXED PAGES:** Check \`isAuthenticated\` to show different content for logged-in vs anonymous users.
**FOR LAYOUT/NAVIGATION:** Check \`isLoading\` and \`isAuthenticated\` to show appropriate navigation options.
</use-member-hook>

<required-implementation>
**ALWAYS implement these when adding login/logout:**

- **MemberProtectedRoute Component** - Use the existing \`MemberProtectedRoute\` wrapper for ALL protected routes
- **Profile Page** - Create a ProfilePage component that displays member information (name, email, photo)
- **Profile Route** - Add \`/profile\` route wrapped with \`MemberProtectedRoute\`
- **Profile Link** - Add profile link to the navigation layout

The profile page should use the \`MemberProtectedRoute\` wrapper to handle authentication automatically.
Use the \`MemberProtectedRoute\` component for ALL protected routes for consistency.
</required-implementation>

<layout-pattern>
**Create a Layout component that wraps the entire router:**

\`\`\`typescript
import { useMember } from '@/integrations';

function Layout({ children }) {
  const { member, isAuthenticated, isLoading, actions } = useMember();

  return (
    <div className="min-h-screen">
      <nav className="flex justify-between items-center p-4 bg-white shadow">
        <Link to="/">My App</Link>
        <div>
          {isLoading && <LoadingSpinner/>}
          {!isAuthenticated && <button onClick={actions.login}>Sign In</button>}
          {isAuthenticated && (
            <>
              <Link to="/profile">{member?.profile?.nickname || 'Profile'}</Link>
              <button onClick={actions.logout}>Sign Out</button>
            </>
          )}
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}

// In Router.tsx:
<MemberProvider>
  <Router>
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/profile" element={
          <MemberProtectedRoute>
            <ProfilePage />
          </MemberProtectedRoute>
        } />
      </Routes>
    </Layout>
  </Router>
</MemberProvider>
\`\`\`
</layout-pattern>

<best-practices>
- **Use \`MemberProtectedRoute\` for ALL protected routes** - Don't manually check authentication in protected pages
- **Protected pages can use \`member\` directly** - If the page renders, user is already authenticated
- **Only check authentication on public/mixed pages** - Use \`isAuthenticated\` for conditional content
- **Only check \`isLoading\` in layout/navigation** - For showing loading states in nav bars
- Show sign-in buttons instead of auto-redirecting for better UX on public pages
- Don't manually call \`actions.loadCurrentMember()\` - it's automatic
- Create a shared Layout component for consistent navigation
- **MUST: Always create a profile page when implementing authentication**
- Use proper member data structure: \`member?.profile?.nickname\`
- Customize authentication UI through \`MemberProtectedRoute\` props instead of manual implementation
</best-practices>

<removing-authentication>
**When user asks to REMOVE login/authentication functionality:**

**Components to Remove:**
- **ProfilePage component** - Delete the entire profile page and its file
- **Layout component** - Remove if it only exists for auth navigation (check if used for other purposes)
- **MemberProtectedRoute wrapper** - Remove from all routes, leaving just the page components

**Code Cleanup in Mixed Routes:**
- Remove all \`useMember\` imports and usage
- Remove all \`member\`, \`isAuthenticated\`, \`isLoading\`, \`actions\` destructuring
- Remove conditional rendering based on authentication status
- Keep only the public/anonymous user content
- Remove auth-related comments (e.g., "MIXED ROUTE" comments)

**Router.tsx Changes:**
- Remove \`/profile\` route entirely
- Remove \`MemberProtectedRoute\` wrappers from all routes
- Remove mixed route comments
- Remove \`MemberProvider\` wrapper if no auth needed

**Navigation/Layout Changes:**
- Remove profile links from navigation
- Remove sign-in/sign-out buttons
- Remove any auth-dependent navigation logic

**Example Before → After:**
\`\`\`typescript
// BEFORE (with auth)
function HomePage() {
  const { member, isAuthenticated, actions } = useMember();
  return (
    <div>
      <h1>Welcome</h1>
      {isAuthenticated ? (
        <p>Hello, {member?.profile?.nickname}!</p>
      ) : (
        <button onClick={actions.login}>Sign In</button>
      )}
    </div>
  );
}

// AFTER (no auth)
function HomePage() {
  return (
    <div>
      <h1>Welcome</h1>
      <p>Welcome to our app!</p>
    </div>
  );
}
\`\`\`
</removing-authentication>

</login-logout-guidelines>
`


export const codeInstructions = `
<code_instructions>
When coding, you are an exceptional software developer, expert in web development.
You will develop pages, and when needed - you can develop components or edit the layout of the app.

1. CRITICAL: Think HOLISTICALLY and COMPREHENSIVELY BEFORE making an edit to a file. This means:
- Consider ALL relevant files in the project
- Review ALL previous file changes and user modifications (as shown in diffs, see diff_spec)
- Analyze the entire project context and dependencies
- Anticipate potential impacts on other parts of the system

    This holistic approach is ABSOLUTELY ESSENTIAL for creating coherent and effective applications.

2. When writing a page or a component component, the src/page/component has to be exported as default and have the same name.
3. When making a change to a page or a component, consider all existing functionality. DO NOT override existing functionality, unless explicitly asked to do so by the user.
   There's nothing that annoys a user more than fixing something / changing something the user requested, but overriding existing functionality that used to work.
4. Use shadcn/ui components from the @/components/ui folder.
5. Use Lucide React for icons. EXTREMELY IMPORTANT: include only icons you know exist in the library. DO NOT import icons that don't exist in the library. Otherwise you'll get break the app.
6. Use tailwind css for styling.
7. if you need to use url parameters, use const urlParams = new URLSearchParams(window.location.search) to parse it.
8. when using data saved on the user, handle cases where the user just registered and doesn't have data saved on the user entity yet.
9. CRITICAL: Make sure all your icon imports are valid and exist in the lucide-react library. Do not use icons that don't exist in the library and do not use icons you haven't imported - otherwise it will break the app. Use only icons you know exists.
10. ALWAYS generate responsive designs.
11. Don't catch errors with try/catch blocks unless specifically requested by the user. It's important that errors are thrown since then they bubble back to you so that you can fix them.
12. Always write pages routes in src/components/Router.tsx so they will be visible to the user.
13. Do NOT go heavy on typescript, be very simple.

All edits you make on the codebase will directly be built and rendered, therefore you should NEVER make partial changes like: - letting the user know that they should implement some components - partially implement features - refer to non-existing files. All imports MUST exist in the codebase.
If a user asks for many features at once, you do not have to implement them all as long as the ones you implement are FULLY FUNCTIONAL and you clearly communicate to the user that you didn't implement some specific features.

<available_packages>
  <packages_installed>
  Only the following packages are installed in the frontend:
  - React
  - Typescript
  - Zustand
  - tailwind css
  - shadcn/ui - all components are installed
  - lucide-react (include only icons you know exist in the library)
  - moment
  - recharts
  - react-hook-form
  - react-router-dom
  - date-fns
  - lodash
  - three.js (for 3d models and games)
  - @hello-pangea/dnd (for drag and drop)

  EXTREMELY IMPORTANT: DO NOT USE ANY OTHER LIBRARIES other than those listed above. This will BREAK THE APP. use only the ones listed above + the shadcn components in @/components/ui/.
  </packages_installed>

  <utils_package>
    - \`CollectionIds\`: the types of the database entities.
    - In this file you will find all database entities types.
    \`\`\`typescript
    import { CollectionIds } from '@/services';

    // Example:
    CollectionIds.BOARDS;
    \`\`\`

    Login and user authentication:
    ${authInstructions}
  </utils_package>

</available_packages>`

export const cmsInstructions = `
<database_instructions>
You have access to a prebuilt database utility called <strong>BaseCrudService</strong>. It is already fully configured and ready to use - you don't need to change anything there.
The collections are already created in the app, and you can use them to store and retrieve data <database_entities>.
The id of each collection is the 'id' field in the schema.json file. you must use it exactly as is without changing it.

<strong>Import:</strong>
<code>import { BaseCrudService } from '@/integrations';</code>
<strong>Usage Examples:</strong>

## Usage:
\`\`\`typescript
await BaseCrudService.create('id-from-schema', { title: 'New Item', id: crypto.randomUUID() }); - Create new item
const { items } = await BaseCrudService.getAll<EntityType>('id-from-schema'); - Get all items
const item = await BaseCrudService.getById<EntityType>('id-from-schema', 'itemId'); - Get item by ID
await BaseCrudService.update<EntityType>('id-from-schema', { _id: 'itemId', title: 'Updated' }); - Update item (needs _id)
await BaseCrudService.delete<EntityType>('id-from-schema', 'itemId');
\`\`\`

## Example:
Fetching all tasks from the database:
\`\`\`typescript
const { items } = await BaseCrudService.getAll<Task>('tasks');
// items type is Task[]
setTasks(items);
\`\`\`

### IMPORTANT NOTE:
- You must use the _id for each collection when creating, updating, or deleting items.
- Do not create Partial<SomeType>, Omit<SomeType, 'someField'>, or Pick<SomeType, 'someField'> type since the required values are being optional, keep them as it is.
- Whenever you fetch data from CMS you should NEVER add static seed or mock data in the component file or any other file. The collections are already populated with data.
</database_instructions>
`;


const getWixClient = async () => {
  const { siteId } = await readWixConfig();
  const { wixToken: apiKey, accountId } = await readCLIAPIKey();

  const authHeaders = {
      Authorization: apiKey,
      'wix-account-id': accountId,
      'wix-site-id': siteId
  }

  console.log('getting wix client with authHeaders', authHeaders);

  const wixClient = createClient({
    auth: {
      getAuthHeaders: async () => {
        console.log('getting auth headers');
        return {
          headers: authHeaders
        }
      }
    },
    modules: {
      collections: collections,
      items: items
    }
  });

  return wixClient;
}
// Runtime environment detection
const isNodeJS = typeof process !== 'undefined' && process.versions && process.versions.node;

// Lazy load Node.js modules
const loadNodeModules = async () => {
  if (fs && path) return; // Already loaded

  if (isNodeJS) {
    try {
      // Dynamic imports that won't be bundled for browser/Cloudflare
      fs = await import('fs');
      path = await import('path');
    } catch (error) {
      console.warn('Node.js modules not available:', error);
    }
  }
};

// Global state store for polling
interface GenerationState {
  status: 'running' | 'completed' | 'error';
  events: Array<{ type: string, data: any, timestamp: number }>;
  error?: string;
  startTime: number;
}

const generationStates = new Map<string, GenerationState>();

// Only set up cleanup interval in Node.js environment
if (isNodeJS && typeof setInterval !== 'undefined') {
  // Clean up old generations (older than 10 minutes)
  setInterval(() => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [id, state] of generationStates.entries()) {
      if (state.startTime < tenMinutesAgo) {
        generationStates.delete(id);
      }
    }
  }, 5 * 60 * 1000); // Clean every 5 minutes
}

const TOKEN_PATH = '../root/.wix/auth/api-key.json';

const readWixConfig = async () => {
  await loadNodeModules();
  if (!fs || !isNodeJS) {
    throw new Error('File system operations not available in this environment');
  }
  const configJSON = fs.readFileSync('wix.config.json', 'utf8');
  console.log('wix config', configJSON);
  return JSON.parse(configJSON);
}

const readCLIAPIKey = async () => {
  const wixConfig = await readWixConfig();
  await loadNodeModules();
  if (!fs || !isNodeJS) {
    throw new Error('File system operations not available in this environment');
  }
  let wixToken = process.env.WIX_TOKEN;
  let accountId: string | undefined;

  if (!wixToken) {
    console.log('no api key found in env, reading from file', TOKEN_PATH);
    const tokenJSON = fs.readFileSync(TOKEN_PATH, 'utf8');
    const token = JSON.parse(tokenJSON);
    wixToken = token.token || token.accessToken;
    accountId = token.userInfo.userId;
  }

  console.log('wix token', wixToken?.substring(0, 10), '...');

  return {
    wixToken,
    ...(accountId ? { accountId } : {}),
    ...wixConfig
  };
}



/*const anthropic = createAnthropic({
  baseURL: "https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic",
  apiKey: 'fake-api-key',
  headers: {
    Authorization: await readCLIAPIKey()
  }
});*/

async function streamClaudeCompletion(systemPrompt, userMessage, currentFiles) {
  const apiKey = 'fake-api-key';
  const url = 'https://manage.wix.com/_api/igor-ai-gateway/proxy/anthropic/messages';

  const { wixToken: authApiKey } = await readCLIAPIKey();
  const headers = {
    'Authorization': authApiKey,
    'content-type': 'application/json',
    'x-time-budget': '600000',
  };

  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 64000,
    stream: true,
    system: [
      {
        "text": systemPrompt,
        "type": "text",
        "cache_control": {
          "type": "ephemeral"
        }
      },
      {  text: currentFiles, type: 'text' },
    ],
    messages: [
      { role: 'user', content: userMessage }
    ]
  });

  console.log('[Claude] streaming claude completion', body);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  if (!response.ok) {
    console.error('[Claude] Error:', await response.text());
    return;
  }

  return response.body;
}

class StreamingFileParser {
  private buffer = '';
  private writtenFiles: string[] = [];
  private errors: string[] = [];
  private eventEmitter: (event: string, data: any) => void;
  private currentFileBuffer = '';
  private currentFilePath = '';
  private isInFile = false;
  private fileStartIndex = 0;

  constructor(eventEmitter: (event: string, data: any) => void) {
    this.eventEmitter = eventEmitter;
  }

  private LOG_LEVEL = 'info';
  // Helper method to emit both console log and client log
  private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any) {
    if (level === 'debug' && this.LOG_LEVEL !== 'debug') return;
    if (level === 'info' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info') return;
    if (level === 'warn' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info' && this.LOG_LEVEL !== 'warn') return;
    if (level === 'error' && this.LOG_LEVEL !== 'debug' && this.LOG_LEVEL !== 'info' && this.LOG_LEVEL !== 'warn' && this.LOG_LEVEL !== 'error') return;

    console.log(`${level.toUpperCase()}: ${message}`, data || '');
    this.eventEmitter('log', {
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      timestamp: new Date().toISOString()
    });
  }

  processChunk(chunk: string): { filesWritten: string[]; errors: string[]; totalFiles: number } {
    //console.log('[Claude] processChunk', chunk);
    this.buffer += chunk;

    // Debug: Log chunk to see what we're receiving
    this.log('debug', `[DOWNLOAD] Received chunk (${chunk.length} chars): ${chunk.substring(0, 100)}${chunk.length > 100 ? '...' : ''}`);

    // Process message tags first, then file tags, then action tags
    this.parseMessages();
    this.parseStreamingFiles();
    this.parseActions();
    this.parsePlans();

    return {
      filesWritten: [...this.writtenFiles],
      errors: [...this.errors],
      totalFiles: this.writtenFiles.length
    };
  }

  private parseMessages() {
    //console.log('[Claude] parseMessages', this.buffer);
    // Debug: Check if buffer contains message tags
    const hasOpenTag = this.buffer.includes('<message>');
    const hasCloseTag = this.buffer.includes('</message>');

    if (hasOpenTag || hasCloseTag) {
      this.log('debug', `[SEARCH] Buffer contains message tags - Open: ${hasOpenTag}, Close: ${hasCloseTag}`);
      this.log('debug', `[FILE_TEXT] Current buffer (first 200 chars): ${this.buffer.substring(0, 200)}...`);
    }

    // Look for complete message tags first
    const messageRegex = /<message>([\s\S]*?)<\/message>/g;
    let messageMatch;
    let found = false;

    while ((messageMatch = messageRegex.exec(this.buffer)) !== null) {
      const [fullMatch, messageContent] = messageMatch;
      const trimmedMessage = messageContent.trim();

      this.log('info', `[TARGET] Found complete message tag! Content: "${trimmedMessage}"`);

      if (trimmedMessage) {
        // Emit message event
        this.eventEmitter('claude_message', {
          message: trimmedMessage,
          timestamp: new Date().toISOString()
        });

        this.log('info', `[MESSAGE_CIRCLE] Emitted Claude message: ${trimmedMessage}`);
        found = true;
      }
    }

    // Remove all processed complete messages from buffer
    if (found) {
      this.buffer = this.buffer.replace(/<message>[\s\S]*?<\/message>/g, '');
      this.log('debug', `[TRASH_2] Removed processed complete messages from buffer`);
    }

    // Also check for streaming message content (incomplete messages)
    if (!found && hasOpenTag && !hasCloseTag) {
      const openMatch = this.buffer.match(/<message>([\s\S]*?)$/);
      if (openMatch) {
        const partialContent = openMatch[1].trim();
        if (partialContent && partialContent.length > 10) { // Only emit if substantial content
          this.log('debug', `[REFRESH_CW] Found streaming message content: "${partialContent.substring(0, 50)}..."`);

          // Emit streaming message event
          this.eventEmitter('claude_message_streaming', {
            message: partialContent,
            isPartial: true,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }

  private async parseStreamingFiles() {
    // Look for opening file tags with both path and description attributes
    const openTagRegex = /<file\s+path="([^"]+)"(?:\s+description="([^"]*)")?>/g;
    let openMatch;

    while ((openMatch = openTagRegex.exec(this.buffer)) !== null) {
      const [fullMatch, filePath, description] = openMatch;

      if (!this.isInFile) {
        this.currentFilePath = filePath.trim();
        this.currentFileBuffer = '';
        this.isInFile = true;

        // Debug logs for description parsing
        this.log('info', `📝 Starting to generate file: ${this.currentFilePath}`);
        this.log('debug', `🔍 Parsed description: "${description || 'NO DESCRIPTION'}"`);
        this.log('debug', `🔍 Full match: "${fullMatch}"`);

        // Emit file start event with description if available
        const eventData = {
          path: this.currentFilePath,
          description: description || '',
          message: description
            ? `📝 ${description}`
            : `📝 Starting to generate: ${this.currentFilePath}`
        };

        this.log('debug', `🔍 Emitting file_start event:`, eventData);
        this.eventEmitter('file_start', eventData);

        // Remove the opening tag from buffer and track where file content starts
        this.buffer = this.buffer.replace(fullMatch, '');
        this.fileStartIndex = 0; // Reset to start of cleaned buffer
        openTagRegex.lastIndex = 0;
      }
    }

    // If we're in a file, look for content and closing tags
    if (this.isInFile) {
      const closeTagRegex = /<\/file>/;
      const closeMatch = this.buffer.match(closeTagRegex);

      if (closeMatch) {
        // We found the closing tag, extract the complete content
        const contentEndIndex = this.buffer.indexOf('</file>');
        const fileContent = this.buffer.substring(this.fileStartIndex, contentEndIndex).replace(/^\n+/, '').trimEnd();

        try {
          await this.writeFile(this.currentFilePath, fileContent);
          this.log('info', `✅ Successfully completed file: ${this.currentFilePath}`);

          // Emit file complete event
          this.eventEmitter('file_complete', {
            path: this.currentFilePath,
            content: fileContent,
            message: `✅ Completed: ${this.currentFilePath}`
          });

          // Remove processed content from buffer
          this.buffer = this.buffer.substring(contentEndIndex + 7); // 7 = '</file>'.length
          this.isInFile = false;
          this.currentFilePath = '';
          this.currentFileBuffer = '';
          this.fileStartIndex = 0;
        } catch (error) {
          const errorMsg = `Failed to write ${this.currentFilePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          this.errors.push(errorMsg);
          this.log('error', `❌ File write error: ${errorMsg}`);

          this.eventEmitter('file_error', {
            path: this.currentFilePath,
            error: errorMsg,
            message: `❌ Error: ${errorMsg}`
          });

          this.isInFile = false;
          this.currentFilePath = '';
          this.currentFileBuffer = '';
          this.fileStartIndex = 0;
        }
      } else {
        // Still streaming content, show partial updates
        // Only use content from the current buffer (excluding any previous content)
        const newContent = this.buffer.substring(this.fileStartIndex).replace(/^\n+/, '');
        if (newContent !== this.currentFileBuffer) {
          this.currentFileBuffer = newContent;

          // Emit streaming content event
          this.eventEmitter('file_streaming', {
            path: this.currentFilePath,
            content: newContent,
            message: `🔄 Streaming: ${this.currentFilePath}...`
          });
        }
      }
    }
  }

  private parseActions() {
    // Look for complete action tags
    const actionRegex = /<action\s+module="([^"]+)"\s+action="([^"]+)"(?:\s+description="([^"]*)")?>([\s\S]*?)<\/action>/g;
    let actionMatch;
    let found = false;

    while ((actionMatch = actionRegex.exec(this.buffer)) !== null) {
      const [fullMatch, module, action, description, payload] = actionMatch;
      const trimmedPayload = payload.trim();

      this.log('info', `[ACTION] Found complete action tag! Module: ${module}, Action: ${action}`);

      if (trimmedPayload) {
        try {
          // Parse JSON payload
          const parsedPayload = JSON.parse(trimmedPayload);
          this.log('info', `[ACTION] Parsed payload successfully`);

          // Execute the action
          this.executeAction(module, action, parsedPayload, description);
        } catch (parseError) {
          const errorMsg = `Failed to parse action payload: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`;
          this.errors.push(errorMsg);
          this.log('error', `[ACTION] ${errorMsg}`);

          this.eventEmitter('action_error', {
            module,
            action,
            description,
            error: errorMsg,
            message: `❌ Action Error: ${errorMsg}`
          });
        }
        found = true;
      }
    }

    // Remove all processed complete actions from buffer
    if (found) {
      this.buffer = this.buffer.replace(/<action\s+module="[^"]+"\s+action="[^"]+"(?:\s+description="[^"]*")?>([\s\S]*?)<\/action>/g, '');
      this.log('debug', `[ACTION] Removed processed complete actions from buffer`);
    }
  }

  private parsePlans() {
    // Look for complete plan tags
    const planRegex = /<plan>([\s\S]*?)<\/plan>/g;
    let planMatch;
    let found = false;

    while ((planMatch = planRegex.exec(this.buffer)) !== null) {
      const [fullMatch, planContent] = planMatch;
      const trimmedPlan = planContent.trim();

      this.log('info', `[PLAN] Found complete plan tag! Content length: ${trimmedPlan.length}`);

      if (trimmedPlan) {
        // Emit plan event
        this.eventEmitter('plan', {
          plan: trimmedPlan,
          message: `📋 Plan: ${trimmedPlan.substring(0, 100)}${trimmedPlan.length > 100 ? '...' : ''}`,
          timestamp: new Date().toISOString()
        });

        this.log('info', `[PLAN] Emitted plan content: ${trimmedPlan.substring(0, 200)}${trimmedPlan.length > 200 ? '...' : ''}`);
        found = true;
      }
    }

    // Remove all processed complete plans from buffer
    if (found) {
      this.buffer = this.buffer.replace(/<plan>[\s\S]*?<\/plan>/g, '');
      this.log('debug', `[PLAN] Removed processed complete plans from buffer`);
    }

    // Also check for streaming plan content (incomplete plans)
    const hasOpenTag = this.buffer.includes('<plan>');
    const hasCloseTag = this.buffer.includes('</plan>');

    if (!found && hasOpenTag && !hasCloseTag) {
      const openMatch = this.buffer.match(/<plan>([\s\S]*?)$/);
      if (openMatch) {
        const partialContent = openMatch[1].trim();
        if (partialContent && partialContent.length > 10) { // Only emit if substantial content
          this.log('debug', `[PLAN] Found streaming plan content: "${partialContent.substring(0, 50)}..."`);

          // Emit streaming plan event
          this.eventEmitter('plan_streaming', {
            plan: partialContent,
            isPartial: true,
            message: `📋 Planning: ${partialContent.substring(0, 100)}${partialContent.length > 100 ? '...' : ''}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }

  private async executeAction(module: string, action: string, payload: any, description?: string) {
    this.log('info', `[ACTION] Executing action: ${module}.${action}`);

    // Emit action start event
    this.eventEmitter('action_start', {
      module,
      action,
      description,
      payload,
      message: description
        ? `🔧 ${description}`
        : `🔧 Executing: ${module}.${action}`
    });

    try {
      // Get the module from availableModules
      const wixClient = await getWixClient();
      const moduleObj = wixClient[module]
      if (!moduleObj) {
        throw new Error(`Module '${module}' not found in availableModules`);
      }

      // Get the action function from the module
      const actionFunc = moduleObj[action];
      if (!actionFunc || typeof actionFunc !== 'function') {
        throw new Error(`Action '${action}' not found or not a function in module '${module}'`);
      }

      // Execute the action with the payload
      this.log('info', `[ACTION] Calling ${module}.${action} with payload`, payload);
      const result = await actionFunc(...payload);

      this.log('info', `[ACTION] Action completed successfully`);

      // Emit action complete event
      this.eventEmitter('action_complete', {
        module,
        action,
        description,
        payload,
        result,
        message: `✅ Action completed: ${module}.${action}`
      });

    } catch (error) {
      const errorMsg = `Failed to execute action ${module}.${action}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.errors.push(errorMsg);
      this.log('error', `[ACTION] ${errorMsg}`);

      this.eventEmitter('action_error', {
        module,
        action,
        description,
        payload,
        error: errorMsg,
        message: `❌ Action Error: ${errorMsg}`
      });
    }
  }

  private async writeFile(filePath: string, content: string) {
    await loadNodeModules();
    if (!fs || !path || !isNodeJS) {
      this.log('error', 'File system operations not available in this environment');
      this.errors.push('File system operations not available');
      return;
    }

    // Ensure the file path starts with src/ as per the prompt requirements
    const fullPath = filePath.startsWith('src/') ? filePath : `src/${filePath}`;

    this.log('info', `✍️ Writing file: ${fullPath}`);

    try {
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      fs.mkdirSync(dir, { recursive: true });

      // Write the file
      const trimmedContent = content.replace(/^\n+/, '');
      fs.writeFileSync(fullPath, trimmedContent, 'utf8');
      this.writtenFiles.push(fullPath);
      this.log('info', `✅ Successfully wrote: ${fullPath}`);
    } catch (error) {
      this.log('error', `Failed to write file: ${fullPath}`, error);
      this.errors.push(`Failed to write file: ${fullPath} - ${error.message}`);
    }
  }

  async finalize(): Promise<{ filesWritten: string[]; errors: string[]; totalFiles: number }> {
    this.log('info', '🔄 Finalizing parsing process...');

    // Process any remaining messages in the buffer
    this.parseMessages();

    // Process any remaining actions in the buffer
    this.parseActions();

    // Handle any remaining file in progress
    if (this.isInFile && this.currentFileBuffer) {
      try {
        await this.writeFile(this.currentFilePath, this.currentFileBuffer);
        this.log('info', `✅ Finalized remaining file: ${this.currentFilePath}`);
        this.eventEmitter('file_complete', {
          path: this.currentFilePath,
          content: this.currentFileBuffer,
          message: `✅ Completed (final): ${this.currentFilePath}`
        });
      } catch (error) {
        const errorMsg = `Failed to write ${this.currentFilePath}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.errors.push(errorMsg);
        this.log('error', `❌ Final file write error: ${errorMsg}`);
        this.eventEmitter('file_error', {
          path: this.currentFilePath,
          error: errorMsg,
          message: `❌ Error: ${errorMsg}`
        });
      }
    }

    const result = {
      filesWritten: this.writtenFiles,
      errors: this.errors,
      totalFiles: this.writtenFiles.length
    };

    this.log('info', `🎉 Parsing complete - ${result.totalFiles} files written, ${result.errors.length} errors`);
    return result;
  }
}

// Helper function to convert ReadableStream to async iterable of text chunks
async function* createTextStreamFromReadableStream(readableStream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Helper function to process lines and yield text
  function* processLines(lines: string[]): Generator<string> {
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch (e) {
          // Skip invalid JSON lines
          continue;
        }
      }
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n');
          for (const text of processLines(lines)) {
            yield text;
          }
        }
        break;
      }

      // Add new chunk to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines (those ending with \n)
      const lines = buffer.split('\n');
      // Keep the last line in buffer (it might be incomplete)
      buffer = lines.pop() || '';

      // Process complete lines
      for (const text of processLines(lines)) {
        yield text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const completePromptWithStreaming = async (prompt: string, generationId: string) => {
  // Initialize generation state
  generationStates.set(generationId, {
    status: 'running',
    events: [],
    startTime: Date.now()
  });

  const eventEmitter = (event: string, data: any) => {
    const state = generationStates.get(generationId);
    if (state) {
      state.events.push({
        type: event,
        data,
        timestamp: Date.now()
      });
    }
  };
  // Helper method to emit both console log and client log
  const log = (level: 'info' | 'debug' | 'warn' | 'error', message: string, data?: any) => {
    console.log(`${level.toUpperCase()}: ${message}`, data || '');
    eventEmitter('log', {
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      timestamp: new Date().toISOString()
    });
  };

  try {
    log('info', '🚀 Starting Claude streaming request', { promptLength: prompt.length });

    eventEmitter('status', { message: '🔍 Preparing request...' });

    const importantFiles = [
      'src/tailwind.config.mjs',
      'integrations/cms/service.ts',
    ]

    // Recursive function to read all files and directories
    const readDirectoryRecursive = async (dirPath: string, basePath: string = ''): Promise<string[]> => {
      await loadNodeModules();
      if (!fs || !path || !isNodeJS) {
        log('warn', 'File system operations not available, returning empty directory listing');
        return [];
      }

      const results: string[] = [];

      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          const relativePath = basePath ? path.join(basePath, item) : item;

          try {
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
              // Recursively read subdirectories
              results.push(...await readDirectoryRecursive(fullPath, relativePath));
            } else if (stat.isFile()) {
              // Add file to results
              results.push(path.join(dirPath, item));
            }
          } catch (error) {
            console.warn(`Warning: Could not access ${fullPath}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read directory ${dirPath}:`, error);
      }

      return results;
    };

    const componentsPath = 'src/components';
    const allComponentFiles = await readDirectoryRecursive(componentsPath);

    // Separate UI components (read-only) from other components
    const uiComponents: string[] = [];
    const editableComponents: string[] = [];

    allComponentFiles.forEach(filePath => {
      if (filePath.includes('/ui/') || filePath.includes('\\ui\\')) {
        uiComponents.push(filePath);
      } else {
        editableComponents.push(filePath);
      }
    });

    log('info', `📁 Found ${allComponentFiles.length} component files total`);
    log('info', `🎨 UI components (read-only): ${uiComponents.length}`);
    log('info', `✏️ Editable components: ${editableComponents.length}`);

    // Create UI components string (read-only, no content)
    const components = uiComponents.map(filePath => {
      const relativePath = filePath.replace(/\\/g, '/'); // Normalize path separators
      return `<file path="${relativePath}" readOnly="true" />`;
    }).join('\n');

    // Create editable components string (with full content)
    const nonUiComponents = editableComponents.map(filePath => {
      const relativePath = filePath.replace(/\\/g, '/'); // Normalize path separators
      try {
        if (!fs || !isNodeJS) {
          return `<file path="${relativePath}" error="File system not available" />`;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return `
          <file path="${relativePath}">
            ${content}
          </file>
        `;
      } catch (error) {
        console.warn(`Warning: Could not read file ${filePath}:`, error);
        return `<file path="${relativePath}" error="Could not read file" />`;
      }
    }).join('\n\n---\n\n');

    const files = importantFiles.map(file => {
      try {
        if (!fs || !isNodeJS) {
          return `<file path="${file}" error="File system not available" />`;
        }
        const content = fs.readFileSync(file, 'utf8');
        return `
        <file path="${file}">
          ${content}
        </file>
      `;
      } catch (error) {
        console.warn(`Warning: Could not read file ${file}:`, error);
        return `<file path="${file}" error="Could not read file" />`;
      }
    }).join('\n\n---\n\n');

    const currentFiles = `
    # Current files:

These are UI components that you can use but not change:

${components}

Components you can edit or add to:

${nonUiComponents}

Other files that you can use:

${files}

you must only change these files, and nothing else

    `;

    const systemPrompt = `
You are the best programmer of a project written over Astro with React router and React components.

The user will give you a prompt and you must change the files in the project to achieve the user's goal.

<role>
If the user asks for an app that requires persistence, you must output the appropriate actions to create the collection and items and use them in the app.
</role>

# Messages

you can write messages to the user regarding what you are doing with the <message> tag.

<message>
  a message to the user
</message>
<message>
  another message to the user ...
</message>

message content output should be markdown.

# Files

you can ouput files with the <file> tag.

# Actions

## CMS Actions

You can output actions with the <action> tag.

For example:

<action module="collections" action="createDataCollection">
 [
  {
  "_id": "the-collection-id", // pay attention to this field, it is the id of the collection, must be "_id" and not "id"
  "displayName": "the-collection-name",
  "fields": [
    {
      "key": "field-key",
      "type": "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "REFERENCE" | "MULTI_REFERENCE" | "ARRAY" | "OBJECT",
    },
    ...
   ],
   "permissions": {
     "insert": "SITE_MEMBER" | "ANYONE",
     "update": "SITE_MEMBER" | "ANYONE",
     "remove": "SITE_MEMBER" | "ANYONE",
     "read": "SITE_MEMBER" | "ANYONE"
   }
  }
  ]
</action>

pay attention to the "_id" field, it is the id of the item, must be "_id" and not "id"

<action module="items" action="insert" description="a description of what you are doing in high level">
[
  "the-collection-id",
  {
     "any-field-key": "any-field-value",
     "any-field-key-2": "any-field-value-2",
     ...
  }
]
</action>
<action module="items" action="patch" description="a description of what you are doing in high level">
[
  "the-collection-id",
  {
  "any-field-key": "any-field-value",
  "any-field-key-2": "any-field-value-2",
  ...
  }
]
</action>

# Important:
- Action payload must always be an array of the actions parameters.
- When you create collections, create some mock items for the collection immediately.
- Choose the collection permissions according to the user's request - think carefully about the permissions.
- According to the collection permissions you choose, decide and integrate authentication and authorization to the app using the members service.

# General Coding Instructions

  ${codeInstructions}

# CMS Coding Instructions

${cmsInstructions}

# Design

 <DesignGuidelines>
  - You always design the app according to the user's request.
  - Always improve tailwind.config.mjs to match your design decisions according to the user's request - if you never edited it before, you should do it at least once  !!!!!!
  - You must make it beautiful !!!!!!!
  - The following custom colors MUST be defined: "primary", "primary-foreground", "secondary", "secondary-foreground", "destructive" and "destructive-foreground".
  - The following custom typography MUST be defined: "heading", "paragraph".
  - Common animations should be added for reuse across the application.
  </DesignGuidelines>

  The design file is \`src/tailwind.config.mjs\`. Change it to match your design decisions.

  <WritingInstruction>
    - For colors, You should change only the \`theme.extend.colors\` object.
    - For font sizes you should change only the \`theme.extend.fontSize\` object, while keeping the same structure and keys.
    - For font families you should change only the \`theme.extend.fontFamily\` object, while keeping the same structure and keys.
  </WritingInstruction>

  # Routing:

  Keep the router architecture as it is, and follow React Router's recommended patterns:

1. Proper Router Context Hierarchy
// Before: Layout was outside router context
<MemberProvider>
  <Layout> // ❌ No router context here
    <RouterProvider router={router} />
  </Layout>
</MemberProvider>

// After: Layout is inside router context
<MemberProvider>
  <RouterProvider router={router} /> // ✅ Router context established first
</MemberProvider>
2. Used Outlet Pattern
Instead of wrapping the entire router, I made Layout a route component that uses <Outlet />:

// Layout now renders children via Outlet
function Layout() {
  const { member, isAuthenticated, isLoading, actions } = useMember(); // ✅ Now has router context
  return (
    <div>
      <nav>...</nav>
      <main>
        <Outlet /> {/* Children routes render here */}
      </main>
    </div>
  );
}
3. Proper Route Nesting
The router configuration now properly nests routes:

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />, // Contains Layout + ScrollToTop
    children: [
      { index: true, element: <MemberProtectedRoute><HomePage /></MemberProtectedRoute> },
      { path: "/profile", element: <MemberProtectedRoute><ProfilePage /></MemberProtectedRoute> }
    ]
  }
]);

---

# Output format

Your output format can consist of:
- plan: step by step plan for the task - only use this if the task is complex and requires a plan
- files, with the <file> tag
- messages, with the <message> tag
- actions, with the <action> tag


<plan>
if the task is complex, explain step by step what you will do to achieve the user's goal in a complete and working way.
what files you will edit, what actions you will perform.
</plan>
<message>
  markdown message content
</message>
<action module="collections" action="createDataCollection" description="a description of what you are doing in high level">
[
  "the-collection-id",
  {
  "fields": [
    {
      "key": "field-key",
      "type": "TEXT" | "NUMBER" | "BOOLEAN" | "DATE" | "REFERENCE" | "MULTI_REFERENCE" | "ARRAY" | "OBJECT",
    },
    ...
  ],
  "permissions": {
        "insert": "SITE_MEMBER" | "ANYONE",
        "update": "SITE_MEMBER" | "ANYONE",
        "remove": "SITE_MEMBER" | "ANYONE"
        "read": "SITE_MEMBER" | "ANYONE"
    }
}
]
</action>
<action module="items" action="insert" description="a description of what you are doing in high level">
[
  "the-collection-id",
  {
  "any-field-key": "any-field-value",
  "any-field-key-2": "any-field-value-2",
  ...
}
]
</action>
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>
<message>
  another markdown message to the user ...
</message>
<file path="src/the/path/to/the/file" description="a description of what you are doing in high level">
  the new file content
</file>
<action module="items" action="insert" description="a description of what you are doing in high level">
[
  "the-collection-id",
  {
    "any-field-key": "any-field-value",
    "any-field-key-2": "any-field-value-2",
    ...
  }
]
</action>

all files must be in the src folder

you can use integrations from the integrations folder with @/integrations/...

you must always write descriptions for the files you are writing / editing.

you may add new files.

if you fail to write the best code possible, you and I will be fired.

all actions must have descriptions.

actions must be only from the above mentioned modules and actions.

make sure you integrate all the components so that the solution is complete and working.

Always choose wisely between writing files, performing actions, or writing messages to the user - according to the task and the user's request.


`;

    log('info', '📋 System prompt prepared', { systemPromptLength: systemPrompt.length });

    // Send system prompt to client
    eventEmitter('system_prompt', {
      prompt: systemPrompt,
      message: '📋 System prompt prepared'
    });

    eventEmitter('status', { message: '🤖 Starting Claude request...' });
    log('info', '🤖 Initiating Claude API request...');

    /*const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      maxTokens: 64000,
    });*/

    const result = await streamClaudeCompletion(systemPrompt, prompt, currentFiles);
    if (!result) {
      eventEmitter('error', {
        message: '❌ Error: No response from Claude',
        error: 'No response from Claude'
      });
      return;
    }
    const textStream = createTextStreamFromReadableStream(result);

    const parser = new StreamingFileParser(eventEmitter);
    let fullResponse = '';

    eventEmitter('status', { message: '📡 Streaming response...' });
    log('info', '📡 Starting to receive streaming response...');

    // Process the stream
    let chunkCount = 0;
    for await (const chunk of textStream) {
      // console.log('[Claude] chunk', chunk);
      fullResponse += chunk;
      chunkCount++;
      parser.processChunk(chunk);

      // Log every 50 chunks to avoid spam
      if (chunkCount % 50 === 0) {
        log('debug', `📊 Processed ${chunkCount} chunks, total response length: ${fullResponse.length}`);
      }
    }

    log('info', `📊 Stream complete - processed ${chunkCount} chunks, total response length: ${fullResponse.length}`);

    // Finalize parsing
    const finalResult = await parser.finalize();

    eventEmitter('complete', {
      message: `✅ Generation complete! ${finalResult.totalFiles} files written.`,
      filesWritten: finalResult.filesWritten,
      errors: finalResult.errors,
      totalFiles: finalResult.totalFiles
    });

    log('info', '✅ Streaming completed successfully');

    // Mark generation as completed
    const state = generationStates.get(generationId);
    if (state) {
      state.status = 'completed';
    }

    return finalResult;
  } catch (error) {
    log('error', '💥 Error in completePrompt', { error: error instanceof Error ? error.message : 'Unknown error' });
    eventEmitter('error', {
      message: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    // Mark generation as failed
    const state = generationStates.get(generationId);
    if (state) {
      state.status = 'error';
      state.error = error instanceof Error ? error.message : 'Unknown error';
    }

    throw error;
  }
};

const getChatUI = () => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IGOR Code Generator</title>
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0d1117;
            height: 100vh;
            margin: 0;
            padding: 0;
            color: #e6edf3;
            overflow: hidden;
        }

        .main-container {
            display: flex;
            height: 100vh;
            overflow: hidden;
        }

        .chat-container {
            background: #161b22;
            width: 450px;
            min-width: 400px;
            height: 100vh;
            display: flex;
            flex-direction: column;
            border-right: 1px solid #21262d;
        }

        .streaming-panel {
            background: #0d1117;
            flex: 1;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }

        .streaming-panel-header {
            background: #21262d;
            color: #e6edf3;
            padding: 14px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 48px;
            box-sizing: border-box;
        }

        .streaming-panel-header .header-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
        }

        .streaming-panel-header h2 {
            font-size: 13px;
            font-weight: 500;
            margin: 0;
            color: #f0f6fc;
        }

        .streaming-panel-header .subtitle {
            opacity: 0.6;
            font-size: 11px;
            margin: 0;
            color: #8b949e;
        }

        .streaming-content {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #0d1117;
            /* Account for the input area height in chat panel */
            height: calc(100vh - 48px - 80px);
        }

        .header {
            background: #21262d;
            color: #e6edf3;
            padding: 14px 16px;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 48px;
            box-sizing: border-box;
        }

        .header .header-info {
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 2px;
        }

        .header h1 {
            font-size: 13px;
            font-weight: 500;
            margin: 0;
            color: #f0f6fc;
        }

        .header .subtitle {
            opacity: 0.6;
            font-size: 11px;
            margin: 0;
            color: #8b949e;
        }

        .header-status {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #238636;
        }

        .status-text {
            font-size: 11px;
            color: #7d8590;
            font-weight: 500;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .file-count {
            font-size: 11px;
            color: #7d8590;
            padding: 2px 8px;
            background: #21262d;
            border-radius: 12px;
            border: 1px solid #30363d;
        }

        .chat-area {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            background: #161b22;
        }

        .input-area {
            padding: 16px;
            background: #21262d;
            border-top: 1px solid #30363d;
            min-height: 80px;
            box-sizing: border-box;
        }

        .input-form {
            display: flex;
            gap: 12px;
            align-items: center;
        }

        .prompt-input {
            flex: 1;
            padding: 10px 12px;
            border: 1px solid #30363d;
            border-radius: 6px;
            font-size: 13px;
            background: #0d1117;
            color: #e6edf3;
            outline: none;
            transition: all 0.2s;
            font-family: inherit;
        }

        .prompt-input:focus {
            border-color: #58a6ff;
            box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.12);
        }

        .prompt-input::placeholder {
            color: #7d8590;
        }

        .send-btn {
            padding: 10px 16px;
            background: #238636;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 13px;
            font-family: inherit;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .send-btn:hover:not(:disabled) {
            background: #2ea043;
            transform: translateY(-1px);
        }

        .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background: #238636;
            transform: none;
        }

        .message {
            margin-bottom: 16px;
            padding: 12px 16px;
            border-radius: 6px;
            max-width: 90%;
            font-size: 13px;
            line-height: 1.5;
            border: 1px solid #30363d;
        }

        .user-message {
            background: #0d2818;
            color: #e6edf3;
            margin-left: auto;
            border-color: #238636;
        }

        .assistant-message {
            background: #21262d;
            color: #e6edf3;
            border-color: #30363d;
        }

        .claude-message {
            background: #1c2128;
            border: 1px solid #373e47;
            color: #e6edf3;
            margin: 16px 0;
            position: relative;
            border-left: 3px solid #58a6ff;
        }

        .streaming-message {
            border-left: 3px solid #f0883e !important;
            opacity: 0.9;
        }

        .streaming-message .message-content {
            position: relative;
        }

        .streaming-message .message-content::after {
            content: '▋';
            color: #f0883e;
            animation: blink 1s infinite;
            margin-left: 2px;
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
            font-weight: 500;
            font-size: 12px;
            color: #f0f6fc;
        }

        /* Lucide icon alignment */
        .message-header svg,
        .message-time svg,
        .file-header svg,
        .status-message svg,
        .logs-title svg,
        .logs-toggle svg,
        .completed-file-toggle svg,
        .send-btn svg {
            width: 14px;
            height: 14px;
            vertical-align: middle;
        }

        .message-header span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .message-time {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .file-header {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-message {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .logs-title {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .logs-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
        }

        .completed-file-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
        }

        .send-btn {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .message-content {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            line-height: 1.5;
        }

        /* Markdown content styling */
        .message-content h1, .message-content h2, .message-content h3,
        .message-content h4, .message-content h5, .message-content h6 {
            color: #f0f6fc;
            margin: 16px 0 8px 0;
            font-weight: 600;
        }

        .message-content h1 { font-size: 18px; }
        .message-content h2 { font-size: 16px; }
        .message-content h3 { font-size: 14px; }
        .message-content h4 { font-size: 13px; }

        .message-content p {
            margin: 8px 0;
            color: #e6edf3;
        }

        .message-content ul, .message-content ol {
            margin: 8px 0;
            padding-left: 20px;
            color: #e6edf3;
        }

        .message-content li {
            margin: 4px 0;
        }

        .message-content code {
            background: #161b22;
            color: #f0883e;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
        }

        .message-content pre {
            background: #161b22;
            color: #e6edf3;
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 8px 0;
            border: 1px solid #30363d;
        }

        .message-content pre code {
            background: none;
            color: #e6edf3;
            padding: 0;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
        }

        .message-content blockquote {
            border-left: 3px solid #58a6ff;
            padding-left: 12px;
            margin: 8px 0;
            color: #8b949e;
            font-style: italic;
        }

        .message-content a {
            color: #58a6ff;
            text-decoration: none;
        }

        .message-content a:hover {
            text-decoration: underline;
        }

        .message-content strong {
            color: #f0f6fc;
            font-weight: 600;
        }

        .message-content em {
            color: #f0f6fc;
            font-style: italic;
        }

        .message-content hr {
            border: none;
            border-top: 1px solid #30363d;
            margin: 16px 0;
        }

        .message-content table {
            border-collapse: collapse;
            margin: 8px 0;
            width: 100%;
        }

        .message-content th, .message-content td {
            border: 1px solid #30363d;
            padding: 6px 8px;
            text-align: left;
        }

        .message-content th {
            background: #21262d;
            color: #f0f6fc;
            font-weight: 600;
        }

        .message-time {
            font-size: 10px;
            color: #7d8590;
            opacity: 0.8;
            margin-left: auto;
        }

        .system-technical-message {
            margin: 8px 0;
            padding: 4px 0;
            text-align: center;
            font-size: 11px;
            color: #7d8590;
            opacity: 0.7;
            font-family: 'JetBrains Mono', monospace;
            transition: opacity 0.2s;
        }

        .system-technical-message:hover {
            opacity: 1;
        }

        .technical-time {
            margin-right: 8px;
            color: #6e7681;
        }

        .technical-text {
            color: #7d8590;
        }

        .system-prompt-container {
            margin: 8px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
            width: 100%;
            box-sizing: border-box;
        }

        .system-prompt-content {
            background: #0d1117;
            max-height: 400px;
            overflow-y: auto;
            width: 100%;
        }

        .system-prompt-text {
            padding: 12px;
            background: #0d1117;
            color: #7d8590;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 10px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border: none;
            width: 100%;
            box-sizing: border-box;
            display: block;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 16px;
            color: #7d8590;
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid #30363d;
            border-radius: 50%;
            border-top-color: #58a6ff;
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .file-results {
            margin-top: 8px;
            padding: 12px;
            background: #0d2818;
            border: 1px solid #238636;
            border-radius: 6px;
            font-size: 13px;
        }

        .file-list {
            list-style: none;
            margin: 4px 0;
        }

        .file-list li {
            padding: 1px 0;
            color: #2ea043;
        }

        .error-list {
            list-style: none;
            margin: 4px 0;
        }

        .error-list li {
            padding: 1px 0;
            color: #f85149;
        }

        .streaming-container {
            margin: 0 0 16px 0;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            font-family: inherit;
            overflow: hidden;
        }

        .current-file {
            background: #21262d;
            color: #e6edf3;
            border-bottom: 1px solid #30363d;
        }

        .file-header {
            color: #f0f6fc;
            font-weight: 500;
            padding: 12px 16px;
            background: #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            border-bottom: 1px solid #21262d;
        }

        .file-content {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
            font-size: 12px;
            line-height: 1.4;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .status-message {
            padding: 8px 16px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            color: #58a6ff;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-files {
            margin: 0 0 16px 0;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            overflow: hidden;
        }

        .completed-files h4 {
            color: #f0f6fc;
            margin: 0;
            padding: 12px 16px;
            font-size: 12px;
            font-weight: 500;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-file-item {
            border-bottom: 1px solid #30363d;
            background: #161b22;
        }

        .completed-file-item:last-child {
            border-bottom: none;
        }

        .completed-file-header {
            padding: 12px 16px;
            background: #161b22;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .completed-file-header:hover {
            background: #21262d;
        }

        .completed-file-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .completed-file-path {
            color: #58a6ff;
            font-weight: 500;
            font-size: 12px;
            font-family: 'JetBrains Mono', monospace;
        }

        .completed-file-toggle {
            color: #7d8590;
            font-size: 12px;
            transition: transform 0.2s;
        }

        .completed-file-toggle.expanded {
            transform: rotate(90deg);
        }

        .completed-file-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .completed-file-content.expanded {
            max-height: 500px;
            overflow-y: auto;
        }

        .completed-file-code {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border-top: 1px solid #30363d;
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        .system-prompt-container {
            margin: 12px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
        }

        .system-prompt-header {
            padding: 10px 12px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .system-prompt-header:hover {
            background: #30363d;
        }

        .system-prompt-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            color: #e6edf3;
            font-size: 13px;
        }

        .system-prompt-toggle {
            color: #7d8590;
            font-size: 12px;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .system-prompt-toggle.expanded {
            transform: rotate(90deg);
        }

        .system-prompt-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .system-prompt-content.expanded {
            max-height: 500px;
            overflow-y: auto;
        }

        .system-prompt-text {
            padding: 12px;
            background: #0d1117;
            color: #e6edf3;
            font-family: inherit;
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
            margin: 0;
            border-top: 1px solid #30363d;
        }

        .logs-container {
            margin: 16px 0;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
            background: #21262d;
        }

        .logs-header {
            padding: 10px 12px;
            background: #21262d;
            border-bottom: 1px solid #30363d;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background-color 0.2s;
        }

        .logs-header:hover {
            background: #30363d;
        }

        .logs-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-weight: 500;
            color: #e6edf3;
            font-size: 13px;
        }

        .log-count {
            color: #7d8590;
            font-size: 11px;
            font-weight: normal;
        }

        .logs-toggle {
            color: #7d8590;
            font-size: 12px;
            font-weight: bold;
            transition: transform 0.2s;
        }

        .logs-toggle.expanded {
            transform: rotate(90deg);
        }

        .logs-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
        }

        .logs-content.expanded {
            max-height: 400px;
            overflow-y: auto;
        }

        .logs-list {
            background: #0d1117;
            max-height: 400px;
            overflow-y: auto;
        }

        .log-entry {
            padding: 8px 12px;
            border-bottom: 1px solid #30363d;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 11px;
            line-height: 1.4;
            word-break: break-word;
        }

        .log-entry:last-child {
            border-bottom: none;
        }

        .log-entry.log-info {
            color: #58a6ff;
        }

        .log-entry.log-debug {
            color: #7d8590;
        }

        .log-entry.log-warn {
            color: #f0883e;
        }

        .log-entry.log-error {
            color: #f85149;
        }

        .log-timestamp {
            color: #7d8590;
            font-size: 10px;
            margin-right: 8px;
        }

        .log-message {
            white-space: pre-wrap;
        }

        .log-data {
            margin-top: 4px;
            padding: 4px 8px;
            background: #161b22;
            border-left: 2px solid #30363d;
            font-size: 10px;
            color: #8b949e;
            white-space: pre-wrap;
        }

        .action-payload, .action-result, .action-error {
            margin: 8px 0;
            padding: 8px 12px;
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 4px;
            font-size: 11px;
        }

        .action-payload strong, .action-result strong, .action-error strong {
            color: #f0f6fc;
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
        }

        .action-payload pre, .action-result pre, .action-error pre {
            background: #0d1117;
            color: #e6edf3;
            padding: 8px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 0;
            font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 10px;
            line-height: 1.4;
        }

        .action-error pre {
            color: #f85149;
        }

        .action-toggle {
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
            color: #7d8590;
            font-size: 11px;
            user-select: none;
            transition: color 0.2s ease;
        }

        .action-toggle:hover {
            color: #e6edf3;
        }

        .action-toggle i {
            width: 12px;
            height: 12px;
            transition: transform 0.2s ease;
        }

        .action-toggle.expanded i {
            transform: rotate(90deg);
        }

        .action-details {
            display: none;
            margin-top: 8px;
        }

        .action-details.expanded {
            display: block;
        }

        /* Mobile tab system */
        .mobile-tabs {
            display: none;
            background: #21262d;
            border-bottom: 1px solid #30363d;
        }

        .tab-buttons {
            display: flex;
            width: 100%;
        }

        .tab-button {
            flex: 1;
            padding: 12px 16px;
            background: #161b22;
            color: #7d8590;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
            border-bottom: 2px solid transparent;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .tab-badge {
            background: #f85149;
            color: #ffffff;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 10px;
            font-weight: 600;
            min-width: 16px;
            text-align: center;
            line-height: 1.2;
        }

        .tab-button.active {
            background: #21262d;
            color: #e6edf3;
            border-bottom-color: #58a6ff;
        }

        .tab-button:hover:not(.active) {
            background: #21262d;
            color: #e6edf3;
        }

        /* Responsive design */
        @media (max-width: 1024px) {
            .main-container {
                flex-direction: column;
                height: 100vh;
            }

            .chat-container, .streaming-panel {
                width: 100%;
                min-width: unset;
                border-right: none;
                border-bottom: 1px solid #30363d;
            }

            .chat-container {
                flex: 1;
                min-height: 50vh;
            }

            .streaming-panel {
                flex: 1;
                min-height: 50vh;
                border-bottom: none;
            }
        }

        @media (max-width: 768px) {
            .mobile-tabs {
                display: block;
            }

            .main-container {
                flex-direction: column;
                height: 100vh;
            }

            .chat-container, .streaming-panel {
                width: 100%;
                height: calc(100vh - 50px); /* Subtract tab height */
                border-bottom: none;
                border-right: none;
            }

            .chat-container.hidden, .streaming-panel.hidden {
                display: none;
            }

            .streaming-content {
                height: calc(100vh - 50px - 48px); /* Subtract tab height and header */
                padding: 12px;
            }

            .chat-area {
                height: calc(100vh - 50px - 48px - 80px); /* Subtract tab, header, and input area */
                padding: 12px;
            }
        }

        @media (max-width: 640px) {
            body {
                padding: 0;
            }

            .main-container {
                width: 100%;
                border-radius: 0;
                height: 100vh;
            }

            .header, .streaming-panel-header {
                padding: 10px 12px;
            }

            .header h1, .streaming-panel-header h2 {
                font-size: 13px;
            }

            .header .subtitle, .streaming-panel-header .subtitle {
                font-size: 11px;
            }

            .input-area {
                padding: 10px 12px;
            }

            .tab-button {
                padding: 10px 12px;
                font-size: 12px;
            }
        }
    </style>
  </head>
<body>
    <!-- Mobile tab navigation -->
    <div class="mobile-tabs">
        <div class="tab-buttons">
            <button class="tab-button active" onclick="switchToTab('chat')">
                <i data-lucide="message-circle"></i> Chat
            </button>
            <button class="tab-button" onclick="switchToTab('output')">
                <i data-lucide="terminal"></i> Live Output
                <span class="tab-badge" id="outputBadge" style="display: none;">0</span>
            </button>
        </div>
    </div>

    <div class="main-container">
        <div class="chat-container" id="chatContainer">
            <div class="header">
                <div class="header-info">
                    <h1>IGOR Code Generator</h1>
                    <span class="subtitle">AI-powered file generation and code editing</span>
                </div>
                <div class="header-status">
                    <span class="status-dot"></span>
                    <span class="status-text">Ready</span>
                </div>
            </div>

            <div class="chat-area" id="chatArea">
                <div class="assistant-message message">
                    <div class="message-header">
                        <span><i data-lucide="bot"></i> IGOR</span>
                        <span class="message-time"><i data-lucide="check-circle"></i> Ready</span>
                    </div>
                    <div class="message-content">Code generator ready. Describe the components, pages, or features you want to create and I'll generate the implementation files automatically.</div>
                </div>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Generating code and writing files...</p>
            </div>

            <div class="input-area">
                <form class="input-form" id="promptForm">
                    <input
                        type="text"
                        class="prompt-input"
                        id="promptInput"
                        placeholder="Describe components, pages, or features to generate..."
                        autocomplete="off"
                        required
                    >
                    <button type="submit" class="send-btn" id="sendBtn">
                        <i data-lucide="send"></i>
                        <span>Generate</span>
                    </button>
                </form>
            </div>
        </div>

        <div class="streaming-panel" id="streamingPanel">
            <div class="streaming-panel-header">
                <div class="header-info">
                    <h2>Live Output</h2>
                    <span class="subtitle">Real-time code generation and file creation</span>
                </div>
                <div class="header-actions">
                    <span class="file-count">0 files</span>
                </div>
            </div>

            <div class="streaming-content" id="streamingContent">
                <div class="assistant-message message">
                    <div class="message-header">
                        <span><i data-lucide="settings"></i> System</span>
                        <span class="message-time"><i data-lucide="pause-circle"></i> Idle</span>
                    </div>
                    <div class="message-content">Awaiting generation request. Real-time output will appear here.</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Debug configuration - set to false to disable all debug logs
        const DEBUG_LOGS = false;

        // Debug logging wrapper
        const debugLog = (...args) => {
            if (DEBUG_LOGS) {
                console.log(...args);
            }
        };

        const chatArea = document.getElementById('chatArea');
        const streamingContent = document.getElementById('streamingContent');
        const promptForm = document.getElementById('promptForm');
        const promptInput = document.getElementById('promptInput');
        const sendBtn = document.getElementById('sendBtn');
        const loading = document.getElementById('loading');

        let streamingContainer = null;
        let completedFiles = [];
        let logEntries = [];
        let activePollingTimeout = null;

        function addMessage(content, isUser = false, sender = 'IGOR') {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${isUser ? 'user-message' : 'assistant-message'}\`;

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            messageDiv.innerHTML = \`
                <div class="message-header">
                    <span>\${isUser ? 'You' : sender}</span>
                    <span class="message-time">\${time}</span>
                </div>
                <div class="message-content">\${content}</div>
            \`;

            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        function createStreamingContainer() {
            if (streamingContainer) {
                streamingContainer.remove();
            }

            // Clear the streaming content area
            streamingContent.innerHTML = '';

            streamingContainer = document.createElement('div');
                                streamingContainer.innerHTML = \`
                        <div class="streaming-container">
                            <div id="statusMessage" class="status-message">Initializing...</div>
                            <div id="currentFile" class="current-file" style="display: none;">
                                <div class="file-header">
                                    <span id="fileName">Waiting...</span>
                                </div>
                                <div id="fileContent" class="file-content"></div>
                            </div>
                            <div id="completedFiles" class="completed-files" style="display: none;">
                                <h4><i data-lucide="folder-check"></i> Completed Files (<span id="completedCount">0</span>)</h4>
                                <div id="completedFilesList"></div>
                            </div>
                            <!-- Logs Section -->
                            <div class="logs-container" id="logsContainer" style="display: none;">
                                <div class="logs-header" onclick="toggleLogs()">
                                    <div class="logs-title">
                                        <span><i data-lucide="activity"></i> System Logs</span>
                                        <span class="log-count" id="logCount">(0)</span>
                                    </div>
                                    <span class="logs-toggle" id="logsToggle"><i data-lucide="chevron-right"></i></span>
                                </div>
                                <div class="logs-content" id="logsContent">
                                    <div class="logs-list" id="logsList"></div>
                                </div>
                            </div>
                        </div>
                    \`;
                        streamingContent.appendChild(streamingContainer);

                        // Render Lucide icons
                        lucide.createIcons();
        }

        function updateStatus(message) {
            const statusElement = document.getElementById('statusMessage');
            if (statusElement) {
                statusElement.innerHTML = message;
            }
        }

        let activeActions = new Map(); // Track active actions by module.action

        function addActionMessage(eventData, status) {
            // Only show completed and error actions, skip start
            if (status === 'start') {
                return;
            }

            const actionDiv = document.createElement('div');
            actionDiv.className = 'streaming-container';

            const statusIcons = {
                complete: '<i data-lucide="check-circle"></i>',
                error: '<i data-lucide="x-circle"></i>'
            };

            const statusColors = {
                complete: '#2ea043',
                error: '#f85149'
            };

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            let actionDetails = '';
            if (eventData.payload && typeof eventData.payload === 'object') {
                actionDetails = '<div class="action-payload"><strong>Payload:</strong><pre>' +
                    JSON.stringify(eventData.payload, null, 2) + '</pre></div>';
            }

            if (status === 'complete' && eventData.result) {
                actionDetails += '<div class="action-result"><strong>Result:</strong><pre>' +
                    JSON.stringify(eventData.result, null, 2) + '</pre></div>';
            }

            if (status === 'error' && eventData.error) {
                actionDetails += '<div class="action-error"><strong>Error:</strong><pre>' +
                    eventData.error + '</pre></div>';
            }

            const hasDetails = actionDetails || eventData.description;

            actionDiv.innerHTML = '<div class="status-message" style="color: ' + statusColors[status] + ';">' +
                statusIcons[status] + ' Action ' + status + ': ' + eventData.module + '.' + eventData.action +
                '<span style="font-size: 10px; color: #7d8590; margin-left: 8px;">' + time + '</span>' +
                '</div>' +
                (hasDetails ? '<div class="action-toggle" onclick="toggleActionDetails(this)"><i data-lucide="chevron-right"></i>Show Details</div>' : '') +
                (hasDetails ? '<div class="action-details">' +
                    (eventData.description ? '<div class="file-content" style="padding: 8px 16px; font-size: 12px; color: #e6edf3;">' + eventData.description + '</div>' : '') +
                    (actionDetails ? '<div class="file-content" style="max-height: 200px; overflow-y: auto;">' + actionDetails + '</div>' : '') +
                    '</div>' : '');

            streamingContent.appendChild(actionDiv);
            streamingContent.scrollTop = streamingContent.scrollHeight;

            // Re-render icons after adding content
            lucide.createIcons();
        }

                                let currentStreamingMessage = null;

        // Chat typing state
        let typingAnimation = null;
        let displayedText = '';
        let targetText = '';
        let lastProcessedMessage = '';

        // File typing state (reusing same pattern)
        let fileTypingAnimation = null;
        let fileDisplayedText = '';
        let fileTargetText = '';
        let lastProcessedFileContent = '';

        // Final message completion flags
        window.finalMessagePending = false;
        window.finalMessage = null;



        function resetChatTyping() {
            if (typingAnimation) {
                clearTimeout(typingAnimation);
                typingAnimation = null;
            }
            displayedText = '';
            targetText = '';
            lastProcessedMessage = '';
        }

        function resetFileTyping() {
            if (fileTypingAnimation) {
                clearTimeout(fileTypingAnimation);
                fileTypingAnimation = null;
            }
            fileDisplayedText = '';
            fileTargetText = '';
            lastProcessedFileContent = '';
        }

        function finalizePendingMessage(message) {
            console.log('📝 Finalizing pending message');

            if (!currentStreamingMessage) {
                console.log('⚠️ No streaming message to finalize');
                return;
            }

            // Update the streaming message to final state
            const contentDiv = currentStreamingMessage.querySelector('.message-content');
            const timeDiv = currentStreamingMessage.querySelector('.message-time');

            if (contentDiv && timeDiv) {
                // Parse final markdown
                marked.setOptions({ breaks: true, gfm: true });
                contentDiv.innerHTML = marked.parse(message);

                // Update time and remove streaming indicator
                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });
                timeDiv.textContent = time;

                // Remove streaming class
                currentStreamingMessage.classList.remove('streaming-message');

                chatArea.scrollTop = chatArea.scrollHeight;
                console.log('✅ Streaming message converted to final message');
            }

            currentStreamingMessage = null;
            window.finalMessagePending = false;
            window.finalMessage = null;
        }



        function addClaudeMessage(message) {
            console.log('📝 Final Claude message received:', message);

            // If there's a streaming message, let the typing complete naturally
            if (currentStreamingMessage) {
                console.log('📝 Letting existing streaming message complete naturally');

                // Just update the target - let the typing animation finish naturally
                if (typingAnimation) {
                    console.log('📝 Typing animation active - updating target to final message');
                    targetText = message;
                    lastProcessedMessage = message;

                    // Mark this as the final message so when typing completes, it finalizes
                    window.finalMessagePending = true;
                    window.finalMessage = message;
                } else {
                    // No animation running, complete immediately
                    console.log('📝 No animation running, completing immediately');
                    finalizePendingMessage(message);
                }
            } else {
                console.log('📝 No streaming message found, creating new final message');

                // Stop any ongoing typing animation
                resetChatTyping();

                const messageDiv = document.createElement('div');
                messageDiv.className = 'message claude-message';

                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });

                // Configure marked for better security and GitHub-flavored markdown
                marked.setOptions({
                    breaks: true,
                    gfm: true
                });

                messageDiv.innerHTML = \`
                    <div class="message-header">
                        <span>IGOR</span>
                        <span class="message-time">\${time}</span>
                    </div>
                    <div class="message-content">\${marked.parse(message)}</div>
                \`;

                chatArea.appendChild(messageDiv);
                chatArea.scrollTop = chatArea.scrollHeight;
                console.log('✅ New Claude message added to DOM');
            }
        }

                function typeNewContent(fullMessage, contentDiv) {
            debugLog('🎯 [TYPING] typeNewContent called');
            debugLog('🎯 [TYPING] fullMessage:', JSON.stringify(fullMessage.substring(0, 100)));
            debugLog('🎯 [TYPING] displayedText before:', JSON.stringify(displayedText.substring(0, 100)));

            // If no content to type, just update display
            if (!fullMessage || fullMessage.length === 0) {
                debugLog('🎯 [TYPING] No content to type, returning');
                return;
            }

            // Set target to the full message
            targetText = fullMessage;

            // If we already have some text displayed and it matches the start of the target, continue from there
            if (displayedText && targetText.startsWith(displayedText)) {
                debugLog('🎯 [TYPING] Continuing from existing displayed text');
            } else {
                // Start fresh
                debugLog('🎯 [TYPING] Starting fresh typing');
                displayedText = '';
            }

            debugLog('🎯 [TYPING] targetText length:', targetText.length);
            debugLog('🎯 [TYPING] displayedText length:', displayedText.length);
            debugLog('🎯 [TYPING] Starting continuous word-by-word typing');

                        const typeNextWord = () => {
                                // Check if we've reached the current target
                if (displayedText.length >= targetText.length) {
                    // Typing complete for current target
                    debugLog('🎯 [TYPING] Word typing complete! Final text length:', displayedText.length);
                    const finalHtml = marked.parse(displayedText);
                    contentDiv.innerHTML = finalHtml;
                    typingAnimation = null;

                    // Check if there's a pending final message to finalize
                    if (window.finalMessagePending && window.finalMessage) {
                        debugLog('🎯 [TYPING] Finalizing pending message after typing completion');
                        finalizePendingMessage(window.finalMessage);
                    }

                    return;
                }

                // Find the next word to type - try multiple approaches
                const remainingText = targetText.substring(displayedText.length);
                debugLog('🎯 [TYPING] Remaining text:', JSON.stringify(remainingText.substring(0, 50)));

                // Simple approach: take next 1-5 characters as a "word"
                let nextChunk = '';
                if (remainingText.length > 0) {
                    // Find word boundary or take up to 3 characters
                    const match = remainingText.match(/^(\\S+|\\s+)/);
                    if (match) {
                        nextChunk = match[1];
                    } else {
                        // Fallback: take first character
                        nextChunk = remainingText[0];
                    }
                }

                                if (nextChunk) {
                    displayedText += nextChunk;

                    debugLog('🎯 [TYPING] Added chunk:', JSON.stringify(nextChunk));
                    debugLog('🎯 [TYPING] Progress:', displayedText.length, '/', targetText.length);

                    // During typing, use plain text with line breaks converted to <br>
                    const displayHtml = displayedText
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/\\n/g, '<br>');

                    contentDiv.innerHTML = displayHtml;

                    // Auto-scroll
                    chatArea.scrollTop = chatArea.scrollHeight;

                    // Schedule next word (faster typing)
                    typingAnimation = setTimeout(typeNextWord, 30);
                } else {
                    // No more content, complete typing
                    debugLog('🎯 [TYPING] No more content, completing');
                    displayedText = targetText; // Ensure we have the complete text
                    const finalHtml = marked.parse(displayedText);
                    contentDiv.innerHTML = finalHtml;
                    typingAnimation = null;

                    // Check if there's a pending final message to finalize
                    if (window.finalMessagePending && window.finalMessage) {
                        debugLog('🎯 [TYPING] Finalizing pending message after typing completion');
                        finalizePendingMessage(window.finalMessage);
                    }
                }
            };

            typeNextWord();
        }

        function completeCurrentTyping(contentDiv) {
            debugLog('🎯 [TYPING] completeCurrentTyping called');
            debugLog('🎯 [TYPING] targetText:', JSON.stringify(targetText));

            // Stop animation and complete immediately
            if (typingAnimation) {
                debugLog('🎯 [TYPING] Stopping animation for completion');
                clearTimeout(typingAnimation);
                typingAnimation = null;
            }
            if (targetText && contentDiv) {
                displayedText = targetText;
                const finalHtml = marked.parse(displayedText);
                debugLog('🎯 [TYPING] Completed with HTML:', finalHtml.substring(0, 200));
                contentDiv.innerHTML = finalHtml;
                chatArea.scrollTop = chatArea.scrollHeight;
            }
        }

                function addOrUpdateStreamingMessage(message, isPartial) {
            debugLog('🔄 [STREAM] Adding/updating streaming message');
            debugLog('🔄 [STREAM] Message length:', message.length);
            debugLog('🔄 [STREAM] First 100 chars:', JSON.stringify(message.substring(0, 100)));
            debugLog('🔄 [STREAM] isPartial:', isPartial);
            debugLog('🔄 [STREAM] lastProcessedMessage length:', lastProcessedMessage.length);
            debugLog('🔄 [STREAM] displayedText length:', displayedText.length);

            // Configure marked for better security and GitHub-flavored markdown
            marked.setOptions({
                breaks: true,
                gfm: true
            });

            if (!currentStreamingMessage) {
                debugLog('🔄 [STREAM] Creating NEW streaming message');
                // Create new streaming message
                currentStreamingMessage = document.createElement('div');
                currentStreamingMessage.className = 'message claude-message streaming-message';

                const time = new Date().toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit'
                });

                currentStreamingMessage.innerHTML = \`
                    <div class="message-header">
                        <span>IGOR</span>
                        <span class="message-time">\${time} \${isPartial ? '(streaming...)' : ''}</span>
                    </div>
                    <div class="message-content"></div>
                \`;

                chatArea.appendChild(currentStreamingMessage);

                // Start typing the message
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                if (contentDiv) {
                    debugLog('🔄 [STREAM] Initializing first message typing');
                    displayedText = '';
                    lastProcessedMessage = '';
                    typeNewContent(message, contentDiv);
                    lastProcessedMessage = message;
                }
            } else {
                debugLog('🔄 [STREAM] Updating EXISTING streaming message');
                // Update existing streaming message - only type NEW content
                const contentDiv = currentStreamingMessage.querySelector('.message-content');
                const timeSpan = currentStreamingMessage.querySelector('.message-time');

                debugLog('🔄 [STREAM] message !== lastProcessedMessage:', message !== lastProcessedMessage);

                                if (contentDiv && message !== lastProcessedMessage) {
                    debugLog('🔄 [STREAM] Processing message update');
                    debugLog('🔄 [STREAM] Current message starts with last?:', message.startsWith(lastProcessedMessage));

                                        // If there's already typing in progress, just extend the target
                    if (typingAnimation) {
                        debugLog('🔄 [STREAM] Extending existing typing animation');
                        targetText = message; // Set target to full message
                        lastProcessedMessage = message;
                        debugLog('🔄 [STREAM] Extended targetText to:', JSON.stringify(targetText.substring(0, 100)));
                    } else {
                        // Start new typing with the full message
                        debugLog('🔄 [STREAM] Starting new typing animation');
                        typeNewContent(message, contentDiv);
                        lastProcessedMessage = message;
                    }
                } else {
                    debugLog('🔄 [STREAM] No content update needed');
                }

                if (timeSpan && isPartial) {
                    const time = new Date().toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    timeSpan.textContent = \`\${time} (streaming...)\`;
                }
            }
        }

        function addSystemPrompt(prompt) {
            const promptId = 'prompt_' + Date.now();

            const systemPromptDiv = document.createElement('div');
            systemPromptDiv.className = 'system-technical-message';
            systemPromptDiv.style.cursor = 'pointer';
            systemPromptDiv.onclick = () => toggleSystemPrompt(promptId);

            const time = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            systemPromptDiv.innerHTML = \`
                <span class="technical-time">\${time}</span>
                <span class="technical-text">System prompt prepared (\${Math.round(prompt.length / 1000)}k chars) - click to expand</span>
            \`;

            const systemPromptContainer = document.createElement('div');
            systemPromptContainer.className = 'system-prompt-container';
            systemPromptContainer.style.display = 'none';
            systemPromptContainer.id = 'container_' + promptId;
            systemPromptContainer.setAttribute('data-visible', 'false');

            const contentDiv = document.createElement('div');
            contentDiv.className = 'system-prompt-content';
            contentDiv.id = 'content_' + promptId;

            const preElement = document.createElement('pre');
            preElement.className = 'system-prompt-text';
            preElement.textContent = prompt;

            contentDiv.appendChild(preElement);
            systemPromptContainer.appendChild(contentDiv);



            chatArea.appendChild(systemPromptDiv);
            chatArea.appendChild(systemPromptContainer);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

                        function toggleSystemPrompt(promptId) {
            const containerElement = document.getElementById('container_' + promptId);

            if (containerElement) {
                // Check if it has a data attribute to track state instead of style.display
                const isVisible = containerElement.getAttribute('data-visible') === 'true';

                if (isVisible) {
                    containerElement.style.display = 'none';
                    containerElement.setAttribute('data-visible', 'false');
                } else {
                    containerElement.style.display = 'block';
                    containerElement.style.visibility = 'visible';
                    containerElement.style.opacity = '1';
                    containerElement.setAttribute('data-visible', 'true');

                    // Auto-scroll to show the expanded content
                    setTimeout(() => {
                        containerElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            }
        }

        // Make toggleSystemPrompt globally accessible
        window.toggleSystemPrompt = toggleSystemPrompt;

        function toggleActionDetails(toggleElement) {
            const actionDetails = toggleElement.nextElementSibling;
            const chevronIcon = toggleElement.querySelector('i');

            if (actionDetails && actionDetails.classList.contains('action-details')) {
                const isExpanded = actionDetails.classList.contains('expanded');

                if (isExpanded) {
                    actionDetails.classList.remove('expanded');
                    toggleElement.classList.remove('expanded');
                    toggleElement.innerHTML = '<i data-lucide="chevron-right"></i>Show Details';
                } else {
                    actionDetails.classList.add('expanded');
                    toggleElement.classList.add('expanded');
                    toggleElement.innerHTML = '<i data-lucide="chevron-down"></i>Hide Details';
                }

                // Re-render lucide icons
                lucide.createIcons();
            }
        }

        // Make toggleActionDetails globally accessible
        window.toggleActionDetails = toggleActionDetails;

                function addLogEntry(level, message, data, timestamp) {
            const logsList = document.getElementById('logsList');
            const logsContainer = document.getElementById('logsContainer');
            const logCount = document.getElementById('logCount');

            if (!logsList || !logsContainer || !logCount) return;

            // Show logs container
            logsContainer.style.display = 'block';

            // Create log entry
            const logEntry = document.createElement('div');
            logEntry.className = \`log-entry log-\${level}\`;

            const time = new Date(timestamp).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            let logHtml = \`
                <span class="log-timestamp">\${time}</span>
                <span class="log-message">\${escapeHtml(message)}</span>
            \`;

            if (data) {
                logHtml += \`<div class="log-data">\${escapeHtml(data)}</div>\`;
            }

            logEntry.innerHTML = logHtml;
            logsList.appendChild(logEntry);

            // Keep only last 100 log entries
            const entries = logsList.children;
            while (entries.length > 100) {
                logsList.removeChild(entries[0]);
            }

            // Auto-scroll to bottom if expanded
            const logsContent = document.getElementById('logsContent');
            if (logsContent && logsContent.classList.contains('expanded')) {
                logsList.scrollTop = logsList.scrollHeight;
            }

            // Update log count
            logEntries.push({ level, message, data, timestamp });
            logCount.textContent = \`(\${logEntries.length})\`;
        }

        function toggleLogs() {
            const logsContent = document.getElementById('logsContent');
            const logsToggle = document.getElementById('logsToggle');

            if (logsContent && logsToggle) {
                const isExpanded = logsContent.classList.contains('expanded');

                if (isExpanded) {
                    logsContent.classList.remove('expanded');
                    logsToggle.classList.remove('expanded');
                    logsToggle.innerHTML = '<i data-lucide="chevron-right"></i>';
                } else {
                    logsContent.classList.add('expanded');
                    logsToggle.classList.add('expanded');
                    logsToggle.innerHTML = '<i data-lucide="chevron-down"></i>';

                    // Auto-scroll to bottom when opening
                    const logsList = document.getElementById('logsList');
                    if (logsList) {
                        setTimeout(() => {
                            logsList.scrollTop = logsList.scrollHeight;
                        }, 300); // Wait for animation to complete
                    }
                }

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        // Make toggleLogs globally accessible
        window.toggleLogs = toggleLogs;

        function showCurrentFile(path, description = '') {
            console.log('📁 [FILE_START] Starting new file:', path);
            console.log('📁 [FILE_START] Description:', description);

            const currentFileDiv = document.getElementById('currentFile');
            const fileName = document.getElementById('fileName');
            const fileContent = document.getElementById('fileContent');

            if (currentFileDiv && fileName && fileContent) {
                currentFileDiv.style.display = 'block';

                // Show description if available, otherwise show path
                if (description && description.trim()) {
                    fileName.innerHTML = \`<i data-lucide="file-text"></i> \${description}\`;
                } else {
                    fileName.innerHTML = \`<i data-lucide="file-text"></i> \${path}\`;
                }

                fileContent.textContent = '';

                // Reset file typing state for new file
                resetFileTyping();

                console.log('📁 [FILE_START] File typing state reset');

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        function typeFileContent(fullContent, fileContentDiv) {
            debugLog('📁 [FILE_TYPING] typeFileContent called');
            debugLog('📁 [FILE_TYPING] fullContent length:', fullContent.length);
            debugLog('📁 [FILE_TYPING] fileDisplayedText before:', fileDisplayedText.length, 'chars');

                        // If no content to type, just update display
            if (!fullContent || fullContent.length === 0) {
                debugLog('📁 [FILE_TYPING] No content to type, returning');
                return;
            }

            // Set target to the full content
            fileTargetText = fullContent;

            // If we already have some text displayed and it matches the start of the target, continue from there
            if (fileDisplayedText && fileTargetText.startsWith(fileDisplayedText)) {
                debugLog('📁 [FILE_TYPING] Continuing from existing displayed text');
            } else {
                // Start fresh
                debugLog('📁 [FILE_TYPING] Starting fresh typing');
                fileDisplayedText = '';
            }

            debugLog('📁 [FILE_TYPING] fileTargetText length:', fileTargetText.length);
            debugLog('📁 [FILE_TYPING] fileDisplayedText length:', fileDisplayedText.length);
            debugLog('📁 [FILE_TYPING] Starting continuous word-by-word typing');

            const typeNextWord = () => {
                // Check if we've reached the current target
                if (fileDisplayedText.length >= fileTargetText.length) {
                    // Typing complete for current target
                    debugLog('📁 [FILE_TYPING] Word typing complete! Final text length:', fileDisplayedText.length);
                    fileContentDiv.textContent = fileDisplayedText;
                    fileTypingAnimation = null;
                    return;
                }

                // Find the next word to type - try multiple approaches
                const remainingText = fileTargetText.substring(fileDisplayedText.length);
                debugLog('📁 [FILE_TYPING] Remaining text:', JSON.stringify(remainingText.substring(0, 50)));

                // Simple approach: take next 1-5 characters as a "word"
                let nextChunk = '';
                if (remainingText.length > 0) {
                    // Find word boundary or take up to 3 characters
                    const match = remainingText.match(/^(\\S+|\\s+)/);
                    if (match) {
                        nextChunk = match[1];
                    } else {
                        // Fallback: take first character
                        nextChunk = remainingText[0];
                    }
                }

                if (nextChunk) {
                    fileDisplayedText += nextChunk;

                    debugLog('📁 [FILE_TYPING] Added chunk:', JSON.stringify(nextChunk));
                    debugLog('📁 [FILE_TYPING] Progress:', fileDisplayedText.length, '/', fileTargetText.length);

                    // For file content, use plain text (no HTML escaping needed for <pre>)
                    fileContentDiv.textContent = fileDisplayedText;

                    // Auto-scroll to bottom of content
                    fileContentDiv.scrollTop = fileContentDiv.scrollHeight;

                    // Same fast timing as chat (5ms between words)
                    fileTypingAnimation = setTimeout(typeNextWord, 15);
                } else {
                    // No more content, complete typing
                    debugLog('📁 [FILE_TYPING] No more content, completing');
                    fileDisplayedText = fileTargetText; // Ensure we have the complete text
                    fileContentDiv.textContent = fileDisplayedText;
                    fileTypingAnimation = null;
                }
            };

            typeNextWord();
        }

        function completeFileTyping(fileContentDiv) {
            debugLog('📁 [FILE_TYPING] completeFileTyping called');

            // Stop animation and complete immediately
            if (fileTypingAnimation) {
                debugLog('📁 [FILE_TYPING] Stopping animation for completion');
                clearTimeout(fileTypingAnimation);
                fileTypingAnimation = null;
            }
            if (fileTargetText && fileContentDiv) {
                fileDisplayedText = fileTargetText;
                fileContentDiv.textContent = fileDisplayedText;
                fileContentDiv.scrollTop = fileContentDiv.scrollHeight;
            }
        }

        function updateFileContent(content) {
            debugLog('📁 [FILE_STREAMING] updateFileContent called');
            debugLog('📁 [FILE_STREAMING] Content length:', content.length);
            debugLog('📁 [FILE_STREAMING] lastProcessedFileContent length:', lastProcessedFileContent.length);

            const fileContent = document.getElementById('fileContent');
            if (!fileContent) {
                debugLog('📁 [FILE_STREAMING] No fileContent element found');
                return;
            }

            // If there's already typing in progress, just extend the target
            if (fileTypingAnimation) {
                debugLog('📁 [FILE_STREAMING] Extending existing file typing animation');
                fileTargetText = content; // Set target to full content
                lastProcessedFileContent = content;
                debugLog('📁 [FILE_STREAMING] Extended fileTargetText to:', fileTargetText.length, 'chars');
            } else {
                // Start new typing with the full content
                debugLog('📁 [FILE_STREAMING] Starting new file typing animation');
                typeFileContent(content, fileContent);
                lastProcessedFileContent = content;
            }
        }

                function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function addCompletedFile(path, content) {
            const fileId = 'file_' + completedFiles.length;
            completedFiles.push({ path, content, id: fileId });

            const completedDiv = document.getElementById('completedFiles');
            const completedList = document.getElementById('completedFilesList');
            const completedCount = document.getElementById('completedCount');

            if (completedDiv && completedList && completedCount) {
                completedDiv.style.display = 'block';
                completedCount.textContent = completedFiles.length;

                // Create collapsible file element
                const fileElement = document.createElement('div');
                fileElement.className = 'completed-file-item';

                // Create the header
                const headerDiv = document.createElement('div');
                headerDiv.className = 'completed-file-header';
                headerDiv.onclick = () => toggleFileContent(fileId);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'completed-file-info';

                const checkSpan = document.createElement('span');
                checkSpan.innerHTML = '<i data-lucide="check-circle" style="color: #238636; width: 14px; height: 14px;"></i>';
                checkSpan.style.display = 'flex';
                checkSpan.style.alignItems = 'center';

                const pathSpan = document.createElement('span');
                pathSpan.className = 'completed-file-path';
                pathSpan.textContent = path;

                infoDiv.appendChild(checkSpan);
                infoDiv.appendChild(pathSpan);

                const toggleSpan = document.createElement('span');
                toggleSpan.className = 'completed-file-toggle';
                toggleSpan.id = 'toggle_' + fileId;
                toggleSpan.innerHTML = '<i data-lucide="chevron-right"></i>';

                headerDiv.appendChild(infoDiv);
                headerDiv.appendChild(toggleSpan);

                // Create the content container
                const contentDiv = document.createElement('div');
                contentDiv.className = 'completed-file-content';
                contentDiv.id = 'content_' + fileId;

                const codeElement = document.createElement('pre');
                codeElement.className = 'completed-file-code';
                codeElement.textContent = content; // Use textContent to preserve plain text

                contentDiv.appendChild(codeElement);
                fileElement.appendChild(headerDiv);
                fileElement.appendChild(contentDiv);

                completedList.appendChild(fileElement);

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        function toggleFileContent(fileId) {
            const contentElement = document.getElementById('content_' + fileId);
            const toggleElement = document.getElementById('toggle_' + fileId);

            if (contentElement && toggleElement) {
                const isExpanded = contentElement.classList.contains('expanded');

                if (isExpanded) {
                    contentElement.classList.remove('expanded');
                    toggleElement.classList.remove('expanded');
                    toggleElement.innerHTML = '<i data-lucide="chevron-right"></i>';
                } else {
                    contentElement.classList.add('expanded');
                    toggleElement.classList.add('expanded');
                    toggleElement.innerHTML = '<i data-lucide="chevron-down"></i>';
                }

                // Re-render Lucide icons
                lucide.createIcons();
            }
        }

        // Make toggleFileContent globally accessible
        window.toggleFileContent = toggleFileContent;

        function formatFileResults(fileResults) {
            if (!fileResults) return '';

            let html = '<div class="file-results">';
            html += \`<strong><i data-lucide="folder"></i> Files processed: \${fileResults.totalFiles}</strong>\`;

            if (fileResults.filesWritten && fileResults.filesWritten.length > 0) {
                html += '<br><strong><i data-lucide="check-circle"></i> Files written:</strong>';
                html += '<ul class="file-list">';
                fileResults.filesWritten.forEach(file => {
                    html += \`<li><i data-lucide="file"></i> \${file}</li>\`;
                });
                html += '</ul>';
            }

            if (fileResults.errors && fileResults.errors.length > 0) {
                html += '<br><strong><i data-lucide="x-circle"></i> Errors:</strong>';
                html += '<ul class="error-list">';
                fileResults.errors.forEach(error => {
                    html += \`<li><i data-lucide="alert-circle"></i> \${error}</li>\`;
                });
                html += '</ul>';
            }

            html += '</div>';
            return html;
        }

        function handleStreaming(prompt) {
            // Cancel any existing polling
            if (activePollingTimeout) {
                clearTimeout(activePollingTimeout);
                activePollingTimeout = null;
                console.log('Cancelled existing polling operation');
            }

            // On mobile, automatically switch to output tab when generation starts
            if (window.innerWidth <= 768 && typeof window.switchToTab === 'function') {
                window.switchToTab('output');
            }

            // Clear badge count for new generation
            clearOutputBadge();

            createStreamingContainer();
            completedFiles = [];
            logEntries = [];

            // Clear any existing streaming message
            if (currentStreamingMessage) {
                currentStreamingMessage.remove();
                currentStreamingMessage = null;
            }

            // Reset all typing states for new generation
            resetChatTyping();
            resetFileTyping();

            // Clear the completed files list from previous generations
            const completedList = document.getElementById('completedFilesList');
            if (completedList) {
                completedList.innerHTML = '';
            }

            // Clear and hide logs for new generation
            const logsList = document.getElementById('logsList');
            const logsContainer = document.getElementById('logsContainer');
            const logCount = document.getElementById('logCount');
            if (logsList) logsList.innerHTML = '';
            if (logsContainer) logsContainer.style.display = 'none';
            if (logCount) logCount.textContent = '(0)';

            // Start generation and get generation ID
            fetch(\`?prompt=\${encodeURIComponent(prompt)}\`)
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        updateStatus(\`<i data-lucide="x-circle"></i> Error: \${data.error}\`);
                        sendBtn.disabled = false;
                        loading.style.display = 'none';
                        return;
                    }

                    const generationId = data.generationId;
                    let processedEventCount = 0;
                    let retryCount = 0;
                    let pollInterval = 100; // Start with 1 second
                    const maxRetries = 10;
                    const maxPollInterval = 5000; // Max 5 seconds between polls
                    const startTime = Date.now();
                    const maxGenerationTime = 10 * 60 * 1000; // 10 minutes max

                    // Poll for updates with exponential backoff
                    const poll = () => {
                        // Check if we've exceeded maximum generation time
                        if (Date.now() - startTime > maxGenerationTime) {
                            console.log('Generation timeout reached');
                            activePollingTimeout = null; // Clear the reference
                            updateStatus('<i data-lucide="clock"></i> Generation timeout. Please try again.');
                            sendBtn.disabled = false;
                            loading.style.display = 'none';
                            promptInput.focus();
                            return;
                        }

                        fetch(\`?poll=\${generationId}\`)
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                                }
                                return response.json();
                            })
                            .then(pollData => {
                                // Reset retry count on successful response
                                retryCount = 0;
                                pollInterval = 1000; // Reset to 1 second on success

                                if (pollData.error) {
                                    activePollingTimeout = null; // Clear the reference
                                    updateStatus(\`<i data-lucide="x-circle"></i> Error: \${pollData.error}\`);
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    return;
                                }

                                // Process new events
                                const newEvents = pollData.events.slice(processedEventCount);
                                processedEventCount = pollData.events.length;

                                newEvents.forEach(event => {
                                    handleEvent(event.type, event.data);
                                });

                                // Check if generation is complete
                                if (pollData.status === 'completed' || pollData.status === 'error') {
                                    activePollingTimeout = null; // Clear the reference
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    promptInput.focus();
                                    return;
                                }

                                // Schedule next poll
                                activePollingTimeout = setTimeout(poll, pollInterval);
                            })
                            .catch(error => {
                                console.error('Polling error:', error);
                                retryCount++;

                                // If we've exceeded max retries, give up
                                if (retryCount >= maxRetries) {
                                    console.log(\`Max retries (\${maxRetries}) reached, stopping polling\`);
                                    activePollingTimeout = null; // Clear the reference
                                    updateStatus('<i data-lucide="wifi-off"></i> Connection failed after multiple retries. Please try again.');
                                    sendBtn.disabled = false;
                                    loading.style.display = 'none';
                                    promptInput.focus();
                                    return;
                                }

                                // Exponential backoff with jitter
                                pollInterval = Math.min(
                                    pollInterval * 1.5 + Math.random() * 1000,
                                    maxPollInterval
                                );

                                console.log(\`Retry \${retryCount}/\${maxRetries} in \${Math.round(pollInterval)}ms\`);
                                updateStatus(\`<i data-lucide="wifi-off"></i> Connection error (retry \${retryCount}/\${maxRetries})...\`);

                                // Schedule retry
                                activePollingTimeout = setTimeout(poll, pollInterval);
                            });
                    };

                    // Start polling
                    poll();
                })
                .catch(error => {
                    console.error('Generation start error:', error);
                    if (activePollingTimeout) {
                        clearTimeout(activePollingTimeout);
                        activePollingTimeout = null;
                    }
                    updateStatus('<i data-lucide="x-circle"></i> Failed to start generation.');
                    sendBtn.disabled = false;
                    loading.style.display = 'none';
                });

            // Event handler function to process events (same as before)
            function handleEvent(eventType, eventData) {
                switch (eventType) {
                    case 'status':
                        updateStatus(eventData.message.replace(/🔍/g, '<i data-lucide="search"></i>')
                                               .replace(/🤖/g, '<i data-lucide="bot"></i>')
                                               .replace(/📡/g, '<i data-lucide="radio"></i>')
                                               .replace(/🔄/g, '<i data-lucide="refresh-cw"></i>'));
                        updateOutputBadge(); // Update badge on status changes
                        lucide.createIcons();
                        break;

                    case 'system_prompt':
                        addSystemPrompt(eventData.prompt);
                        break;

                    case 'claude_message':
                        console.log('🎯 Received claude_message event:', eventData);
                        addClaudeMessage(eventData.message);
                        break;

                    case 'claude_message_streaming':
                        debugLog('🔄 Received streaming claude_message event:', eventData);
                        addOrUpdateStreamingMessage(eventData.message, eventData.isPartial);
                        break;

                    case 'log':
                        addLogEntry(eventData.level, eventData.message, eventData.data, eventData.timestamp);
                        break;

                    case 'file_start':
                        showCurrentFile(eventData.path, eventData.description);
                        updateStatus(eventData.message.replace(/📝/g, '<i data-lucide="file-text"></i>'));
                        lucide.createIcons();
                        break;

                    case 'file_streaming':
                        updateFileContent(eventData.content);
                        updateStatus(\`<i data-lucide="refresh-cw"></i> Streaming: \${eventData.path}...\`);
                        lucide.createIcons();
                        break;

                    case 'file_complete':
                        addCompletedFile(eventData.path, eventData.content);
                        updateStatus(eventData.message.replace(/✅/g, '<i data-lucide="check-circle"></i>'));
                        updateOutputBadge(); // Update badge when files are completed

                        // Reset current file display for next file
                        const currentFileDiv = document.getElementById('currentFile');
                        const fileName = document.getElementById('fileName');
                        const fileContent = document.getElementById('fileContent');
                        if (currentFileDiv && fileName && fileContent) {
                            fileName.innerHTML = '<i data-lucide="clock"></i> Ready for next file...';
                            fileContent.textContent = '';
                            // Keep it visible but ready for next file
                        }
                        lucide.createIcons();
                        break;

                    case 'file_error':
                        updateStatus(eventData.message.replace(/❌/g, '<i data-lucide="x-circle"></i>'));

                        // Reset current file display on error
                        const currentFileDiv2 = document.getElementById('currentFile');
                        if (currentFileDiv2) {
                            currentFileDiv2.style.display = 'none';
                        }
                        lucide.createIcons();
                        break;

                    case 'complete':
                        updateStatus(eventData.message.replace(/✅/g, '<i data-lucide="check-circle"></i>'));

                        // Hide current file display when all done
                        const currentFileDiv3 = document.getElementById('currentFile');
                        if (currentFileDiv3) {
                            currentFileDiv3.style.display = 'none';
                        }

                        lucide.createIcons();
                        break;

                    case 'error':
                        updateStatus(eventData.message.replace(/❌/g, '<i data-lucide="x-circle"></i>'));
                        lucide.createIcons();
                        break;

                    case 'action_start':
                        addActionMessage(eventData, 'start');
                        updateOutputBadge(); // Update badge on action events
                        lucide.createIcons();
                        break;

                    case 'action_complete':
                        addActionMessage(eventData, 'complete');
                        updateOutputBadge(); // Update badge on action events
                        lucide.createIcons();
                        break;

                    case 'action_error':
                        addActionMessage(eventData, 'error');
                        updateOutputBadge(); // Update badge on action events
                        lucide.createIcons();
                        break;

                    case 'plan':
                        console.log('📋 Received plan event:', eventData);
                        addClaudeMessage(eventData.plan);
                        break;

                    case 'plan_streaming':
                        debugLog('📋 Received streaming plan event:', eventData);
                        addOrUpdateStreamingMessage(eventData.plan, eventData.isPartial);
                        break;

                    default:
                        console.log('Unknown event type:', eventType, eventData);
                }
            }
        }

        promptForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const prompt = promptInput.value.trim();
            if (!prompt) return;

            // Add user message
            addMessage(prompt, true);

            // Clear input and show loading
            promptInput.value = '';
            sendBtn.disabled = true;
            loading.style.display = 'block';

            // Use streaming by default
            handleStreaming(prompt);
        });

        // Badge management for mobile tabs
        let outputActivityCount = 0;

        function updateOutputBadge(increment = true) {
            const badge = document.getElementById('outputBadge');
            const streamingPanel = document.getElementById('streamingPanel');

            if (!badge) return;

            // Only show badge on mobile when streaming panel is hidden
            if (window.innerWidth <= 768 && streamingPanel && streamingPanel.classList.contains('hidden')) {
                if (increment) outputActivityCount++;

                if (outputActivityCount > 0) {
                    badge.textContent = outputActivityCount > 99 ? '99+' : outputActivityCount.toString();
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        }

        function clearOutputBadge() {
            const badge = document.getElementById('outputBadge');
            if (badge) {
                outputActivityCount = 0;
                badge.style.display = 'none';
            }
        }

        // Mobile tab switching functionality
        function switchToTab(tabName) {
            const chatContainer = document.getElementById('chatContainer');
            const streamingPanel = document.getElementById('streamingPanel');
            const tabButtons = document.querySelectorAll('.tab-button');

            // Remove active class from all buttons
            tabButtons.forEach(button => button.classList.remove('active'));

            if (tabName === 'chat') {
                chatContainer.classList.remove('hidden');
                streamingPanel.classList.add('hidden');
                tabButtons[0].classList.add('active');
                // Focus input when switching to chat
                promptInput.focus();
            } else if (tabName === 'output') {
                chatContainer.classList.add('hidden');
                streamingPanel.classList.remove('hidden');
                tabButtons[1].classList.add('active');
                // Clear badge when viewing output
                clearOutputBadge();
            }

            // Re-render Lucide icons after tab switch
            lucide.createIcons();
        }

        // Make switchToTab globally accessible
        window.switchToTab = switchToTab;

        // Focus input on load
        promptInput.focus();

        // Initialize Lucide icons on page load
        document.addEventListener('DOMContentLoaded', function() {
            lucide.createIcons();
        });

        // Also create icons immediately if DOM is already loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', lucide.createIcons);
        } else {
            lucide.createIcons();
        }
    </script>
</body>
</html>
  `;
};

export const GET: APIRoute = async ({ url }) => {
  const startTime = Date.now();
  console.log('🌟 === IGOR\'s Backdoor Activated (AI SDK Version) ===');

  try {
    // Check if UI mode is requested
    const uiMode = url.searchParams.get('ui') === 'true';
    if (uiMode) {
      console.log('🎨 Returning chat UI interface');
      return new Response(getChatUI(), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    // Check if this is a poll request for existing generation FIRST
    const pollId = url.searchParams.get('poll');
    if (pollId) {
      const state = generationStates.get(pollId);
      if (!state) {
        return new Response(JSON.stringify({
          error: 'Generation not found or expired',
          timestamp: new Date().toISOString()
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        status: state.status,
        events: state.events,
        error: state.error,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

    // If not polling, check for prompt parameter
    const prompt = url.searchParams.get('prompt');
    console.log('📝 Received prompt:', prompt);

    if (!prompt) {
      console.log('❌ No prompt provided');
      return new Response(JSON.stringify({
        error: 'Missing prompt parameter',
        usage: 'Add ?prompt=your-question-here to the URL',
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Start new generation with polling
    console.log('🚀 Starting new generation with polling...');
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    // Start generation asynchronously (don't await)
    completePromptWithStreaming(prompt, generationId).catch((error) => {
      console.error('Generation failed:', error);
    });

    // Return generation ID immediately
    return new Response(JSON.stringify({
      generationId,
      status: 'started',
      message: 'Generation started, use the generationId to poll for updates',
      pollUrl: `${url.pathname}?poll=${generationId}`,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('💥 ERROR in Igor\'s backdoor after', duration, 'ms:', error);

    let errorDetails = 'Unknown error';
    let statusCode = 500;

    if (error instanceof Error) {
      errorDetails = error.message;
      console.error('Error stack:', error.stack);

      // Handle specific error types
      if (error.message.includes('ENOENT')) {
        errorDetails = 'Auth file not found';
        statusCode = 500;
      } else if (error.message.includes('JSON')) {
        errorDetails = 'Invalid JSON in auth file';
        statusCode = 500;
      } else if (error.message.includes('Network') || error.message.includes('fetch')) {
        errorDetails = 'Network error connecting to AI gateway';
        statusCode = 502;
      }
    }

    return new Response(JSON.stringify({
      error: 'Igor\'s backdoor failed',
      details: errorDetails,
      timestamp: new Date().toISOString(),
      duration: duration,
      debugInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform
      }
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};



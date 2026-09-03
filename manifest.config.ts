import { defineManifest } from '@crxjs/vite-plugin';
import { PROBLEM_PAGE_PATTERNS } from './src/core/urls';

/**
 * Problem pages we attach to (spec.md section 3). Read from core/urls.ts so
 * the content-script match list, the context-menu documentUrlPatterns and the
 * service worker's own URL matching cannot drift apart.
 */
const PROBLEM_PAGES = [...PROBLEM_PAGE_PATTERNS];


export default defineManifest({
  manifest_version: 3,
  name: 'DSA Helper',
  version: '0.1.0',
  description:
    'Turn the problem you are on into a YouTube search or a ready-to-send ChatGPT review, in one keystroke.',

  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'DSA Helper',
  },

  options_page: 'src/options/index.html',

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  // docs/spec.md section 10. No <all_urls>, no clipboardWrite.
  permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'tabs'],

  host_permissions: [
    'https://leetcode.com/*',
    'https://codeforces.com/*',
    'https://www.codechef.com/*',
    'https://www.geeksforgeeks.org/*',
    'https://practice.geeksforgeeks.org/*',
    'https://chatgpt.com/*',
  ],

  content_scripts: [
    {
      matches: PROBLEM_PAGES,
      js: ['src/content/platform/index.ts'],
      run_at: 'document_idle',
    },
    {
      // Reads the page's own editor model. Read-only, nonce-checked: D020.
      matches: PROBLEM_PAGES,
      js: ['src/content/mainworld/editorBridge.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: ['https://chatgpt.com/*'],
      js: ['src/content/chatgpt/inject.ts'],
      run_at: 'document_idle',
    },
  ],

  // Chrome allows at most 4 suggested bindings; copy-prompt is left for the
  // user to bind at chrome://extensions/shortcuts. docs/spec.md section 9.1.
  commands: {
    'search-youtube': {
      suggested_key: { default: 'Alt+Shift+Y' },
      description: 'Search YouTube for this problem',
    },
    'ask-chatgpt': {
      suggested_key: { default: 'Alt+Shift+G' },
      description: 'Ask ChatGPT to review my solution',
    },
    'copy-prompt': {
      description: 'Copy the review prompt to the clipboard',
    },
  },
});

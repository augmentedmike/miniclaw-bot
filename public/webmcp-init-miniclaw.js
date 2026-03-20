/**
 * WebMCP initialization for miniclaw.bot
 * Include after webmcp-tools.js
 *
 * Supports both DOMContentLoaded and async loading (Next.js afterInteractive).
 *
 * Registers tools:
 *   - download-miniclaw (imperative, links to GitHub)
 *   - check-plugin-list (imperative, navigates to /#plugins)
 *
 * Declarative: The waitlist form in email-signup-modal.tsx has toolname="join-waitlist"
 * and is auto-discovered by webmcp-tools.js discoverDeclarativeForms().
 *
 * ModelContext endpoint: /.well-known/modelcontext
 */
(function () {
  function doInit() {
    if (typeof WebMCP === 'undefined') return;

    WebMCP.init({
      site: 'miniclaw.bot',
      modelContext: '/.well-known/modelcontext',
      tools: [
        {
          name: 'download-miniclaw',
          description: 'Download the MiniClaw bootstrap installer for macOS.',
          inputSchema: {
            type: 'object',
            properties: {}
          },
          execute: function () {
            window.location.href = '/install/download';
            return {
              content: [{ type: 'text', text: 'MiniClaw installer download initiated.' }]
            };
          }
        },
        {
          name: 'check-plugin-list',
          description: 'View the list of available MiniClaw plugins — memory, skills, persona, kanban, design, email, and more.',
          inputSchema: {
            type: 'object',
            properties: {}
          },
          execute: function () {
            window.location.hash = '#plugins';
            return {
              content: [{ type: 'text', text: 'Navigated to the plugins section.' }]
            };
          }
        }
      ]
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', doInit);
  } else {
    doInit();
  }
})();

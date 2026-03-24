# AI Docs

AI-powered document editor with WYSIWYG markdown editing, web research, and agentic AI writing.

AI Docs combines a TipTap-based markdown editor with an AI assistant that can research topics on the web, cross-reference documents across projects, and write in your personal style. It includes an MCP server so external AI tools like Claude Desktop and Cursor can create and manage documents programmatically, and an MCP client for connecting external tools like image generators.

## Features

- **WYSIWYG markdown editor** — TipTap-based editor with visual/source toggle, formatting toolbar, and auto-save
- **Agentic AI assistant** — chat with tool-calling loop, web search, page fetching, document patching
- **Writing style guide** — upload samples of your writing and the AI learns to match your voice
- **Cross-project references** — search and pull content from any project in your workspace
- **Web research** — search the web and fetch full articles for deep research writing
- **MCP server** — 25+ tools for external AI integration; connect Claude Desktop, Cursor, or any MCP client
- **MCP client** — connect external MCP servers (e.g. nano-banana for image generation)
- **Semantic search** — vector embeddings for meaning-based document search
- **Any LLM provider** — works with Ollama, OpenAI, Anthropic, or any OpenAI-compatible API
- **Electron desktop app** — standalone app with embedded server

## Quick Start

**Prerequisites:** [Bun](https://bun.sh/) and an LLM provider (e.g. [Ollama](https://ollama.com/))

```bash
git clone <repo-url>
cd ai-docs
bun install
bun run dev
```

The app will be available at [http://localhost:5176](http://localhost:5176) (client) with the API server on port 3084.

## LLM Configuration

Configure your LLM provider through the Settings UI in the app. The default configuration points to a local Ollama instance:

| Setting | Default |
|---------|---------|
| API Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` |
| Model | `llama3.2` |

To use OpenAI, set the base URL to `https://api.openai.com/v1`, add your API key, and choose a model like `gpt-4o`. Any OpenAI-compatible endpoint works the same way.

## MCP Server (Outgoing — AI Docs as a tool provider)

AI Docs exposes an MCP server so external AI tools can create and manage documents programmatically. This means Claude Desktop, Cursor, Claude Code, or any MCP-compatible client can read, write, search, and organize your documents.

### Run standalone

```bash
bun run mcp
```

### Connect from Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-docs": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/ai-docs"
    }
  }
}
```

### Connect from Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "ai-docs": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/ai-docs"
    }
  }
}
```

### Available MCP Tools

**Project management:**
- `list_projects` — list all projects
- `create_project` — create a new project
- `set_active_project` — set the working project for subsequent calls
- `get_project_status` — get project overview with folder/document tree

**Folder operations:**
- `create_folder`, `rename_folder`, `delete_folder`, `move_folder`, `list_folders`

**Document operations:**
- `create_document` — create a new document with optional initial content
- `get_document` — get document metadata
- `get_document_content` — read full document content
- `update_document` — update title or folder
- `update_document_content` — replace or append content
- `patch_document` — surgical edits (find/replace, insert, delete) without rewriting
- `delete_document`, `move_document`

**Search:**
- `search_documents_text` — text/regex search across documents
- `search_documents` — semantic search using vector embeddings
- `search_all_documents` — search across all projects

**Cross-project:**
- `get_project_documents` — list documents in any project
- `read_reference_document` — read a document from any project
- `read_multiple_documents` — batch-read multiple documents

**Web research:**
- `web_search` — search the web (Brave Search or DuckDuckGo)
- `fetch_webpage` — fetch and extract readable content from a URL

**Database:**
- `query_database` — run read-only SQL queries

### Example: Creating a document from Claude Desktop

```
Create a new project called "Blog Posts" in AI Docs, then create a document
titled "My First Post" with some placeholder content about AI trends.
```

Claude will use `create_project`, then `create_document` with the content.

## MCP Client (Incoming — External tools for AI Docs)

AI Docs can connect to external MCP servers, making their tools available to the built-in AI assistant. This is how you add capabilities like image generation, database access, or any custom tool.

### Setup via Settings UI

1. Open **Settings** in the app
2. Scroll to **MCP Servers (External Tools)**
3. Click **+ Add Server**
4. Enter the server name, command, arguments, and environment variables
5. Click **Save** — the server will connect automatically

### Example: nano-banana (Image Generation)

To add AI image generation to your documents:

| Field | Value |
|-------|-------|
| Name | `nano-banana` |
| Command | `npx` |
| Args | `-y` (line 1), `@anthropic/nano-banana-mcp` (line 2) |

Once connected, ask the AI assistant:

```
Generate an image of a futuristic cityscape and insert it into my document.
```

The AI will call `mcp__nano-banana__generate_image`, get the image URL, and insert it as a markdown image.

### How External Tools Work

External tools are namespaced as `mcp__<serverName>__<toolName>` to avoid conflicts with built-in tools. The AI assistant sees all connected tools in its tool list and can call them like any other tool. Results are processed and can be inserted into documents.

### Example: Custom MCP Server

Any MCP-compatible server works. For a custom server:

| Field | Value |
|-------|-------|
| Name | `my-tools` |
| Command | `node` |
| Args | `/path/to/my-mcp-server.js` |
| Env | `API_KEY=sk-...` |

## Project Structure

```
client/              React + Vite frontend
  src/
    components/      UI components (editor, chat, sidebar, settings)
    store/           Zustand state management
    api/             API client
    lib/             Chat streaming, SSE parser
server/              Bun + Hono backend
  routes/            API endpoints (chat, documents, folders, style, MCP)
  db/                Schema, migrations, client
  lib/
    llm.ts           LLM integration (streaming + completion)
    tools/           Tool definitions and executors
    mcp/             MCP server (outgoing) & client manager (incoming)
    embeddings.ts    Vector embeddings for semantic search
    styleAnalyzer.ts Writing style guide generation
    systemPrompt.ts  Dynamic system prompt builder
electron/            Electron desktop app wrapper
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh/) (dev) / Node.js (Electron)
- **Backend:** [Hono](https://hono.dev/), SQLite via [Drizzle ORM](https://orm.drizzle.team/)
- **Frontend:** React 19, [TipTap](https://tiptap.dev/), [Zustand](https://zustand-demo.pmnd.rs/), [Tailwind CSS 4](https://tailwindcss.com/)
- **AI:** OpenAI-compatible chat completions, [Model Context Protocol](https://modelcontextprotocol.io/)
- **Desktop:** [Electron](https://www.electronjs.org/)

## License

[MIT](LICENSE)

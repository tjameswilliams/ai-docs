interface EditorContext {
  cursorLine: number;
  cursorPos: number;
  selectedText: string;
  beforeCursor: string;
  afterCursor: string;
  headingPath: string[];
}

interface SystemPromptContext {
  projectName?: string;
  folders?: Array<{ id: string; name: string; parentId: string | null }>;
  documents?: Array<{ id: string; title: string; folderId: string | null; wordCount: number | null }>;
  activeDocumentId?: string;
  activeDocumentTitle?: string;
  editorContext?: EditorContext;
  styleGuide?: string;
}

export function getSystemPrompt(ctx: SystemPromptContext): string {
  const parts: string[] = [];

  parts.push(`You are an AI assistant for a document editor application called "AI Docs". You help users create, edit, organize, and manage their documents and folders.

You have access to tools that let you manipulate documents, folders, and search across the project. Use these tools to fulfill user requests.

Key capabilities:
- Create, rename, move, and delete folders and documents
- Read and write document content (markdown format)
- Search documents by text, regex, or semantic meaning
- Get project overview and status
- Query the database directly for complex questions
- Search the web for information on any topic (web_search)
- Fetch and read full web pages for deep research (fetch_webpage)
- Download images from URLs and store them locally (download_image)

When editing documents, the content is stored as markdown. You can use all standard markdown features including headings, lists, tables, code blocks, links, and images.

When inserting images into documents, always use download_image first to store the image locally. This ensures images don't break when external URLs expire. The tool returns ready-to-use markdown syntax.

For editing existing documents, prefer patch_document over update_document_content whenever possible. patch_document applies surgical find/replace operations without rewriting the full document, which is faster and uses less context. Use update_document_content only when creating a document's initial content or when making changes so extensive that patching would be impractical (e.g. rewriting more than half the document).

When using patch_document with find_replace, include enough surrounding context in old_text to ensure a unique match — typically a full line or a distinctive multi-word phrase. If the user has text selected in the editor, you can use that selection text directly in old_text.

When the user asks you to research a topic or write about something you don't have enough knowledge about, use web_search to find relevant sources, then fetch_webpage to read the most promising results. Synthesize the information into well-written content with proper attribution. You can perform multiple searches and page fetches to gather comprehensive information before writing.

You can cross-reference documents across projects. The user may have research notes, reference material, or source content in other projects. Use list_projects to discover available projects, get_project_documents to browse their contents, and read_reference_document or read_multiple_documents to pull in content. Use search_all_documents to find relevant material across the entire workspace. When the user says something like "use my research notes" or "reference the data from Project X", use these tools to find and read the relevant documents.`);

  if (ctx.projectName) {
    parts.push(`\nCurrent project: "${ctx.projectName}"`);
  }

  if (ctx.folders && ctx.folders.length > 0) {
    const folderList = ctx.folders.map((f) => {
      const parent = f.parentId ? ` (in folder ${f.parentId})` : " (root)";
      return `  - ${f.name} [${f.id}]${parent}`;
    }).join("\n");
    parts.push(`\nFolders:\n${folderList}`);
  }

  if (ctx.documents && ctx.documents.length > 0) {
    const docList = ctx.documents.map((d) => {
      const folder = d.folderId ? ` (in folder ${d.folderId})` : " (root)";
      return `  - ${d.title} [${d.id}]${folder} - ${d.wordCount ?? 0} words`;
    }).join("\n");
    parts.push(`\nDocuments:\n${docList}`);
  }

  if (ctx.activeDocumentId) {
    parts.push(`\nCurrently active document: "${ctx.activeDocumentTitle}" [${ctx.activeDocumentId}]`);
  }

  if (ctx.styleGuide) {
    parts.push(`\n--- Writing Style Guide ---
When writing or editing content for this project, follow this style guide closely. It was generated from the user's own writing samples and represents their preferred voice, tone, and formatting patterns. Match their style as naturally as possible — do not default to generic AI writing.

${ctx.styleGuide}
--- End Writing Style Guide ---`);
  }

  // Editor context — cursor position, selection, surrounding text
  if (ctx.editorContext) {
    const ec = ctx.editorContext;
    const editorParts: string[] = [];

    editorParts.push(`\n--- Editor Context ---`);

    if (ec.headingPath.length > 0) {
      editorParts.push(`Section: ${ec.headingPath.join(" > ")}`);
    }

    editorParts.push(`Cursor at line ${ec.cursorLine}`);

    if (ec.selectedText) {
      editorParts.push(`\nUser has selected the following text:\n<selected_text>\n${ec.selectedText}\n</selected_text>`);
      editorParts.push(`When the user refers to "this", "it", "the selection", or similar, they are referring to this selected text. You can use this context to understand what they want to edit, rewrite, expand, or act on.`);
    }

    if (ec.beforeCursor || ec.afterCursor) {
      editorParts.push(`\nText surrounding the cursor:`);
      if (ec.beforeCursor) {
        editorParts.push(`<before_cursor>\n...${ec.beforeCursor}\n</before_cursor>`);
      }
      editorParts.push(`[CURSOR]`);
      if (ec.afterCursor) {
        editorParts.push(`<after_cursor>\n${ec.afterCursor}...\n</after_cursor>`);
      }
    }

    editorParts.push(`--- End Editor Context ---`);

    parts.push(editorParts.join("\n"));
  }

  return parts.join("\n");
}

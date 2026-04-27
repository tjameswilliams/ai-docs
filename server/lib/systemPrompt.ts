interface EditorContext {
  cursorLine: number;
  cursorPos: number;
  selectedText: string;
  beforeCursor: string;
  afterCursor: string;
  headingPath: string[];
}

interface PlanStepContext {
  id: string;
  title: string;
  description: string | null;
  status: string;
  substeps?: PlanStepContext[];
}

interface ActivePlanContext {
  id: string;
  title: string;
  description: string | null;
  status: string;
  steps: PlanStepContext[];
}

interface SystemPromptContext {
  projectName?: string;
  folders?: Array<{ id: string; name: string; parentId: string | null }>;
  documents?: Array<{ id: string; title: string; folderId: string | null; wordCount: number | null }>;
  activeDocumentId?: string;
  activeDocumentTitle?: string;
  editorContext?: EditorContext;
  styleGuide?: string;
  activePlan?: ActivePlanContext;
  chatMode?: "chat" | "plan";
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
- Create and manage structured project plans with step-by-step execution tracking

When a user describes a large or multi-step project, offer to create a structured plan first using create_plan. Generate clear, actionable steps with sub-steps where appropriate. The plan starts in "draft" status — present it to the user and discuss refinements before they approve it. Do NOT begin executing plan steps while the plan is in "draft" status. Once the user approves, transition the plan to "in_progress" and work through steps sequentially, marking each as "in_progress" when you start it and "completed" when done.

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

  // Active plan context
  if (ctx.activePlan) {
    const plan = ctx.activePlan;
    const planParts: string[] = [];
    planParts.push(`\n--- Active Plan ---`);
    planParts.push(`Plan: "${plan.title}" (${plan.status})`);
    if (plan.description) planParts.push(plan.description);
    planParts.push("");

    let totalSteps = 0;
    let completedSteps = 0;

    const statusIcon = (s: string) => {
      if (s === "completed") return "[x]";
      if (s === "in_progress") return "[>]";
      if (s === "skipped") return "[-]";
      return "[ ]";
    };

    planParts.push("Steps:");
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      totalSteps++;
      if (step.status === "completed") completedSteps++;

      // Collapse completed step descriptions to save tokens
      const desc = step.status === "completed" ? "" : (step.description ? ` — ${step.description}` : "");
      planParts.push(`${statusIcon(step.status)} ${i + 1}. ${step.title}${desc} [${step.id}]`);

      if (step.substeps) {
        for (let j = 0; j < step.substeps.length; j++) {
          const sub = step.substeps[j];
          totalSteps++;
          if (sub.status === "completed") completedSteps++;
          const subDesc = sub.status === "completed" ? "" : (sub.description ? ` — ${sub.description}` : "");
          planParts.push(`   ${statusIcon(sub.status)} ${i + 1}.${j + 1}. ${sub.title}${subDesc} [${sub.id}]`);
        }
      }
    }

    planParts.push(`\nProgress: ${completedSteps}/${totalSteps} steps completed`);

    if (plan.status === "draft") {
      planParts.push(`\nThis plan is in DRAFT status. Help the user review and refine it. Ask for feedback, suggest improvements, and use plan tools to modify. Do NOT start executing the steps until the user approves the plan.`);
    } else if (plan.status === "approved" || plan.status === "in_progress") {
      planParts.push(`\nWork through the steps sequentially. Mark each step as "in_progress" when you start it and "completed" when done. Always tell the user which step you're working on.

IMPORTANT: After completing the final step, you MUST:
1. Mark that last step as "completed" using update_plan_step
2. Mark the overall plan as "completed" using update_plan
Do NOT finish your response without marking completed steps — this is easy to forget on the last step.`);
    }

    planParts.push(`--- End Active Plan ---`);
    parts.push(planParts.join("\n"));
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

  // Plan mode instructions
  if (ctx.chatMode === "plan") {
    parts.push(`\n--- PLAN MODE ACTIVE ---
You are in PLAN MODE. In this mode you are a planning assistant. Your role is to help the user think through their project, break it down into steps, and create a structured plan.

IMPORTANT RULES IN PLAN MODE:
- Do NOT execute any document, folder, or web tools. Only use plan tools (create_plan, update_plan, add_plan_steps, update_plan_step, remove_plan_steps, get_plan).
- Focus on understanding the user's goals, asking clarifying questions, and building a comprehensive step-by-step plan.
- Think critically about the order of steps, dependencies, and potential challenges.
- Suggest alternative approaches when relevant.
- When the user is satisfied with the plan, tell them to switch to Chat mode to begin execution.
--- END PLAN MODE ---`);
  }

  return parts.join("\n");
}

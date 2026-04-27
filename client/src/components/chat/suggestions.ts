import type { IconName } from "../ui";
import type { Document, Plan, Project } from "../../types";

export interface Suggestion {
  icon: IconName;
  label: string;
  prompt: string;
}

interface SuggestionContext {
  project: Project | null;
  activeDocument: Document | null;
  hasSelection: boolean;
  selectedSnippet: string;
  activePlan: Plan | null;
  hasMessages: boolean;
}

// Returns a list of context-aware starter prompts.
// Pure function; reads from store snapshot at call site.
export function getSuggestions(ctx: SuggestionContext): Suggestion[] {
  const { project, activeDocument, hasSelection, selectedSnippet, activePlan, hasMessages } = ctx;

  // Selection in the editor — selection-aware actions take priority
  if (activeDocument && hasSelection && selectedSnippet.trim().length > 0) {
    return [
      { icon: "wand", label: "Rewrite", prompt: "Rewrite the selected passage to be clearer and more concise." },
      { icon: "type", label: "Fix grammar", prompt: "Proofread the selected text and fix any grammar or spelling issues." },
      { icon: "sparkle", label: "Expand", prompt: "Expand the selected passage with more detail and supporting points." },
      { icon: "hash", label: "Cite", prompt: "Suggest citations or sources that would back up the claims in the selected text." },
    ];
  }

  // Active plan (draft) — push approval flow
  if (activePlan && activePlan.status === "draft") {
    return [
      { icon: "check-circle", label: "Approve plan", prompt: "Approve the plan and start executing." },
      { icon: "pencil", label: "Revise plan", prompt: "Revise the plan — give me a step-by-step list of changes." },
    ];
  }

  // Active document, no selection — writing-flow prompts
  if (activeDocument) {
    return [
      { icon: "wand", label: "Continue writing", prompt: "Continue writing this document from where the cursor is." },
      { icon: "type", label: "Improve intro", prompt: "Rewrite the introduction to be more compelling." },
      { icon: "math", label: "Outline", prompt: "Generate an outline for the rest of this document." },
      { icon: "hash", label: "Add headings", prompt: "Add appropriate section headings to organize this document." },
    ];
  }

  // Project loaded, no document — project-level actions
  if (project) {
    return [
      { icon: "file-plus", label: "New document", prompt: "Create a new document called 'Getting Started'." },
      { icon: "search", label: "Project summary", prompt: "Summarize what's in this project so far." },
      { icon: "folder-plus", label: "Folder structure", prompt: "Suggest a folder structure for organizing the documents." },
      { icon: "wand", label: "Outline a post", prompt: "Help me outline a blog post about a topic of my choice." },
    ];
  }

  // No project — fallback (rare; ChatPane usually doesn't render in this state)
  if (!hasMessages) {
    return [
      { icon: "folder-plus", label: "New project", prompt: "Walk me through creating a project and adding a document." },
    ];
  }

  return [];
}

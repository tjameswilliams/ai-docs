import { executeFolderTool, folderToolDefinitions } from "./folders";
import { executeDocumentTool, documentToolDefinitions } from "./documents";
import { executeSearchTool, searchToolDefinitions } from "./search";
import { executeQueryTool, queryToolDefinitions } from "./query";
import { executeWebTool, webToolDefinitions } from "./web";
import { executeReferenceTool, referenceToolDefinitions } from "./references";

export function getToolDefinitions() {
  return [
    ...folderToolDefinitions,
    ...documentToolDefinitions,
    ...searchToolDefinitions,
    ...queryToolDefinitions,
    ...webToolDefinitions,
    ...referenceToolDefinitions,
  ];
}

export function getToolNames(): string[] {
  return getToolDefinitions().map((t) => t.function.name);
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  undoContext?: { groupId: string; seq: number }
): Promise<{ success: boolean; result: unknown }> {
  try {
    // Inject projectId if not provided
    if (!args.project_id) args.project_id = projectId;

    // Route to appropriate handler
    const folderTools = folderToolDefinitions.map((t) => t.function.name);
    const documentTools = documentToolDefinitions.map((t) => t.function.name);
    const searchTools = searchToolDefinitions.map((t) => t.function.name);
    const queryTools = queryToolDefinitions.map((t) => t.function.name);
    const webTools = webToolDefinitions.map((t) => t.function.name);
    const refTools = referenceToolDefinitions.map((t) => t.function.name);

    if (folderTools.includes(name)) {
      return await executeFolderTool(name, args, projectId, undoContext);
    }
    if (documentTools.includes(name)) {
      return await executeDocumentTool(name, args, projectId, undoContext);
    }
    if (searchTools.includes(name)) {
      return await executeSearchTool(name, args, projectId);
    }
    if (queryTools.includes(name)) {
      return await executeQueryTool(name, args, projectId);
    }
    if (webTools.includes(name)) {
      return await executeWebTool(name, args);
    }
    if (refTools.includes(name)) {
      return await executeReferenceTool(name, args, projectId);
    }

    return { success: false, result: `Unknown tool: ${name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, result: `Tool error: ${message}` };
  }
}

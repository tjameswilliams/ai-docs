import { db, schema } from "../../db/client";
import { eq, and } from "drizzle-orm";
import { newId } from "../nanoid";
import { recordEvent } from "../undoManager";

type UndoCtx = { groupId: string; seq: number } | undefined;

async function record(ctx: UndoCtx, projectId: string, entityId: string, action: "create" | "update" | "delete", before: any, after: any, desc: string) {
  if (!ctx) return;
  await recordEvent({
    projectId,
    batchId: ctx.groupId,
    sequence: ctx.seq,
    entityType: "folders",
    entityId,
    action,
    beforeJson: before ? JSON.stringify(before) : undefined,
    afterJson: after ? JSON.stringify(after) : undefined,
    source: "chat",
    description: desc,
  });
}

export const folderToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "create_folder",
      description: "Create a new folder in the project. Can be a root folder or nested inside another folder.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Folder name" },
          parent_id: { type: "string", description: "Parent folder ID (optional, creates root folder if omitted)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "rename_folder",
      description: "Rename an existing folder.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string" },
          name: { type: "string" },
        },
        required: ["folder_id", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_folder",
      description: "Delete a folder and all its contents (subfolders and documents).",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string" },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "move_folder",
      description: "Move a folder to a new parent folder (or to root).",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string" },
          parent_id: { type: "string", description: "New parent folder ID, or null/empty to move to root" },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_folders",
      description: "List all folders in the project with their hierarchy.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function executeFolderTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string,
  undoContext?: UndoCtx
): Promise<{ success: boolean; result: unknown }> {
  const now = new Date().toISOString();

  switch (name) {
    case "create_folder": {
      const id = newId();
      await db.insert(schema.folders).values({
        id,
        projectId,
        parentId: (args.parent_id as string) || null,
        name: (args.name as string) || "New Folder",
        order: 0,
        createdAt: now,
        updatedAt: now,
      });
      const [folder] = await db.select().from(schema.folders).where(eq(schema.folders.id, id));
      await record(undoContext, projectId, id, "create", null, folder, `Created folder "${folder.name}"`);
      return { success: true, result: { message: `Created folder "${folder.name}"`, folder } };
    }

    case "rename_folder": {
      const renameId = args.folder_id as string;
      const [beforeRename] = await db.select().from(schema.folders).where(eq(schema.folders.id, renameId));
      await db.update(schema.folders)
        .set({ name: args.name as string, updatedAt: now })
        .where(eq(schema.folders.id, renameId));
      const [folder] = await db.select().from(schema.folders).where(eq(schema.folders.id, renameId));
      await record(undoContext, projectId, renameId, "update", beforeRename, folder, `Renamed folder to "${folder.name}"`);
      return { success: true, result: { message: `Renamed folder to "${folder.name}"`, folder } };
    }

    case "delete_folder": {
      const delId = args.folder_id as string;
      const [beforeDel] = await db.select().from(schema.folders).where(eq(schema.folders.id, delId));
      await db.delete(schema.folders).where(eq(schema.folders.id, delId));
      await record(undoContext, projectId, delId, "delete", beforeDel, null, `Deleted folder "${beforeDel?.name}"`);
      return { success: true, result: { message: "Folder deleted" } };
    }

    case "move_folder": {
      const moveId = args.folder_id as string;
      const [beforeMove] = await db.select().from(schema.folders).where(eq(schema.folders.id, moveId));
      const parentId = args.parent_id ? (args.parent_id as string) : null;
      await db.update(schema.folders)
        .set({ parentId, updatedAt: now })
        .where(eq(schema.folders.id, moveId));
      const [afterMove] = await db.select().from(schema.folders).where(eq(schema.folders.id, moveId));
      await record(undoContext, projectId, moveId, "update", beforeMove, afterMove, `Moved folder "${beforeMove?.name}"`);
      return { success: true, result: { message: `Folder moved` } };
    }

    case "list_folders": {
      const folders = await db.select().from(schema.folders).where(eq(schema.folders.projectId, projectId));
      return { success: true, result: { folders } };
    }

    default:
      return { success: false, result: `Unknown folder tool: ${name}` };
  }
}

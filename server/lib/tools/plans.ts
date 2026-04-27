import { db, schema } from "../../db/client";
import { eq, and, notInArray } from "drizzle-orm";
import { newId } from "../nanoid";

export const planToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "create_plan",
      description:
        "Create a structured project plan with steps. Use this when the user describes a large or multi-step project. The plan starts in 'draft' status for the user to review and refine before execution.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Plan title" },
          description: {
            type: "string",
            description: "Overall goal/description of the plan",
          },
          steps: {
            type: "array",
            description: "Ordered list of plan steps",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Step title" },
                description: {
                  type: "string",
                  description: "Detailed description of what to do",
                },
                substeps: {
                  type: "array",
                  description: "Optional sub-steps",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                    },
                    required: ["title"],
                  },
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "steps"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_plan",
      description:
        "Update a plan's title, description, or status. Use this to transition a plan from draft to approved (after user confirms), approved to in_progress (when starting work), or in_progress to completed (when all steps are done).",
      parameters: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan ID" },
          title: { type: "string", description: "New title" },
          description: { type: "string", description: "New description" },
          status: {
            type: "string",
            enum: ["draft", "approved", "in_progress", "completed", "archived"],
            description: "New status",
          },
        },
        required: ["plan_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_plan_steps",
      description: "Add one or more steps to an existing plan. Used during plan refinement.",
      parameters: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan ID" },
          steps: {
            type: "array",
            description: "Steps to add",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                parent_id: {
                  type: "string",
                  description: "Parent step ID if this is a sub-step",
                },
                order: {
                  type: "number",
                  description: "Sort order (0-based)",
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["plan_id", "steps"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_plan_step",
      description:
        "Update a plan step's title, description, or status. Use this to mark steps as in_progress when starting work and completed when done.",
      parameters: {
        type: "object",
        properties: {
          step_id: { type: "string", description: "Step ID" },
          title: { type: "string" },
          description: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "skipped"],
          },
        },
        required: ["step_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_plan_steps",
      description: "Remove one or more steps from a plan by their IDs.",
      parameters: {
        type: "object",
        properties: {
          step_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs of steps to remove",
          },
        },
        required: ["step_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_plan",
      description:
        "Get the active plan for the current project with all steps and their statuses.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

/**
 * Auto-complete a plan if all its steps are completed or skipped.
 * Returns true if the plan was auto-completed, false otherwise.
 */
export async function autoCompletePlanIfDone(projectId: string): Promise<boolean> {
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.projectId, projectId),
        notInArray(schema.plans.status, ["completed", "archived", "draft"])
      )
    );
  if (!plan) return false;

  const steps = await db
    .select()
    .from(schema.planSteps)
    .where(eq(schema.planSteps.planId, plan.id));

  if (steps.length === 0) return false;

  const allDone = steps.every((s) => s.status === "completed" || s.status === "skipped");
  if (!allDone) return false;

  await db
    .update(schema.plans)
    .set({ status: "completed", updatedAt: new Date().toISOString() })
    .where(eq(schema.plans.id, plan.id));
  return true;
}

// Helper: build nested step tree
function nestSteps(rows: (typeof schema.planSteps.$inferSelect)[]) {
  const topLevel = rows.filter((s) => !s.parentId).sort((a, b) => a.order - b.order);
  return topLevel.map((step) => ({
    ...step,
    substeps: rows
      .filter((s) => s.parentId === step.id)
      .sort((a, b) => a.order - b.order),
  }));
}

export async function executePlanTool(
  name: string,
  args: Record<string, unknown>,
  projectId: string
): Promise<{ success: boolean; result: unknown }> {
  const now = new Date().toISOString();

  switch (name) {
    case "create_plan": {
      const title = args.title as string;
      const description = (args.description as string) || "";
      const steps = (args.steps as Array<{
        title: string;
        description?: string;
        substeps?: Array<{ title: string; description?: string }>;
      }>) || [];

      // Archive any existing active plan
      const existing = await db
        .select()
        .from(schema.plans)
        .where(
          and(
            eq(schema.plans.projectId, projectId),
            notInArray(schema.plans.status, ["completed", "archived"])
          )
        );
      for (const old of existing) {
        await db
          .update(schema.plans)
          .set({ status: "archived", updatedAt: now })
          .where(eq(schema.plans.id, old.id));
      }

      const planId = newId();
      await db.insert(schema.plans).values({
        id: planId,
        projectId,
        title,
        description,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });

      const createdSteps: { id: string; title: string; order: number }[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = newId();
        await db.insert(schema.planSteps).values({
          id: stepId,
          planId,
          parentId: null,
          title: step.title,
          description: step.description || "",
          status: "pending",
          order: i,
          createdAt: now,
          updatedAt: now,
        });
        createdSteps.push({ id: stepId, title: step.title, order: i });

        if (step.substeps) {
          for (let j = 0; j < step.substeps.length; j++) {
            const sub = step.substeps[j];
            const subId = newId();
            await db.insert(schema.planSteps).values({
              id: subId,
              planId,
              parentId: stepId,
              title: sub.title,
              description: sub.description || "",
              status: "pending",
              order: j,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }

      return {
        success: true,
        result: {
          planId,
          title,
          status: "draft",
          stepsCreated: createdSteps.length,
          message:
            "Plan created in draft status. Present it to the user for review. They can refine it before approving.",
        },
      };
    }

    case "update_plan": {
      const planId = args.plan_id as string;
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;

      await db.update(schema.plans).set(updates).where(eq(schema.plans.id, planId));
      return { success: true, result: { planId, ...updates } };
    }

    case "add_plan_steps": {
      const planId = args.plan_id as string;
      const steps = args.steps as Array<{
        title: string;
        description?: string;
        parent_id?: string;
        order?: number;
      }>;

      const created: { id: string; title: string }[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepId = newId();
        await db.insert(schema.planSteps).values({
          id: stepId,
          planId,
          parentId: step.parent_id || null,
          title: step.title,
          description: step.description || "",
          status: "pending",
          order: step.order ?? i,
          createdAt: now,
          updatedAt: now,
        });
        created.push({ id: stepId, title: step.title });
      }

      return { success: true, result: { added: created } };
    }

    case "update_plan_step": {
      const stepId = args.step_id as string;
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.status !== undefined) updates.status = args.status;

      await db
        .update(schema.planSteps)
        .set(updates)
        .where(eq(schema.planSteps.id, stepId));
      return { success: true, result: { stepId, ...updates } };
    }

    case "remove_plan_steps": {
      const stepIds = args.step_ids as string[];
      for (const id of stepIds) {
        await db.delete(schema.planSteps).where(eq(schema.planSteps.id, id));
      }
      return { success: true, result: { removed: stepIds.length } };
    }

    case "get_plan": {
      const [plan] = await db
        .select()
        .from(schema.plans)
        .where(
          and(
            eq(schema.plans.projectId, projectId),
            notInArray(schema.plans.status, ["completed", "archived"])
          )
        );
      if (!plan) {
        return { success: true, result: { plan: null, message: "No active plan" } };
      }

      const steps = await db
        .select()
        .from(schema.planSteps)
        .where(eq(schema.planSteps.planId, plan.id));

      return { success: true, result: { ...plan, steps: nestSteps(steps) } };
    }

    default:
      return { success: false, result: `Unknown plan tool: ${name}` };
  }
}

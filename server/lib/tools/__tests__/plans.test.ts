import { describe, test, expect, beforeAll, afterEach } from "bun:test";
import { createTestProject, db, schema, eq } from "../../../__tests__/testHelper";
import { executePlanTool, autoCompletePlanIfDone } from "../plans";

let projectId: string;

beforeAll(async () => {
  projectId = await createTestProject("Plan Tools Test");
});

afterEach(async () => {
  // Clean up plans and steps
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.projectId, projectId));
  for (const plan of plans) {
    await db.delete(schema.planSteps).where(eq(schema.planSteps.planId, plan.id));
    await db.delete(schema.plans).where(eq(schema.plans.id, plan.id));
  }
});

describe("create_plan", () => {
  test("creates a plan with steps", async () => {
    const result = await executePlanTool("create_plan", {
      title: "Test Plan",
      description: "A test plan",
      steps: [
        { title: "Step 1", description: "Do first thing" },
        { title: "Step 2", description: "Do second thing" },
      ],
    }, projectId);

    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.title).toBe("Test Plan");
    expect(data.status).toBe("draft");
    expect(data.stepsCreated).toBe(2);
  });

  test("creates plan with substeps", async () => {
    const result = await executePlanTool("create_plan", {
      title: "Nested Plan",
      steps: [
        {
          title: "Step 1",
          substeps: [
            { title: "Sub 1a" },
            { title: "Sub 1b" },
          ],
        },
      ],
    }, projectId);

    expect(result.success).toBe(true);
    // Verify substeps were created
    const planId = (result.result as any).planId;
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    expect(steps.length).toBe(3); // 1 parent + 2 substeps
    const substeps = steps.filter((s) => s.parentId !== null);
    expect(substeps.length).toBe(2);
  });

  test("archives existing active plans when creating new one", async () => {
    // Create first plan
    const first = await executePlanTool("create_plan", {
      title: "First Plan",
      steps: [{ title: "Step" }],
    }, projectId);
    const firstId = (first.result as any).planId;

    // Create second plan - first should be archived
    await executePlanTool("create_plan", {
      title: "Second Plan",
      steps: [{ title: "Step" }],
    }, projectId);

    const [firstPlan] = await db.select().from(schema.plans).where(eq(schema.plans.id, firstId));
    expect(firstPlan.status).toBe("archived");
  });
});

describe("update_plan", () => {
  test("updates plan title", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Original",
      steps: [{ title: "Step" }],
    }, projectId);
    const planId = (create.result as any).planId;

    const result = await executePlanTool("update_plan", {
      plan_id: planId,
      title: "Updated Title",
    }, projectId);
    expect(result.success).toBe(true);

    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    expect(plan.title).toBe("Updated Title");
  });

  test("updates plan status", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Status Plan",
      steps: [{ title: "Step" }],
    }, projectId);
    const planId = (create.result as any).planId;

    await executePlanTool("update_plan", {
      plan_id: planId,
      status: "approved",
    }, projectId);

    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    expect(plan.status).toBe("approved");
  });
});

describe("add_plan_steps", () => {
  test("adds steps to an existing plan", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Add Steps Plan",
      steps: [{ title: "Initial Step" }],
    }, projectId);
    const planId = (create.result as any).planId;

    const result = await executePlanTool("add_plan_steps", {
      plan_id: planId,
      steps: [
        { title: "New Step 1" },
        { title: "New Step 2" },
      ],
    }, projectId);

    expect(result.success).toBe(true);
    expect((result.result as any).added.length).toBe(2);

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    expect(steps.length).toBe(3);
  });

  test("adds substeps with parent_id", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Substep Plan",
      steps: [{ title: "Parent Step" }],
    }, projectId);
    const planId = (create.result as any).planId;

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    const parentId = steps[0].id;

    const result = await executePlanTool("add_plan_steps", {
      plan_id: planId,
      steps: [{ title: "Child Step", parent_id: parentId }],
    }, projectId);

    expect(result.success).toBe(true);
    const allSteps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    const child = allSteps.find((s) => s.parentId === parentId);
    expect(child).toBeDefined();
    expect(child!.title).toBe("Child Step");
  });
});

describe("update_plan_step", () => {
  test("updates step status", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Step Update Plan",
      steps: [{ title: "My Step" }],
    }, projectId);
    const planId = (create.result as any).planId;
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    const stepId = steps[0].id;

    const result = await executePlanTool("update_plan_step", {
      step_id: stepId,
      status: "completed",
    }, projectId);
    expect(result.success).toBe(true);

    const [updated] = await db.select().from(schema.planSteps).where(eq(schema.planSteps.id, stepId));
    expect(updated.status).toBe("completed");
  });

  test("updates step title and description", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Edit Step Plan",
      steps: [{ title: "Old Title" }],
    }, projectId);
    const planId = (create.result as any).planId;
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));

    await executePlanTool("update_plan_step", {
      step_id: steps[0].id,
      title: "New Title",
      description: "New desc",
    }, projectId);

    const [updated] = await db.select().from(schema.planSteps).where(eq(schema.planSteps.id, steps[0].id));
    expect(updated.title).toBe("New Title");
    expect(updated.description).toBe("New desc");
  });
});

describe("remove_plan_steps", () => {
  test("removes steps by id", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Remove Steps Plan",
      steps: [{ title: "Keep" }, { title: "Remove" }],
    }, projectId);
    const planId = (create.result as any).planId;
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    const removeId = steps.find((s) => s.title === "Remove")!.id;

    const result = await executePlanTool("remove_plan_steps", {
      step_ids: [removeId],
    }, projectId);

    expect(result.success).toBe(true);
    expect((result.result as any).removed).toBe(1);

    const remaining = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    expect(remaining.length).toBe(1);
    expect(remaining[0].title).toBe("Keep");
  });
});

describe("get_plan", () => {
  test("returns active plan with nested steps", async () => {
    await executePlanTool("create_plan", {
      title: "Get Plan Test",
      description: "Test desc",
      steps: [
        {
          title: "Step 1",
          substeps: [{ title: "Sub 1" }],
        },
        { title: "Step 2" },
      ],
    }, projectId);

    const result = await executePlanTool("get_plan", {}, projectId);
    expect(result.success).toBe(true);
    const data = result.result as any;
    expect(data.title).toBe("Get Plan Test");
    expect(data.steps.length).toBe(2);
    expect(data.steps[0].substeps.length).toBe(1);
    expect(data.steps[0].substeps[0].title).toBe("Sub 1");
  });

  test("returns null when no active plan", async () => {
    // afterEach cleans up plans, so this should be empty
    const result = await executePlanTool("get_plan", {}, projectId);
    expect(result.success).toBe(true);
    expect((result.result as any).plan).toBeNull();
  });

  test("does not return completed or archived plans", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Completed Plan",
      steps: [{ title: "Step" }],
    }, projectId);
    const planId = (create.result as any).planId;

    await executePlanTool("update_plan", {
      plan_id: planId,
      status: "completed",
    }, projectId);

    const result = await executePlanTool("get_plan", {}, projectId);
    expect((result.result as any).plan).toBeNull();
  });
});

describe("autoCompletePlanIfDone", () => {
  test("auto-completes plan when all steps are completed", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Auto Complete Plan",
      steps: [{ title: "Step 1" }, { title: "Step 2" }],
    }, projectId);
    const planId = (create.result as any).planId;

    // Move to in_progress
    await executePlanTool("update_plan", { plan_id: planId, status: "in_progress" }, projectId);

    // Mark all steps completed
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    for (const step of steps) {
      await executePlanTool("update_plan_step", { step_id: step.id, status: "completed" }, projectId);
    }

    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(true);

    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    expect(plan.status).toBe("completed");
  });

  test("auto-completes when steps are mix of completed and skipped", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Mixed Status Plan",
      steps: [{ title: "Done" }, { title: "Skipped" }],
    }, projectId);
    const planId = (create.result as any).planId;
    await executePlanTool("update_plan", { plan_id: planId, status: "in_progress" }, projectId);

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    await executePlanTool("update_plan_step", { step_id: steps[0].id, status: "completed" }, projectId);
    await executePlanTool("update_plan_step", { step_id: steps[1].id, status: "skipped" }, projectId);

    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(true);
  });

  test("does not auto-complete when steps are still pending", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Incomplete Plan",
      steps: [{ title: "Done" }, { title: "Pending" }],
    }, projectId);
    const planId = (create.result as any).planId;
    await executePlanTool("update_plan", { plan_id: planId, status: "in_progress" }, projectId);

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    await executePlanTool("update_plan_step", { step_id: steps[0].id, status: "completed" }, projectId);
    // steps[1] remains pending

    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(false);

    const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.id, planId));
    expect(plan.status).toBe("in_progress");
  });

  test("does not auto-complete when step is in_progress", async () => {
    const create = await executePlanTool("create_plan", {
      title: "WIP Plan",
      steps: [{ title: "Working" }],
    }, projectId);
    const planId = (create.result as any).planId;
    await executePlanTool("update_plan", { plan_id: planId, status: "in_progress" }, projectId);

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    await executePlanTool("update_plan_step", { step_id: steps[0].id, status: "in_progress" }, projectId);

    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(false);
  });

  test("does not auto-complete draft plans", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Draft Plan",
      steps: [{ title: "Step" }],
    }, projectId);
    const planId = (create.result as any).planId;
    // Plan is in draft — mark step complete but don't approve
    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));
    await executePlanTool("update_plan_step", { step_id: steps[0].id, status: "completed" }, projectId);

    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(false);
  });

  test("returns false when no active plan exists", async () => {
    const result = await autoCompletePlanIfDone(projectId);
    expect(result).toBe(false);
  });

  test("handles substeps correctly", async () => {
    const create = await executePlanTool("create_plan", {
      title: "Substep Plan",
      steps: [
        { title: "Parent", substeps: [{ title: "Child 1" }, { title: "Child 2" }] },
      ],
    }, projectId);
    const planId = (create.result as any).planId;
    await executePlanTool("update_plan", { plan_id: planId, status: "in_progress" }, projectId);

    const steps = await db.select().from(schema.planSteps).where(eq(schema.planSteps.planId, planId));

    // Complete parent but not children — should not auto-complete
    const parent = steps.find((s) => !s.parentId)!;
    await executePlanTool("update_plan_step", { step_id: parent.id, status: "completed" }, projectId);
    expect(await autoCompletePlanIfDone(projectId)).toBe(false);

    // Complete all children too
    const children = steps.filter((s) => s.parentId);
    for (const child of children) {
      await executePlanTool("update_plan_step", { step_id: child.id, status: "completed" }, projectId);
    }
    expect(await autoCompletePlanIfDone(projectId)).toBe(true);
  });
});

describe("unknown tool", () => {
  test("returns failure for unknown tool name", async () => {
    const result = await executePlanTool("nonexistent", {}, projectId);
    expect(result.success).toBe(false);
  });
});

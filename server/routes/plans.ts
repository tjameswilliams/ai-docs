import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, and, notInArray } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// Helper: build nested step tree from flat rows
function nestSteps(rows: (typeof schema.planSteps.$inferSelect)[]) {
  const topLevel = rows.filter((s) => !s.parentId).sort((a, b) => a.order - b.order);
  return topLevel.map((step) => ({
    ...step,
    substeps: rows
      .filter((s) => s.parentId === step.id)
      .sort((a, b) => a.order - b.order),
  }));
}

// Get active plan for a project (not completed/archived)
app.get("/projects/:projectId/plans/active", async (c) => {
  const projectId = c.req.param("projectId");
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(
      and(
        eq(schema.plans.projectId, projectId),
        notInArray(schema.plans.status, ["completed", "archived"])
      )
    );
  if (!plan) return c.json(null);

  const steps = await db
    .select()
    .from(schema.planSteps)
    .where(eq(schema.planSteps.planId, plan.id));

  return c.json({ ...plan, steps: nestSteps(steps) });
});

// Get a specific plan with steps
app.get("/plans/:planId", async (c) => {
  const planId = c.req.param("planId");
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.id, planId));
  if (!plan) return c.json({ error: "Plan not found" }, 404);

  const steps = await db
    .select()
    .from(schema.planSteps)
    .where(eq(schema.planSteps.planId, plan.id));

  return c.json({ ...plan, steps: nestSteps(steps) });
});

// Create a new plan
app.post("/projects/:projectId/plans", async (c) => {
  const projectId = c.req.param("projectId");
  const body = await c.req.json();
  const now = new Date().toISOString();
  const planId = newId();

  await db.insert(schema.plans).values({
    id: planId,
    projectId,
    title: body.title,
    description: body.description || "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  // Insert steps if provided
  const createdSteps: { id: string; title: string; parentId: string | null }[] = [];
  if (body.steps && Array.isArray(body.steps)) {
    for (let i = 0; i < body.steps.length; i++) {
      const step = body.steps[i];
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
      createdSteps.push({ id: stepId, title: step.title, parentId: null });

      // Insert sub-steps
      if (step.substeps && Array.isArray(step.substeps)) {
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
          createdSteps.push({ id: subId, title: sub.title, parentId: stepId });
        }
      }
    }
  }

  return c.json({ id: planId, steps: createdSteps }, 201);
});

// Update plan metadata/status
app.put("/plans/:planId", async (c) => {
  const planId = c.req.param("planId");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;

  await db.update(schema.plans).set(updates).where(eq(schema.plans.id, planId));
  return c.json({ success: true });
});

// Delete plan
app.delete("/plans/:planId", async (c) => {
  const planId = c.req.param("planId");
  await db.delete(schema.plans).where(eq(schema.plans.id, planId));
  return c.json({ success: true });
});

// Add steps to a plan
app.post("/plans/:planId/steps", async (c) => {
  const planId = c.req.param("planId");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const steps = Array.isArray(body.steps) ? body.steps : [body];
  const created: { id: string; title: string }[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepId = newId();
    await db.insert(schema.planSteps).values({
      id: stepId,
      planId,
      parentId: step.parentId || null,
      title: step.title,
      description: step.description || "",
      status: "pending",
      order: step.order ?? i,
      createdAt: now,
      updatedAt: now,
    });
    created.push({ id: stepId, title: step.title });
  }

  return c.json({ steps: created }, 201);
});

// Update a step
app.put("/plans/:planId/steps/:stepId", async (c) => {
  const stepId = c.req.param("stepId");
  const body = await c.req.json();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.order !== undefined) updates.order = body.order;
  if (body.parentId !== undefined) updates.parentId = body.parentId;

  await db.update(schema.planSteps).set(updates).where(eq(schema.planSteps.id, stepId));
  return c.json({ success: true });
});

// Delete a step
app.delete("/plans/:planId/steps/:stepId", async (c) => {
  const stepId = c.req.param("stepId");
  await db.delete(schema.planSteps).where(eq(schema.planSteps.id, stepId));
  return c.json({ success: true });
});

export default app;

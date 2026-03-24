import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { mcpClientManager } from "../lib/mcp/clientManager";

const app = new Hono();

app.get("/mcp-servers", async (c) => {
  const rows = await db.select().from(schema.mcpServers);
  const connectedIds = mcpClientManager.getConnectedServerIds();
  const result = rows.map((r) => ({
    ...r,
    args: JSON.parse(r.args || "[]"),
    env: JSON.parse(r.env || "{}"),
    connected: connectedIds.includes(r.id),
    tools: mcpClientManager.getServerTools(r.id),
  }));
  return c.json(result);
});

app.post("/mcp-servers", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = newId();
  const row = {
    id,
    name: body.name,
    command: body.command,
    args: JSON.stringify(body.args || []),
    env: JSON.stringify(body.env || {}),
    enabled: body.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.mcpServers).values(row);
  if (row.enabled) {
    try {
      await mcpClientManager.connectServer(row);
    } catch (err) {
      return c.json({ ...row, connected: false, connectionError: (err as Error).message });
    }
  }
  return c.json({ ...row, connected: mcpClientManager.getConnectedServerIds().includes(id) });
});

app.patch("/mcp-servers/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.name !== undefined) updates.name = body.name;
  if (body.command !== undefined) updates.command = body.command;
  if (body.args !== undefined) updates.args = JSON.stringify(body.args);
  if (body.env !== undefined) updates.env = JSON.stringify(body.env);
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  await db.update(schema.mcpServers).set(updates).where(eq(schema.mcpServers.id, id));
  await mcpClientManager.refreshServer(id);
  const [row] = await db.select().from(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return c.json({ ...row, args: JSON.parse(row.args || "[]"), env: JSON.parse(row.env || "{}"), connected: mcpClientManager.getConnectedServerIds().includes(id) });
});

app.delete("/mcp-servers/:id", async (c) => {
  const { id } = c.req.param();
  await mcpClientManager.disconnectServer(id);
  await db.delete(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return c.json({ ok: true });
});

app.post("/mcp-servers/:id/test", async (c) => {
  const { id } = c.req.param();
  const [config] = await db.select().from(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  if (!config) return c.json({ success: false, error: "Not found" }, 404);
  try {
    await mcpClientManager.connectServer(config);
    const tools = mcpClientManager.getServerTools(id);
    if (!config.enabled) await mcpClientManager.disconnectServer(id);
    return c.json({ success: true, tools: tools?.map((t) => t.name) || [], toolCount: tools?.length || 0 });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message });
  }
});

app.post("/mcp-servers/:id/reconnect", async (c) => {
  const { id } = c.req.param();
  try {
    await mcpClientManager.refreshServer(id);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message });
  }
});

// Bulk import/export as JSON config (Cursor/LMStudio format)
// GET returns { mcpServers: { name: { command, args, env } } }
app.get("/mcp-servers/config", async (c) => {
  const rows = await db.select().from(schema.mcpServers);
  const config: Record<string, { command: string; args: string[]; env: Record<string, string>; disabled?: boolean }> = {};
  for (const r of rows) {
    config[r.name] = {
      command: r.command,
      args: JSON.parse(r.args || "[]"),
      env: JSON.parse(r.env || "{}"),
      ...(r.enabled ? {} : { disabled: true }),
    };
  }
  return c.json({ mcpServers: config });
});

// PUT replaces all servers with the provided JSON config
app.put("/mcp-servers/config", async (c) => {
  const body = await c.req.json();
  const mcpServers = body.mcpServers as Record<string, { command: string; args?: string[]; env?: Record<string, string>; disabled?: boolean }>;

  if (!mcpServers || typeof mcpServers !== "object") {
    return c.json({ error: "Expected { mcpServers: { name: { command, args?, env? } } }" }, 400);
  }

  // Disconnect all existing
  await mcpClientManager.disconnectAll();

  // Delete all existing
  const existing = await db.select().from(schema.mcpServers);
  for (const row of existing) {
    await db.delete(schema.mcpServers).where(eq(schema.mcpServers.id, row.id));
  }

  // Insert new
  const now = new Date().toISOString();
  const results: Array<{ name: string; connected: boolean; error?: string }> = [];

  for (const [name, config] of Object.entries(mcpServers)) {
    const id = newId();
    const enabled = !config.disabled;
    const row = {
      id,
      name,
      command: config.command,
      args: JSON.stringify(config.args || []),
      env: JSON.stringify(config.env || {}),
      enabled,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.mcpServers).values(row);

    if (enabled) {
      try {
        await mcpClientManager.connectServer(row);
        results.push({ name, connected: true });
      } catch (err) {
        results.push({ name, connected: false, error: (err as Error).message });
      }
    } else {
      results.push({ name, connected: false });
    }
  }

  return c.json({ success: true, servers: results });
});

export default app;

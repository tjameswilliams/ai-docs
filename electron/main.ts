import { app, BrowserWindow, Menu, dialog, nativeImage } from "electron";
import path from "path";
import net from "net";

// Set app name before any getPath calls to ensure unique userData directory
app.setName("AI Docs");

// Set dock icon on macOS (works in dev mode too)
const iconPath = path.join(__dirname, "..", "icons", "icon.png");
if (process.platform === "darwin" && app.dock) {
  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  } catch { /* icon file may not exist in some environments */ }
}

let mainWindow: BrowserWindow | null = null;
let server: any = null;

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        reject(new Error("Could not determine port"));
      }
    });
    srv.on("error", reject);
  });
}

async function startServer(port: number) {
  const dataDir = app.getPath("userData");

  // Set env for runtime adapter to pick up
  process.env.AI_DOCS_DATA_DIR = dataDir;

  // __dirname = electron/dist/, project root is 2 levels up
  const projectRoot = path.join(__dirname, "..", "..");

  const { app: honoApp } = await import("../server/index");

  // Serve the built client as static files
  const { serveStatic } = await import("@hono/node-server/serve-static");
  const clientDistPath = path.join(projectRoot, "client", "dist");

  honoApp.use("/*", serveStatic({ root: clientDistPath }));

  // SPA fallback
  honoApp.get("/*", async (c: any) => {
    const fs = await import("fs");
    const indexPath = path.join(clientDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.text("Client not built. Run: npm run build:client", 404);
  });

  const { serve } = await import("@hono/node-server");
  server = serve({ fetch: honoApp.fetch, port });
  console.log(`[electron] Server listening on http://localhost:${port}`);
  return port;
}

function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "AI Docs",
    icon: path.join(__dirname, "..", "icons", "icon.icns"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "AI Docs",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  try {
    const port = await getAvailablePort();
    await startServer(port);
    createMenu();
    createWindow(port);
  } catch (err) {
    console.error("[electron] Failed to start:", err);
    dialog.showErrorBox(
      "AI Docs - Startup Error",
      `Failed to start the application:\n\n${err instanceof Error ? err.message : String(err)}`
    );
    app.quit();
  }
});

app.on("window-all-closed", async () => {
  if (server) { server.close(); server = null; }
  try { const { sqlite } = await import("../server/db/client"); sqlite.close(); } catch {}
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (mainWindow === null) {
    try {
      const port = await getAvailablePort();
      await startServer(port);
      createWindow(port);
    } catch (err) {
      console.error("[electron] Failed to reactivate:", err);
    }
  }
});

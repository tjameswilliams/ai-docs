import { useState, useEffect } from "react";
import { useStore } from "../store";
import { McpServersPane } from "./McpServersPane";

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);

  const [form, setForm] = useState({
    apiBaseUrl: "",
    apiKey: "",
    model: "",
    temperature: "0.7",
    maxOutputTokens: "16384",
    contextWindow: "",
    embeddingApiBaseUrl: "",
    embeddingApiKey: "",
    embeddingModel: "",
    braveSearchApiKey: "",
  });

  useEffect(() => {
    setForm({
      apiBaseUrl: settings.apiBaseUrl || "http://localhost:11434/v1",
      apiKey: settings.apiKey || "",
      model: settings.model || "llama3.2",
      temperature: settings.temperature || "0.7",
      maxOutputTokens: settings.maxOutputTokens || "16384",
      contextWindow: settings.contextWindow || "",
      embeddingApiBaseUrl: settings.embeddingApiBaseUrl || "",
      embeddingApiKey: settings.embeddingApiKey || "",
      embeddingModel: settings.embeddingModel || "",
      braveSearchApiKey: settings.braveSearchApiKey || "",
    });
  }, [settings]);

  const save = async () => {
    await updateSettings(form);
    setShowSettings(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[480px] max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">Settings</h2>

        <div className="space-y-4">
          <Section title="LLM Configuration">
            <Field label="API Base URL" value={form.apiBaseUrl} onChange={(v) => setForm({ ...form, apiBaseUrl: v })} />
            <Field label="API Key" value={form.apiKey} onChange={(v) => setForm({ ...form, apiKey: v })} type="password" />
            <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} />
            <div className="flex gap-3">
              <Field label="Temperature" value={form.temperature} onChange={(v) => setForm({ ...form, temperature: v })} />
              <Field label="Max Output Tokens" value={form.maxOutputTokens} onChange={(v) => setForm({ ...form, maxOutputTokens: v })} placeholder="16384" />
            </div>
            <Field label="Context Window" value={form.contextWindow} onChange={(v) => setForm({ ...form, contextWindow: v })} placeholder="Auto-detect (e.g. 128000)" />
          </Section>

          <Section title="Web Search">
            <Field label="Brave Search API Key" value={form.braveSearchApiKey} onChange={(v) => setForm({ ...form, braveSearchApiKey: v })} type="password" placeholder="Free at brave.com/search/api/ (2000 queries/mo)" />
          </Section>

          <Section title="MCP Servers (External Tools)">
            <McpServersPane />
          </Section>

          <Section title="Embeddings (Document Search)">
            <Field label="Embedding API Base URL" value={form.embeddingApiBaseUrl} onChange={(v) => setForm({ ...form, embeddingApiBaseUrl: v })} placeholder="Uses LLM API URL if empty" />
            <Field label="Embedding API Key" value={form.embeddingApiKey} onChange={(v) => setForm({ ...form, embeddingApiKey: v })} type="password" placeholder="Uses LLM API key if empty" />
            <Field label="Embedding Model" value={form.embeddingModel} onChange={(v) => setForm({ ...form, embeddingModel: v })} placeholder="text-embedding-3-small" />
          </Section>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm rounded bg-zinc-800 hover:bg-zinc-700">
            Cancel
          </button>
          <button onClick={save} className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-400 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 text-sm rounded bg-zinc-800 border border-zinc-700 focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

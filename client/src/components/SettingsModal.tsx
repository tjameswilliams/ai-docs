import { useState, useEffect } from "react";
import { useStore } from "../store";
import { McpServersPane } from "./McpServersPane";
import { Modal, Button, SectionLabel } from "./ui";

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
    <Modal
      open
      onClose={() => setShowSettings(false)}
      title="Settings"
      width={520}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" icon="check" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
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
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel className="mb-2">{title}</SectionLabel>
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
      <label className="block mb-1" style={{ fontSize: 10.5, color: "#71717a" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[5px] outline-none focus:border-[#3b82f6] placeholder-zinc-700"
        style={{
          height: 30,
          fontSize: 12.5,
          padding: "0 10px",
          background: "#1c1c20",
          border: "1px solid #27272a",
          color: "#e4e4e7",
        }}
      />
    </div>
  );
}

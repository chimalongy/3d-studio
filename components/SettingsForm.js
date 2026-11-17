"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const labels = {
  character_generation: "Character generation",
  scene_generation: "Three.js scene generation",
  animation: "Animation engine",
  frame_rendering: "Frame rendering",
  video_processing: "FFmpeg video processing"
};

function EyeIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.453-5.32" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

function CheckCircleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function AlertCircleIcon({ className = "w-4 h-4" }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12.01" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function SettingsForm({ initial }) {
  const router = useRouter();
  const [gemini, setGemini] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [hasKey, setHasKey] = useState(initial.hasGeminiKey);
  const [endpoints, setEndpoints] = useState(initial.endpoints || {});
  const [statusMessage, setStatusMessage] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);

  function change(key, value) {
    setEndpoints((old) => ({ ...old, [key]: value }));
  }

  async function save(e) {
    e.preventDefault();
    setStatusMessage({ type: "", text: "" });

    // Validate URLs client-side before sending
    for (const [key, url] of Object.entries(endpoints)) {
      const trimmed = String(url || "").trim();
      if (trimmed && !trimmed.startsWith("https://")) {
        setStatusMessage({
          type: "error",
          text: `"${labels[key] || key}" must be a valid HTTPS URL (starting with https://).`
        });
        return;
      }
    }

    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: gemini, endpoints })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to save settings");

      if (gemini) {
        setHasKey(true);
      }
      setGemini("");
      setShowGeminiKey(false);
      setStatusMessage({
        type: "success",
        text: "Settings saved successfully! Secrets are stored encrypted in your database."
      });
      router.refresh();
    } catch (err) {
      setStatusMessage({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="panel p-6 space-y-6">
      {statusMessage.text && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm ${
            statusMessage.type === "success"
              ? "bg-emerald-950/70 border border-emerald-800 text-emerald-200"
              : "bg-rose-950/70 border border-rose-800 text-rose-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircleIcon className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Gemini API</h2>
          {hasKey && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-full">
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" /> Active key configured
            </span>
          )}
        </div>
        <p className="text-xs muted">
          {hasKey
            ? "Your key is encrypted in Neon. Leave this field blank to keep your current key, or type a new one to replace it."
            : "Enter your Gemini API key to enable AI script and character generation."}
        </p>
        <div className="relative flex items-center">
          <input
            className="field pr-11 font-mono text-sm"
            type={showGeminiKey ? "text" : "password"}
            autoComplete="new-password"
            placeholder={
              hasKey
                ? "•••••••••••••••••••••••••••••••••••••••• (Key saved)"
                : "AIzaSy..."
            }
            value={gemini}
            onChange={(e) => setGemini(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowGeminiKey((prev) => !prev)}
            className="absolute right-3 text-slate-400 hover:text-slate-200 transition-colors focus:outline-none p-1"
            title={showGeminiKey ? "Hide API key" : "Show API key"}
            aria-label={showGeminiKey ? "Hide API key" : "Show API key"}
          >
            {showGeminiKey ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
          </button>
        </div>
      </section>

      <section className="space-y-4 pt-2 border-t border-slate-800">
        <div>
          <h2 className="font-semibold text-lg">Modal Endpoint URLs</h2>
          <p className="text-xs muted mt-1">
            Enter the HTTPS URLs from your Modal deployment.
          </p>
        </div>
        <div className="space-y-4">
          {Object.entries(labels).map(([key, label]) => (
            <label className="block text-sm" key={key}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-slate-300 font-medium">{label}</span>
                {endpoints[key] && endpoints[key].startsWith("https://") && (
                  <span className="text-[11px] text-emerald-400">✓ configured</span>
                )}
              </div>
              <input
                className="field font-mono text-xs"
                type="url"
                placeholder={`https://your-modal-app.modal.run/${key.replace(/_/g, "-")}`}
                value={endpoints[key] || ""}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function CharacterUpgradePoller({ characterId, status, vertexCount = 0 }) {
  const router = useRouter();
  const isSculpting = status === "sculpting" || vertexCount < 10000;
  
  const [seconds, setSeconds] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [finalStatus, setFinalStatus] = useState(null);
  const [visible, setVisible] = useState(isSculpting);

  // Timer counter
  useEffect(() => {
    if (!isSculpting || isFinished) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [isSculpting, isFinished]);

  // Polling server for completion
  useEffect(() => {
    if (!isSculpting || isFinished) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/characters/${characterId}`);
        if (res.ok && active) {
          const data = await res.json();
          const target = data.character || data;
          const currentStatus = target.versions?.[0]?.status;

          if (currentStatus === "completed" || currentStatus === "failed") {
            clearInterval(interval);
            setFinalStatus(currentStatus);
            setIsFinished(true);
            router.refresh();

            // Auto-dismiss the notifier completely after 3.5 seconds
            setTimeout(() => {
              if (active) setVisible(false);
            }, 3500);
          }
        }
      } catch {
        // Transient network error, retry next tick
      }
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [characterId, isSculpting, isFinished, router]);

  if (!visible) return null;

  if (isFinished) {
    return (
      <div className="flex items-center justify-between p-3.5 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 transition-all duration-500 animate-in fade-in">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          <span>
            {finalStatus === "failed" ? (
              <><strong>GPU generation failed.</strong> Check the generation logs and retry this character.</>
            ) : (
              <><strong>✓ Character generation complete!</strong> The final available GLB is loaded into the 3D viewport.</>
            )}
          </span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-emerald-400 hover:text-white text-xs underline ml-2"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-violet-950/70 via-indigo-950/50 to-slate-900/80 border border-violet-500/40 rounded-xl text-xs text-violet-200 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
        </span>
        <div>
          <span className="font-semibold text-white">High-Fidelity AI Sculpting in Progress</span>
          <span className="text-violet-300 ml-1.5 opacity-90">
            Tencent Hunyuan3D-2 is sculpting the 3D mesh on Modal GPU ({seconds}s elapsed)...
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-violet-400 bg-violet-900/40 px-2 py-0.5 rounded border border-violet-700/50">
          Procedural preview · waiting for GPU replacement
        </span>
        <button
          onClick={() => router.refresh()}
          className="px-2.5 py-1 bg-violet-800 hover:bg-violet-700 text-white rounded font-medium transition"
        >
          Check Now
        </button>
      </div>
    </div>
  );
}

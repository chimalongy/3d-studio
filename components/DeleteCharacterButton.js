"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteCharacterButton({
  characterId,
  characterName = "character",
  redirectTo = null,
  variant = "button", // "button" or "icon"
  className = ""
}) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete(e) {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `Are you sure you want to delete "${characterName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete character");
      }

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      alert(`Error deleting character: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        onClick={handleDelete}
        disabled={deleting}
        title={`Delete ${characterName}`}
        aria-label={`Delete ${characterName}`}
        className={`p-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-slate-400 hover:text-rose-400 hover:border-rose-800 hover:bg-rose-950/80 transition-all z-10 ${className}`}
      >
        {deleting ? (
          <span className="w-4 h-4 block rounded-full border-2 border-rose-400 border-t-transparent animate-spin" />
        ) : (
          <svg
            className="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" x2="10" y1="11" y2="17" />
            <line x1="14" x2="14" y1="11" y2="17" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className={`btn bg-rose-950/70 hover:bg-rose-900/90 text-rose-300 border border-rose-800 hover:border-rose-600 flex items-center gap-2 transition-all ${className}`}
    >
      {deleting ? (
        <>
          <span className="w-4 h-4 rounded-full border-2 border-rose-300 border-t-transparent animate-spin" />
          <span>Deleting…</span>
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          <span>Delete Character</span>
        </>
      )}
    </button>
  );
}


"use client";
import { useState } from "react";
export default function GenerateVideoForm({ projectId }) {
 const [prompt,setPrompt]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function submit(e){e.preventDefault();setBusy(true);setMessage("");try{const r=await fetch("/api/generation/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({projectId,prompt})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(`Workflow queued. Job ID: ${d.jobId}`);}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <form onSubmit={submit} className="panel p-6 space-y-4"><h2 className="text-xl font-semibold">Generate video</h2><textarea className="field min-h-36" value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe the story, visual style, key action and setting…" required/><button className="btn" disabled={busy}>{busy?"Starting workflow…":"Generate video"}</button>{message&&<p className="text-sm muted break-all">{message}</p>}</form>;
}
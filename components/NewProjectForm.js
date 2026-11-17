"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function NewProjectForm() {
  const [name,setName]=useState(""); const [prompt,setPrompt]=useState(""); const [error,setError]=useState(""); const [busy,setBusy]=useState(false); const router=useRouter();
  async function submit(e){e.preventDefault();setBusy(true);setError("");try{const r=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,prompt})});const d=await r.json();if(!r.ok)throw new Error(d.error);router.push(`/projects/${d.project.id}`);router.refresh();}catch(x){setError(x.message)}finally{setBusy(false)}}
  return <form onSubmit={submit} className="panel p-5 space-y-3"><h2 className="font-semibold">Start a project</h2><input className="field" placeholder="Project name" value={name} onChange={e=>setName(e.target.value)} required/><textarea className="field min-h-24" placeholder="What story do you want to tell?" value={prompt} onChange={e=>setPrompt(e.target.value)}/>{error&&<p className="text-sm text-red-300">{error}</p>}<button className="btn" disabled={busy}>{busy?"Creating…":"Create project"}</button></form>;
}
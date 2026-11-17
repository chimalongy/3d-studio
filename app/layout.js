import "./globals.css";
import Link from "next/link";

export const metadata = { title: "3D Video Studio", description: "Create reusable 3D characters and animated video projects." };

const nav = [
  ["/", "Overview"], ["/projects", "Projects"], ["/characters", "Characters"], ["/settings", "Settings"]
];

export default function RootLayout({ children }) {
  return <html lang="en"><body>
    <div className="min-h-screen md:flex">
      <aside className="w-full md:w-64 md:min-h-screen border-b md:border-b-0 md:border-r border-slate-800 p-5">
        <Link href="/" className="flex items-center gap-3 mb-9">
          <div className="h-10 w-10 rounded-xl bg-violet-500 grid place-items-center font-black">3D</div>
          <div><div className="font-bold tracking-tight">Video Studio</div><div className="text-xs muted">Production workspace</div></div>
        </Link>
        <nav className="flex md:flex-col gap-2">
          {nav.map(([href,label]) => <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">{label}</Link>)}
        </nav>
        <div className="hidden md:block mt-12 panel p-4 text-xs muted leading-5">Hybrid workflow<br/>Gemini · Trigger.dev · Modal · Neon</div>
      </aside>
      <main className="flex-1 min-w-0"><div className="max-w-6xl mx-auto p-5 md:p-9">{children}</div></main>
    </div>
  </body></html>;
}
import Link from "next/link";
import { getCharacters } from "../../lib/data";
import DeleteCharacterButton from "../../components/DeleteCharacterButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CharactersPage() {
  const characters = await getCharacters();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <p className="text-sm muted">ASSET LIBRARY</p>
          <h1 className="text-3xl font-bold mt-2">Characters</h1>
          <p className="muted mt-2">Reusable characters with versioned appearances.</p>
        </div>
        <Link className="btn" href="/characters/create">
          Create character
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {characters && characters.length > 0 ? (
          characters.map((c) => (
            <Link
              href={`/characters/${c.id}`}
              key={c.id}
              className="panel p-5 hover:border-violet-500/50 transition-colors block group"
            >
              <div className="h-40 rounded-xl bg-slate-900 overflow-hidden relative border border-slate-800">
                {c.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.preview_url}
                    alt={c.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-900/40 to-slate-900 grid place-items-center">
                    <span className="text-2xl font-bold text-violet-300">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                {c.latest_status && (
                  <span
                    className={`absolute top-2 right-2 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                      c.latest_status === "completed"
                        ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800"
                        : "bg-amber-950/90 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {c.latest_status}
                  </span>
                )}
                <DeleteCharacterButton
                  characterId={c.id}
                  characterName={c.name}
                  variant="icon"
                  className="absolute top-2 left-2 shadow-lg"
                />
              </div>
              <h2 className="font-semibold text-lg mt-4 group-hover:text-violet-300 transition-colors">
                {c.name}
              </h2>
              <p className="text-xs text-violet-300 mt-1 capitalize">
                {c.style} · v{c.current_version}
              </p>
              <p className="text-sm muted mt-3 line-clamp-2 leading-relaxed">
                {c.description}
              </p>
            </Link>
          ))
        ) : (
          <div className="panel p-8 muted text-sm col-span-full">
            Your character library is empty. Click &quot;Create character&quot; above to start.
          </div>
        )}
      </div>
    </div>
  );
}

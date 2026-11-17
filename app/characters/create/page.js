import CharacterForm from "../../../components/CharacterForm";
export default function CreateCharacterPage() {
  return <div className="max-w-3xl space-y-6"><div><p className="text-sm muted">CHARACTER STUDIO</p><h1 className="text-3xl font-bold mt-2">Create a character</h1><p className="muted mt-2">Describe the character. Gemini converts the brief into a structured specification, then your configured Modal character engine creates the 3D asset.</p></div><CharacterForm/></div>;
}
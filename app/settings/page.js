import { getSettingsForUI } from "../../lib/settings";
import SettingsForm from "../../components/SettingsForm";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const settings = await getSettingsForUI();
  return <div className="max-w-3xl space-y-6"><div><p className="text-sm muted">CONFIGURATION</p><h1 className="text-3xl font-bold mt-2">Settings</h1><p className="muted mt-2">Credentials are stored encrypted in Neon. Secret values are never returned to the browser.</p></div><SettingsForm initial={settings}/></div>;
}
import { sqlClient } from "./db.js";
import { encryptSecret, decryptSecret } from "./encryption.js";
const keys=["character_generation","scene_generation","animation","frame_rendering","video_processing"];
export async function getSettingsForUI(){
 const sql=sqlClient();
 const rows=await sql`SELECT setting_key, encrypted_value FROM app_settings WHERE setting_key='gemini_api_key'`;
 const endpoints=await sql`SELECT module_key, endpoint_url FROM modal_endpoints`;
 return {hasGeminiKey:rows.length>0,endpoints:Object.fromEntries(endpoints.map(x=>[x.module_key,x.endpoint_url]))};
}
export async function saveSettings(body){
 const sql=sqlClient();
 if(body.geminiApiKey){
  const encrypted=encryptSecret(body.geminiApiKey);
  await sql`INSERT INTO app_settings(setting_key,encrypted_value) VALUES('gemini_api_key',${encrypted}) ON CONFLICT(setting_key) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,updated_at=NOW()`;
 }
 for(const key of keys){
  const url=String(body.endpoints?.[key]||"").trim();
  if(url && !url.startsWith("https://")) throw new Error(`${key} endpoint must use HTTPS.`);
  await sql`INSERT INTO modal_endpoints(module_key,endpoint_url) VALUES(${key},${url}) ON CONFLICT(module_key) DO UPDATE SET endpoint_url=EXCLUDED.endpoint_url,updated_at=NOW()`;
 }
}
export async function getGeminiKey(){
 const sql=sqlClient();const rows=await sql`SELECT encrypted_value FROM app_settings WHERE setting_key='gemini_api_key'`;
 if(!rows.length) throw new Error("Add a Gemini API key in Settings first.");
 return decryptSecret(rows[0].encrypted_value);
}
export async function getModalEndpoints(){
 const sql=sqlClient();const rows=await sql`SELECT module_key,endpoint_url FROM modal_endpoints`;
 return Object.fromEntries(rows.map(x=>[x.module_key,x.endpoint_url]));
}
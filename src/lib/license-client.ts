import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type LicenseConfig = {
  url: string;
  serviceKey: string;
};

export function resolveLicenseManagerConfig(): LicenseConfig | null {
  const envUrl = process.env.LICENSE_SUPABASE_URL?.trim() || "";
  const envKey = process.env.LICENSE_SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (envUrl && envKey) {
    return { url: envUrl, serviceKey: envKey };
  }

  const htmlPath = path.resolve(process.cwd(), "..", "lisensi.html");
  if (!fs.existsSync(htmlPath)) {
    return null;
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const url = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1] || "";
  const serviceKey = html.match(/const SERVICE_KEY = '([^']+)'/)?.[1] || "";

  if (!url || !serviceKey) {
    return null;
  }

  return { url, serviceKey };
}

export function createLicenseManagerClient(): SupabaseClient | null {
  const config = resolveLicenseManagerConfig();
  if (!config) return null;

  return createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

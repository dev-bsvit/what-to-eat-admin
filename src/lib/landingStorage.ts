import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isLandingTableMissingError } from "@/lib/landingErrors";

const LANDING_TABLE_CANDIDATES = [
  "catalog_landings",
  "catalog_landing",
  "catalog_landing_pages",
  "cuisine_landings",
] as const;

export async function resolveLandingTable(): Promise<string | null> {
  for (const table of LANDING_TABLE_CANDIDATES) {
    const { error } = await supabaseAdmin
      .from(table)
      .select("*")
      .limit(1);

    if (!error) {
      return table;
    }

    if (!isLandingTableMissingError(error)) {
      return table;
    }
  }

  return null;
}

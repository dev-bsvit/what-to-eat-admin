export const LANDING_TABLE_MISSING_WARNING = "catalog_landings_table_missing";

type ErrorLike = {
  message?: string;
  code?: string;
} | null | undefined;

export function isLandingTableMissingError(error: ErrorLike): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toUpperCase();

  return (
    code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("catalog_landings")
  );
}

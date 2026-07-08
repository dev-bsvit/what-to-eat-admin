// Pure, dependency-free — safe to import from both server routes and
// "use client" pages (unlike blogContent.ts, which pulls in supabaseAdmin).
//
// Cyrillic must be transliterated, not stripped: the old slugify() let
// а-яё straight through unchanged, which is why some published posts ended
// up with raw Cyrillic (and therefore %D1%87...-encoded) URLs.
const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(value: string) {
  return value.replace(/[а-яё]/gi, (char) => {
    const isUpper = char === char.toUpperCase() && char !== char.toLowerCase();
    const mapped = CYRILLIC_MAP[char.toLowerCase()] ?? char;
    return isUpper ? mapped.toUpperCase() : mapped;
  });
}

export function slugify(value: string) {
  return transliterate(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

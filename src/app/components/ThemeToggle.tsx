"use client";

import { useEffect, useState } from "react";
import { SunIcon, MoonIcon } from "./Icons";

const STORAGE_KEY = "admin-theme";

type ThemeValue = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeValue>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeValue | null;
    const initial = stored ?? "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    if (initial === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;

    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 dark:bg-gray-700/50 hover:bg-gray-700/70 dark:hover:bg-gray-600/70 text-gray-200 transition-all duration-200"
      type="button"
    >
      {theme === "light" ? (
        <>
          <MoonIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Темная</span>
        </>
      ) : (
        <>
          <SunIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Светлая</span>
        </>
      )}
    </button>
  );
}

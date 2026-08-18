import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a wei amount as a human-readable GEN string.
 * Always shows GEN (never raw wei) with context-aware decimals.
 */
export function formatWei(value: number): string {
  if (!value) return "0 GEN";
  const gen = Math.abs(value) / 1e18;
  const decimals =
    gen >= 100 ? 1 : gen >= 1 ? 2 : gen >= 0.01 ? 4 : gen >= 0.0001 ? 6 : 8;
  return `${gen.toLocaleString("en-US", { maximumFractionDigits: decimals })} GEN`;
}

/** Copy text to the clipboard with a minimal fallback. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(el);
    }
  }
}

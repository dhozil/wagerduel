"use client";

import { useState } from "react";

/**
 * Team crest rendered from a logo URL (e.g. ESPN) with a blank placeholder for
 * unknown teams — shared between the fixtures and play pages so bets display
 * the same crests as their fixture. If the image fails to load it degrades to
 * the same placeholder.
 */
export function TeamCrest({
  name,
  logo,
  size = 32,
}: {
  name: string;
  logo?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);

  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        loading="lazy"
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className="shrink-0 rounded-lg bg-white/10 border border-white/15"
      style={{ width: size, height: size }}
      aria-label={name}
    />
  );
}
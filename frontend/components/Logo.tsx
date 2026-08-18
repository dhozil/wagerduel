import React from "react";

export type LogoVariant = "full" | "mark" | "wordmark";
export type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}

const sizeMap = {
  sm: { mark: "w-6 h-6", text: "text-base" },
  md: { mark: "w-8 h-8", text: "text-xl" },
  lg: { mark: "w-11 h-11", text: "text-3xl" },
};

/**
 * WagerDuel mark — a gold diamond (the wager) holding a spade (the duel).
 */
export function WagerDuelMark({
  size = "md",
  className = "",
}: {
  size?: LogoSize;
  className?: string;
}) {
  const { mark } = sizeMap[size];
  return (
    <svg
      className={`${mark} ${className} drop-shadow-[0_0_6px_rgba(234,201,92,0.55)] drop-shadow-[0_2px_12px_rgba(212,175,55,0.45)]`}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="WagerDuel logo"
    >
      <defs>
        <linearGradient id="wd-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FBEEC7" />
          <stop offset="0.5" stopColor="#EAC95C" />
          <stop offset="1" stopColor="#C9992E" />
        </linearGradient>
      </defs>
      {/* Diamond */}
      <path
        d="M24 3 L45 24 L24 45 L3 24 Z"
        fill="url(#wd-gold)"
        stroke="#FFF3CE"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Spade */}
      <path
        d="M24 12
           C 21 15.5, 17.5 19, 17.5 22.5
           C 17.5 26.5, 21 28.5, 22.5 28.5
           C 22.5 30.5, 21.5 32, 20.5 33.5
           L 27.5 33.5
           C 26.5 32, 25.5 30.5, 25.5 28.5
           C 27 28.5, 30.5 26.5, 30.5 22.5
           C 30.5 19, 27 15.5, 24 12 Z"
        fill="#14120D"
      />
      <path d="M21.5 35 L26.5 35 L25.5 38.5 L22.5 38.5 Z" fill="#14120D" />
    </svg>
  );
}

export function Logo({
  variant = "full",
  size = "md",
  className = "",
}: LogoProps) {
  const { text: textSize } = sizeMap[size];

  const Wordmark = () => (
    <span
      className={`${textSize} font-display font-semibold uppercase tracking-wide transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] [text-shadow:0_0_18px_rgba(226,185,76,0.35)]`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      <span className="text-foreground">Wager</span>
      <span className="gold-text">Duel</span>
    </span>
  );

  if (variant === "mark") {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <WagerDuelMark size={size} />
      </div>
    );
  }

  if (variant === "wordmark") {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <Wordmark />
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <WagerDuelMark size={size} />
      <Wordmark />
    </div>
  );
}

export function LogoFull(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="full" />;
}

export function LogoMark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="mark" />;
}

export function LogoWordmark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="wordmark" />;
}

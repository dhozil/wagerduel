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
 * Rendered from the same favicon.svg used across the app and the README.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/favicon.svg"
      alt="WagerDuel logo"
      className={`${mark} ${className} drop-shadow-[0_0_6px_rgba(234,201,92,0.45)] drop-shadow-[0_2px_12px_rgba(212,175,55,0.4)]`}
    />
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

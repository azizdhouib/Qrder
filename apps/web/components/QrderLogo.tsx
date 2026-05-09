import { useId } from "react";

/**
 * Logo Qrder : pastille circulaire en dégradé + wordmark gras (style sobre, adapté clair / sombre).
 */
export function QrderLogo({ className = "" }: { className?: string }) {
  const gradId = `qrder-mark-grad-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className={`qrder-logo-svg ${className}`.trim()}
      viewBox="0 0 118 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="14" y1="3" x2="14" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--qrder-mark-a)" />
          <stop offset="1" stopColor="var(--qrder-mark-b)" />
        </linearGradient>
      </defs>
      <circle
        cx={14}
        cy={14}
        r={11}
        fill={`url(#${gradId})`}
        stroke="var(--qrder-mark-stroke)"
        strokeWidth={1}
      />
      <text
        x={32}
        y={14}
        dominantBaseline="central"
        fill="var(--qrder-word)"
        style={{
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "-0.04em"
        }}
      >
        Qrder
      </text>
    </svg>
  );
}

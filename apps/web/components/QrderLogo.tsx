/**
 * Marque Qrder : picto `/logo.png` + mot « qrder » (lockup type produit SaaS).
 * `markOnly` : picto seul (espaces très compacts, page offline, etc.).
 */
export function QrderLogo({
  className = "",
  markOnly = false
}: {
  className?: string;
  /** true = image seule, sans le mot « qrder » à côté */
  markOnly?: boolean;
}) {
  if (markOnly) {
    return (
      <img
        src="/logo.png"
        alt="Qrder"
        className={`qrder-logo-img qrder-logo-img--mark ${className}`.trim()}
        decoding="async"
      />
    );
  }

  return (
    <span className={`qrder-lockup ${className}`.trim()}>
      <img src="/logo.png" alt="" className="qrder-lockup-mark" decoding="async" aria-hidden />
      <span className="qrder-lockup-word">qrder</span>
    </span>
  );
}

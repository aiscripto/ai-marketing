export function BrandLogo({ className = '' }: { className?: string }) {
  return <div className={`brand-lockup ${className}`.trim()}>
    <span className="brand-image" aria-hidden="true">
      <img className="brand-logo brand-logo-light" src="/brand/aiscripto-light.png" alt="" />
      <img className="brand-logo brand-logo-dark" src="/brand/aiscripto-dark.png" alt="" />
    </span>
    <span className="brand-words"><small>AI Marketing Suite</small></span>
  </div>
}

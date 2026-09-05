type IconProps = {
  size?: number;
  className?: string;
};

/** Ash motes — Dust, as opposed to the Gem (premium) crystal. */
export function DustIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <circle cx="8.2" cy="4.35" r="1.55" />
      <circle cx="5.05" cy="7.15" r="1.12" />
      <circle cx="11.15" cy="7.55" r="1.02" />
      <circle cx="7.35" cy="10.85" r="1.18" />
      <circle cx="4.15" cy="11.15" r="0.68" opacity="0.7" />
      <circle cx="10.7" cy="11.45" r="0.58" opacity="0.62" />
    </svg>
  );
}

type AppLogoProps = {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showIcon?: boolean;
  showText?: boolean;
  compact?: boolean;
};

export function AppLogo({
  className = '',
  iconClassName = 'h-10 w-10',
  textClassName = 'text-[18px] tracking-[0.26em]',
  showIcon = true,
  showText = true,
  compact = false,
}: AppLogoProps) {
  const titleSize = compact ? 'text-[14px] tracking-[0.22em]' : textClassName;
  const gap = compact ? 'gap-2.5' : 'gap-3';

  return (
    <div className={`flex items-center ${gap} ${className}`.trim()}>
      {showIcon && (
        <img src="/logo.png" alt="Hero Forge" className={`${iconClassName} object-contain`} />
      )}
      {showText && (
        <div className="flex flex-col items-start leading-none text-white">
          <span className={`font-logo uppercase ${titleSize}`.trim()}>Hero</span>
          <span className={`font-logo uppercase ${titleSize}`.trim()}>Forge</span>
        </div>
      )}
    </div>
  );
}

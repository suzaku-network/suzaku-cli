import { cn } from '@/lib/utils';

interface GaugeProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Gauge({ value, max = 100, label, color = 'hsl(var(--primary))', size = 64, strokeWidth = 6, className }: GaugeProps) {
  const pct = Math.min(Math.max(value / max, 0), 1);
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -220;
  const sweepAngle = 260;
  const circumference = 2 * Math.PI * r;
  const arcLength = (sweepAngle / 360) * circumference;
  const dashOffset = arcLength * (1 - pct);

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arcPath = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const endAngle = startAngle + sweepAngle;
  const trackPath = arcPath(startAngle, endAngle);

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <svg width={size} height={size} style={{ overflow: 'visible' }}>
        <path d={trackPath} fill="none" stroke="hsl(var(--border))" strokeWidth={strokeWidth} strokeLinecap="round" />
        <path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.2} fill="currentColor" fontWeight="600">
          {Math.round(pct * max)}
          {max === 100 ? '%' : ''}
        </text>
      </svg>
      {label && <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>}
    </div>
  );
}

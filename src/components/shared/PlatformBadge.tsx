import { Badge } from '@/components/ui/badge';
import { PLATFORM_LABELS, type Platform } from '@/types';
import { cn } from '@/lib/utils';

const PLATFORM_STYLES: Record<Platform, string> = {
  linkedin: 'bg-[#0A66C2]/10 text-[#0A66C2] border-[#0A66C2]/30',
  instagram:
    'bg-gradient-to-r from-[#E4405F]/10 to-[#F77737]/10 text-[#E4405F] border-[#E4405F]/30',
  facebook: 'bg-[#1877F2]/10 text-[#1877F2] border-[#1877F2]/30',
  tiktok: 'bg-foreground/10 text-foreground border-foreground/30',
  youtube: 'bg-[#FF0000]/10 text-[#FF0000] border-[#FF0000]/30',
};

interface PlatformBadgeProps {
  platform: Platform;
  className?: string;
}

export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  return (
    <Badge variant="outline" className={cn(PLATFORM_STYLES[platform], 'border', className)}>
      {PLATFORM_LABELS[platform]}
    </Badge>
  );
}

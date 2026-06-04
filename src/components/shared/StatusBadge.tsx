import { Badge } from '@/components/ui/badge';
import { POST_STATUS_LABELS, type PostStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<PostStatus, string> = {
  idea: 'bg-muted text-muted-foreground',
  draft: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  scheduled: 'bg-accent/30 text-accent-foreground',
  published: 'bg-primary text-primary-foreground',
  archived: 'bg-muted text-muted-foreground/70',
};

interface StatusBadgeProps {
  status: PostStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], 'border-transparent', className)}>
      {POST_STATUS_LABELS[status]}
    </Badge>
  );
}

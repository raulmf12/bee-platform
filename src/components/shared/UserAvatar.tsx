import { cn, getInitials } from '@/lib/utils';
import type { Profile } from '@/types';

interface UserAvatarProps {
  user: Pick<Profile, 'name' | 'avatar_color'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

export function UserAvatar({ user, size = 'md', className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white shadow-sm ring-2 ring-background',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: user.avatar_color }}
    >
      {getInitials(user.name)}
    </div>
  );
}

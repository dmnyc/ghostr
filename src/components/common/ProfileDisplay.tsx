import { User, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useProfileQuery } from '@/hooks/queries/useProfileQuery'

interface ProfileDisplayProps {
  pubkey: string
  npub?: string // fallback display
  size?: 'sm' | 'md'
  showName?: boolean
  className?: string
}

export function ProfileDisplay({
  pubkey,
  npub,
  size = 'sm',
  showName = true,
  className,
}: ProfileDisplayProps) {
  // Use React Query for automatic caching, deduplication, and background updates
  const { data: profile, isLoading: loading } = useProfileQuery(pubkey)

  const sizeClasses = {
    sm: {
      avatar: 'h-4 w-4',
      icon: 'h-3 w-3',
      text: 'text-xs',
    },
    md: {
      avatar: 'h-6 w-6',
      icon: 'h-4 w-4',
      text: 'text-sm',
    },
  }

  const sizes = sizeClasses[size]
  const displayName = profile?.displayName || profile?.name
  const fallbackText = npub ? `${npub.slice(0, 12)}...` : `${pubkey.slice(0, 8)}...`

  if (loading) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <Loader2 className={cn(sizes.icon, 'animate-spin text-muted-foreground')} />
        <span className={cn(sizes.text, 'text-muted-foreground')}>Loading...</span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-1.5 min-w-0', className)}>
      {profile?.picture ? (
        <img
          src={profile.picture}
          alt=""
          className={cn(sizes.avatar, 'rounded-full object-cover flex-shrink-0')}
        />
      ) : (
        <div
          className={cn(
            sizes.avatar,
            'rounded-full bg-muted flex items-center justify-center flex-shrink-0'
          )}
        >
          <User className={cn(sizes.icon, 'text-muted-foreground')} />
        </div>
      )}
      {showName && (
        <span className={cn(sizes.text, 'truncate')}>
          {displayName || fallbackText}
        </span>
      )}
    </div>
  )
}

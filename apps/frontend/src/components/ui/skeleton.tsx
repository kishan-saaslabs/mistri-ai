import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse bg-muted", className)}
      {...props}
    />
  )
}

/** Pulse bar that inherits the parent font, so line-height matches real text. */
function SkeletonLine({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block max-w-full animate-pulse truncate rounded-sm bg-muted align-baseline text-transparent select-none",
        className,
      )}
      {...props}
    >
      0
    </span>
  )
}

function MorphIn({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="morph-in"
      className={cn("animate-morph-in", className)}
      {...props}
    />
  )
}

function MorphFrame({
  loading,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { loading: boolean }) {
  return (
    <div
      data-slot="morph-frame"
      data-loading={loading ? "" : undefined}
      className={cn("morph-frame", loading && "animate-pulse", className)}
      {...props}
    >
      {loading ? null : children}
    </div>
  )
}

export { Skeleton, SkeletonLine, MorphIn, MorphFrame }

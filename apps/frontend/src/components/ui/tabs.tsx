import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

type Indicator = {
  x: number
  y: number
  w: number
  h: number
  ready: boolean
  vertical: boolean
}

const EMPTY_INDICATOR: Indicator = {
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  ready: false,
  vertical: false,
}

function activeTrigger(list: HTMLElement) {
  return list.querySelector<HTMLElement>(
    '[data-slot="tabs-trigger"][data-state="active"], [data-slot="tabs-trigger"][data-active]:not([data-active="false"])'
  )
}

function TabsList({
  className,
  variant = "default",
  ref,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [box, setBox] = React.useState<Indicator>(EMPTY_INDICATOR)
  const [canAnimate, setCanAnimate] = React.useState(false)

  const setListRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    const update = () => {
      const active = activeTrigger(list)
      if (!active) return
      const next = {
        x: active.offsetLeft,
        y: active.offsetTop,
        w: active.offsetWidth,
        h: active.offsetHeight,
        ready: true,
        vertical:
          list.closest("[data-slot=tabs]")?.getAttribute("data-orientation") ===
          "vertical",
      }
      setBox((prev) =>
        prev.ready &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.w === next.w &&
        prev.h === next.h &&
        prev.vertical === next.vertical
          ? prev
          : next
      )
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(list)
    const mo = new MutationObserver(update)
    mo.observe(list, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-state", "data-active"],
    })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  React.useEffect(() => {
    if (!box.ready || canAnimate) return
    const id = requestAnimationFrame(() => setCanAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [box.ready, canAnimate])

  const line = variant === "line"
  const indicatorStyle: React.CSSProperties = line
    ? box.vertical
      ? {
          top: 0,
          right: -1,
          left: "auto",
          transform: `translateY(${box.y}px)`,
          width: 2,
          height: box.h,
        }
      : {
          top: "auto",
          bottom: -1,
          transform: `translateX(${box.x}px)`,
          width: box.w,
          height: 2,
        }
    : {
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.w,
        height: box.h,
      }

  return (
    <TabsPrimitive.List
      ref={setListRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-0",
          line
            ? "bg-foreground"
            : "rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30",
          canAnimate &&
            "transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          !box.ready && "opacity-0"
        )}
        style={indicatorStyle}
      />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative z-1 inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

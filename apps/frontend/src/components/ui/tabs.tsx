import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, useReducedMotion } from "motion/react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { motionTransition, springs } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { InDialogContext } from "@/components/ui/dialog"

type TabsMeta = {
  value?: string
  layoutId: string
}

const TabsMetaContext = React.createContext<TabsMeta>({ layoutId: "tabs" })
const TabsVariantContext = React.createContext<"default" | "line">("default")

function Tabs({
  className,
  orientation = "horizontal",
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const layoutId = React.useId()
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)

  return (
    <TabsMetaContext.Provider
      value={{ value: value ?? uncontrolled, layoutId }}
    >
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          if (value === undefined) setUncontrolled(next)
          onValueChange?.(next)
        }}
        className={cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          className
        )}
        {...props}
      />
    </TabsMetaContext.Provider>
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

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsVariantContext.Provider value={variant ?? "default"}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

function TabsTrigger({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value: current, layoutId } = React.useContext(TabsMetaContext)
  const variant = React.useContext(TabsVariantContext)
  const reduce = useReducedMotion()
  const active = current === value
  const line = variant === "line"

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative z-1 inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:text-foreground dark:data-active:text-foreground",
        className
      )}
      {...props}
    >
      {active ? (
        <motion.span
          layoutId={`${layoutId}-indicator`}
          className={cn(
            "absolute z-0",
            line
              ? "inset-x-0 -bottom-px h-0.5 bg-foreground group-data-vertical/tabs:inset-y-0 group-data-vertical/tabs:right-[-1px] group-data-vertical/tabs:left-auto group-data-vertical/tabs:h-auto group-data-vertical/tabs:w-0.5 group-data-vertical/tabs:bottom-auto"
              : "inset-0 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30"
          )}
          initial={false}
          transition={motionTransition(reduce, springs.pill)}
        />
      ) : null}
      <span className="relative z-1 inline-flex items-center justify-center gap-1.5">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  const reduce = useReducedMotion()
  const inDialog = React.useContext(InDialogContext)
  const skipEnter = reduce || inDialog
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    >
      {skipEnter ? (
        children
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition(reduce, springs.smooth)}
        >
          {children}
        </motion.div>
      )}
    </TabsPrimitive.Content>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

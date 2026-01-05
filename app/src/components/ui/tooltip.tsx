import * as React from "react"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
}

export function Tooltip({ content, children, side = 'right', className }: TooltipProps) {
  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }

  return (
    <div className={cn("relative group", className)}>
      {children}
      <div
        className={cn(
          "absolute z-[9999] px-2 py-1 text-xs font-medium text-primary-foreground bg-primary rounded-md whitespace-nowrap",
          "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
          "transition-opacity duration-150 pointer-events-none",
          sideClasses[side]
        )}
      >
        {content}
      </div>
    </div>
  )
}

import * as React from "react"
import { flushSync } from "react-dom"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value, onChange, onBlur, ...props }, ref) => {
    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (value === undefined || !onChange) {
        onBlur?.(e)
        return
      }
      const dom = e.target.value
      const prop = value == null ? "" : String(value)
      if (dom !== prop) {
        flushSync(() => {
          onChange({
            ...e,
            target: e.target,
            currentTarget: e.currentTarget,
          } as React.ChangeEvent<HTMLTextAreaElement>)
        })
      }
      onBlur?.(e)
    }

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
        onChange={onChange}
        onBlur={handleBlur}
        {...(value !== undefined ? { value } : {})}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }

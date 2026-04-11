import * as React from "react"
import { flushSync } from "react-dom"

import { cn } from "@/lib/utils"
import {
  normalizeDecimalNumericInput,
  normalizeIntegerNumericInput,
} from "@/lib/numericInput"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** 数値欄: 全角数字を半角にし、integer は数字のみ / decimal は小数点1つまで */
  numericInput?: "integer" | "decimal"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, numericInput, onChange, onBlur, inputMode, value, ...props }, ref) => {
    const resolvedType =
      numericInput && type === "number" ? "text" : type
    const resolvedInputMode =
      numericInput === "integer"
        ? "numeric"
        : numericInput === "decimal"
          ? "decimal"
          : inputMode
    const autoNumericInput =
      numericInput ??
      (resolvedInputMode === "numeric"
        ? "integer"
        : resolvedInputMode === "decimal" || type === "number"
          ? "decimal"
          : undefined)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!autoNumericInput) {
        onChange?.(e)
        return
      }
      const raw = e.target.value
      const next =
        autoNumericInput === "integer"
          ? normalizeIntegerNumericInput(raw)
          : normalizeDecimalNumericInput(raw)
      if (next !== raw) {
        e.target.value = next
      }
      onChange?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (resolvedType === "file" || value === undefined || !onChange) {
        onBlur?.(e)
        return
      }
      const dom = e.target.value
      const prop = value == null ? "" : String(value)
      if (dom !== prop) {
        flushSync(() => {
          handleChange({
            ...e,
            target: e.target,
            currentTarget: e.currentTarget,
          } as React.ChangeEvent<HTMLInputElement>)
        })
      }
      onBlur?.(e)
    }

    return (
      <input
        type={resolvedType}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background transition-[color,background-color,border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        inputMode={resolvedInputMode}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
        {...(value !== undefined ? { value } : {})}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

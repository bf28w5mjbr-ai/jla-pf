import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { padding?: "none" | "sm" | "md" | "lg" }
>(({ className, padding = "md", ...props }, ref) => {
  const paddingClasses = {
    none: "",
    sm: "p-3.5 sm:p-4",
    md: "p-4 sm:p-5",
    lg: "p-6 sm:p-7",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "bg-card text-card-foreground",
        "border border-border/85",
        "rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_20px_rgba(15,23,42,0.03)] overflow-hidden",
        "dark:shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
        paddingClasses[padding],
        className
      )}
      {...props}
    />
  );
})
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "border-b border-border/70 bg-muted/30 px-4 py-3.5 sm:px-5 sm:py-4",
      className
    )}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold tracking-tight text-foreground sm:text-lg",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs leading-relaxed text-muted-foreground sm:text-sm", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 sm:p-5", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-4 pt-0 sm:p-5 sm:pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }

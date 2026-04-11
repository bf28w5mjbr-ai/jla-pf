"use client"

import * as React from "react"

import { flushFormControlAutofill } from "@/lib/formAutofillSync"

export type AutofillSyncFormProps = React.ComponentPropsWithoutRef<"form">

export const AutofillSyncForm = React.forwardRef<HTMLFormElement, AutofillSyncFormProps>(
  ({ onSubmitCapture, ...props }, ref) => (
    <form
      ref={ref}
      {...props}
      onSubmitCapture={(e) => {
        flushFormControlAutofill(e.currentTarget)
        onSubmitCapture?.(e)
      }}
    />
  ),
)
AutofillSyncForm.displayName = "AutofillSyncForm"

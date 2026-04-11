import { Fragment } from "react";

type RegistrationStep = 1 | 2 | 3;

const STEPS: { step: RegistrationStep; label: string }[] = [
  { step: 1, label: "基本情報" },
  { step: 2, label: "SMS認証" },
  { step: 3, label: "パスキー" },
];

export function RegistrationStepper({
  currentStep,
  step2Label,
}: {
  currentStep: RegistrationStep;
  /** 未指定時は「SMS認証」 */
  step2Label?: string;
}) {
  const steps = STEPS.map((s) =>
    s.step === 2 && step2Label ? { ...s, label: step2Label } : s
  );

  return (
    <nav aria-label="登録の進捗" className="mb-8 w-full sm:mb-10">
      <div className="mx-auto flex w-full max-w-xl items-start justify-center">
        {steps.map(({ step, label }, index) => {
          const done = currentStep > step;
          const active = currentStep === step;
          return (
            <Fragment key={step}>
              <div className="flex w-[4.25rem] flex-col items-center gap-2 sm:w-24">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-colors ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/25 ring-offset-2 ring-offset-gray-50"
                        : "border border-border bg-card text-muted-foreground"
                  }`}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? "✓" : step}
                </span>
                <span
                  className={`text-center text-[11px] leading-tight sm:text-xs ${
                    active ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mt-5 h-0.5 min-w-[12px] flex-1 rounded-full ${
                    currentStep > step ? "bg-primary" : "bg-muted"
                  }`}
                  aria-hidden
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}

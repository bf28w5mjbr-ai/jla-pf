import { Fragment } from "react";
import { cn } from "@/lib/utils";

function renderBoldLine(line: string, lineKey: string) {
  const parts = line.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={`${lineKey}-b-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${lineKey}-t-${i}`}>{part}</Fragment>;
  });
}

/** 改行と **太字** のみサポートする簡易 Markdown */
export default function SimpleMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {renderBoldLine(line, `L${i}`)}
        </Fragment>
      ))}
    </div>
  );
}

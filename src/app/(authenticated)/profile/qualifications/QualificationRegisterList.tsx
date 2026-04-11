"use client";

import QualificationRegisterButton from "./QualificationRegisterButton";

interface RegisterableQualification {
  id: string;
  kind: string;
  name: string | null;
  description: string | null;
  requiresExpiry: boolean;
  validityMonths: number | null;
}

interface QualificationRegisterListProps {
  items: RegisterableQualification[];
  defaultJlaMemberNumber?: string | null;
}

export default function QualificationRegisterList({
  items,
  defaultJlaMemberNumber,
}: QualificationRegisterListProps) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {item.name ?? item.kind}
            </p>
            {item.description && (
              <p className="mt-1 text-xs text-gray-500">{item.description}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              {item.requiresExpiry && item.validityMonths
                ? `有効期間: ${item.validityMonths}か月`
                : "有効期限なし"}
            </p>
          </div>
          <QualificationRegisterButton
            item={item}
            defaultJlaMemberNumber={defaultJlaMemberNumber}
          />
        </div>
      ))}
    </div>
  );
}

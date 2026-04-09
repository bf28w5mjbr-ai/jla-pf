"use client";

import { ReactNode } from "react";
import type { ExplanationDensity } from "@/lib/explanation";
import { pageIntroTextClass } from "@/lib/explanation";
import Sidebar from "@/components/Sidebar";

interface Organization {
  id: string;
  name: string;
  abbreviation?: string | null;
}

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  description?: string;
  /** 説明文の段階（一覧・設定などは compact、初回のみ詳しい画面は guided） */
  descriptionDensity?: ExplanationDensity;
  showSidebar?: boolean;
  userRole?: string;
  isClubAdmin?: boolean;
  organizations?: Organization[];
  headerContent?: ReactNode;
  action?: ReactNode;
}

export default function PageLayout({
  children,
  title,
  description,
  descriptionDensity = "balanced",
  showSidebar = true,
  userRole,
  isClubAdmin,
  organizations,
  headerContent,
  action,
}: PageLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {showSidebar && <Sidebar userRole={userRole} isClubAdmin={isClubAdmin} organizations={organizations} />}
      
      <main className="flex-1 p-8 lg:p-12">
        <div className="max-w-7xl mx-auto">
          {headerContent ? (
            <div className="mb-8">
              {headerContent}
            </div>
          ) : (title || description) && (
            <div className="mb-8 flex items-start justify-between">
              <div>
                {title && (
                  <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {title}
                  </h1>
                )}
                {description && (
                  <p className={pageIntroTextClass(descriptionDensity)}>{description}</p>
                )}
              </div>
              {action && <div>{action}</div>}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

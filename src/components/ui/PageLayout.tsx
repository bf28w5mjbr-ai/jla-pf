"use client";

import { ReactNode } from "react";
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
  showSidebar?: boolean;
  userRole?: string;
  isClubOwner?: boolean;
  organizations?: Organization[];
  headerContent?: ReactNode;
  action?: ReactNode;
}

export default function PageLayout({
  children,
  title,
  description,
  showSidebar = true,
  userRole,
  isClubOwner,
  organizations,
  headerContent,
  action,
}: PageLayoutProps) {
  return (
    <div className="flex min-h-screen bg-white dark:bg-[#1a1a1a]">
      {showSidebar && <Sidebar userRole={userRole} isClubOwner={isClubOwner} organizations={organizations} />}
      
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {description}
                  </p>
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

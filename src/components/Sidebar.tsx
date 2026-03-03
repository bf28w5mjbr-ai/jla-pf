"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface MenuItem {
  label: string;
  href: string;
  condition?: boolean;
}

interface Organization {
  id: string;
  name: string;
  abbreviation?: string | null;
}

interface SidebarProps {
  userRole?: string;
  isClubOwner?: boolean;
  organizations?: Organization[];
}

export default function Sidebar({ userRole, isClubOwner, organizations = [] }: SidebarProps = {}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const isOrgAdmin = userRole === 'ORG_ADMIN' || userRole === 'PF_ADMIN';
  const isJlaAdmin = userRole === 'JLA_ADMIN' || userRole === 'PF_ADMIN';

  const menuItems: MenuItem[] = [
    {
      label: "JLA管理",
      href: "/admin/jla",
      condition: isJlaAdmin,
    },
    {
      label: "個人",
      href: "/dashboard",
    },
    {
      label: "Competition",
      href: "/competitions",
    },
    {
      label: "Lesson",
      href: "/lessons",
    },
    {
      label: "Career",
      href: "/qualifications",
    },
    {
      label: "CLUB",
      href: "/clubs",
      condition: isClubOwner,
    },
    {
      label: "団体",
      href: "/admin",
      condition: isOrgAdmin,
    },
  ];

  const bottomMenuItems: MenuItem[] = [
    {
      label: "CLUBを作成",
      href: "/clubs/create",
    },
    {
      label: "CLUB管理",
      href: "/admin/clubs",
      condition: isOrgAdmin,
    },
    {
      label: "団体を作成",
      href: "/organizations/create",
    },
  ];

  return (
    <>
      {/* モバイルメニューボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-gray-700"
      >
        <svg
          className="w-6 h-6 text-gray-900 dark:text-gray-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* オーバーレイ（モバイル） */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* サイドバー */}
      <aside
        className={`
          fixed lg:sticky top-0 h-screen w-64 bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-gray-700 z-40 transition-transform duration-300 flex flex-col
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">JLA PF</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg
                className="w-5 h-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          
          <nav className="space-y-1">
            {menuItems.map((item) => {
              // 条件に合わない場合は表示しない
              if (item.condition !== undefined && !item.condition) {
                return null;
              }

              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`
                    flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${isActive
                      ? 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-gray-100'
                    }
                  `}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            {/* 所属団体一覧 */}
            {organizations.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  所属団体
                </div>
                {organizations.map((org) => {
                  const orgHref = `/organizations/${org.id}`;
                  const isActive = pathname === orgHref || pathname?.startsWith(orgHref + '/');
                  
                  return (
                    <Link
                      key={org.id}
                      href={orgHref}
                      onClick={() => setIsOpen(false)}
                      className={`
                        flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors
                        ${isActive
                          ? 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-900 dark:text-gray-100'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-gray-100'
                        }
                      `}
                    >
                      <span className="truncate">{org.abbreviation || org.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>
        </div>

        <div className="p-6 pt-0 border-t border-gray-200 dark:border-gray-700">
          <nav className="space-y-1">
            {bottomMenuItems.map((item) => {
              // 条件に合わない場合は表示しない
              if (item.condition !== undefined && !item.condition) {
                return null;
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}

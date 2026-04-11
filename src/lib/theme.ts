export const theme = {
  colors: {
    bg: {
      primary: "bg-white dark:bg-[#1a1a1a]",
      secondary: "bg-gray-50 dark:bg-[#2a2a2a]",
      tertiary: "bg-gray-100 dark:bg-[#1f1f1f]",
      card: "bg-white dark:bg-[#2a2a2a]",
      hover: "hover:bg-gray-50 dark:hover:bg-[#2f2f2f]",
    },
    border: {
      default: "border-gray-200 dark:border-gray-700",
      light: "border-gray-100 dark:border-gray-800",
    },
    text: {
      primary: "text-gray-900 dark:text-gray-100",
      secondary: "text-gray-600 dark:text-gray-400",
      muted: "text-gray-500 dark:text-gray-500",
      link: "text-orange-600 dark:text-orange-400 hover:underline",
    },
  },
  spacing: {
    page: "p-8 lg:p-12",
    card: {
      none: "",
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
  },
  transitions: {
    default: "transition-colors",
    all: "transition-all",
    opacity: "transition-opacity",
  },
  rounded: {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  },
} as const;

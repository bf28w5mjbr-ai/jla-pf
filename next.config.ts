import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHostname: string | null = null;
if (supabaseUrl) {
  try {
    supabaseHostname = new URL(supabaseUrl).hostname;
  } catch {
    supabaseHostname = null;
  }
}

function buildContentSecurityPolicy(): string {
  const connect: string[] = ["'self'"];
  if (supabaseHostname) {
    connect.push(`https://${supabaseHostname}`, `wss://${supabaseHostname}`);
  }
  connect.push(
    "https://api.stripe.com",
    "https://r.stripe.com",
    "https://m.stripe.com",
    "https://q.stripe.com"
  );

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    // Next.js 本番でもインラインスクリプトを使うため厳格な nonce 化は別途検討
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.com",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
  /** ローカルで production ビルドする場合の誤 HSTS 付与を避ける（Vercel または明示時のみ） */
  ...(process.env.VERCEL === "1" || process.env.ENABLE_HSTS === "true"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  /* options here */
  /**
   * Turbopack が @prisma/client を古いバンドルとして保持し、
   * `prisma generate` 後も select に新フィールドが無い Client が残るのを防ぐ。
   * @see https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help
   */
  serverExternalPackages: ["@prisma/client", "prisma"],
  reactCompiler: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-label",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
    ],
  },
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
            },
          ]
        : []),
      /** Storage 公開 URLは *.supabase.co。ビルド時に NEXT_PUBLIC_SUPABASE_URL が無くても画像最適化を許可 */
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.bluvium.jp" }],
        destination: "https://bluvium.jp/:path*",
        permanent: true,
      },
      {
        source: "/organizations",
        destination: "/dashboard",
        permanent: true,
      },
      // `_health` は App Router のプライベートフォルダ規則で URL にならないため、実体は `/api/health`。
      {
        source: "/api/_health",
        destination: "/api/health",
        permanent: false,
      },
      {
        source: "/api/_health/ready",
        destination: "/api/health/ready",
        permanent: false,
      },
      {
        source: "/api/_health/live",
        destination: "/api/health/live",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

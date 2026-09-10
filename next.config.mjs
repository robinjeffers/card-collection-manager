/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle for small production Docker images.
  output: "standalone",
  // sharp ships native binaries; keep it external so Next traces and copies the
  // real module (and its platform binaries) into the standalone output instead
  // of trying to bundle it.
  serverExternalPackages: ["sharp"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
        ],
      },
    ]
  },
}

export default nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal standalone bundle — required for the Docker multi-stage build
  output: 'standalone',
}
export default nextConfig

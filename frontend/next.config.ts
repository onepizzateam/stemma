import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  webpack: (config: any) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/evm/upto/client': false,
      '@x402/evm/exact/client': false,
      '@x402/svm/exact/client': false,
      '@x402/core/client': false,
      '@coinbase/cdp-sdk': false,
      '@base-org/account': false,
    }
    return config
  },
}

export default nextConfig

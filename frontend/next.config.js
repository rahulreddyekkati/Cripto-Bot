/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: process.env.NODE_ENV === 'production'
                    ? 'https://cripto-bot-40w9.onrender.com/api/:path*'
                    : 'http://localhost:3001/api/:path*'
            }
        ]
    }
};

module.exports = nextConfig;

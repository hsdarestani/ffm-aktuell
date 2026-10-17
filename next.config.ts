import type { NextConfig } from 'next';
const config:NextConfig={output:'standalone',reactStrictMode:true,serverExternalPackages:['pg'],poweredByHeader:false};
export default config;

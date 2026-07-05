import { ScraperConfig, ProxyConfig } from './types';

// Load Shopee cookies from environment
const shopeeCookies = process.env.SHOPEE_COOKIES || '';

// HTTP proxies from environment or empty array
const proxies: ProxyConfig[] = process.env.PROXIES 
  ? JSON.parse(process.env.PROXIES) 
  : [];

export const config: ScraperConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 30000,
  useProxy: process.env.USE_PROXY === 'true',
  proxies: proxies,
  useTor: process.env.USE_TOR === 'true',
  torProxy: {
    host: process.env.TOR_HOST || '127.0.0.1',
    port: parseInt(process.env.TOR_PORT || '9050')
  },
  shopeeCookies: shopeeCookies
};

export const API_CONFIG = {
  port: process.env.PORT || 3000,
  rateLimitWindowMs: 60000, // 1 minute
  rateLimitMax: 30 // 30 requests per minute
};

export const SHOPEE_API = {
  baseUrl: 'https://shopee.tw/api/v4/pdp',
  endpoints: {
    get_pc: '/get_pc',
    get_rw: '/get_rw'
  }
};

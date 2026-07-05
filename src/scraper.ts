import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ProxyManager } from './proxyManager';
import { ShopeeProductRequest, ShopeeProductResponse, ScraperConfig } from './types';
import { config, SHOPEE_API } from './config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

const COOKIE_FILE = path.join(__dirname, '../shopee_cookies.json');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

export class ShopeeScraper {
  private axiosInstance: AxiosInstance;
  private proxyManager: ProxyManager;
  private config: ScraperConfig;
  private cookieJar: Map<string, string> = new Map();
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 5000; // 5 seconds between requests (increased)

  constructor(scraperConfig?: Partial<ScraperConfig>) {
    this.config = { ...config, ...scraperConfig };
    this.proxyManager = new ProxyManager(this.config.proxies);
    this.axiosInstance = axios.create({
      timeout: this.config.timeout,
      headers: this.getDefaultHeaders()
    });
  }

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private getDefaultHeaders(): Record<string, string> {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://shopee.tw/',
      'Origin': 'https://shopee.tw',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Shopee-Language': 'zh-TW',
      'X-API-Source': 'pc'
    };
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const delay = this.minRequestInterval - timeSinceLastRequest;
      await this.sleep(delay);
    }
    
    this.lastRequestTime = Date.now();
  }

  private getProxyAgent() {
    // Use TOR if enabled
    if (this.config.useTor && this.config.torProxy) {
      const torUrl = `socks5://${this.config.torProxy.host}:${this.config.torProxy.port}`;
      // TOR support disabled for now due to module compatibility
      return undefined;
    }

    if (!this.config.useProxy) {
      return undefined;
    }

    const proxy = this.proxyManager.getRandomProxy();
    if (!proxy) {
      return undefined;
    }

    // Support SOCKS5 proxies
    if (proxy.type === 'socks5') {
      // SOCKS5 support disabled for now due to module compatibility
      return undefined;
    }

    // HTTP/HTTPS proxies
    const proxyUrl = proxy.auth
      ? `http://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`
      : `http://${proxy.host}:${proxy.port}`;

    return new HttpsProxyAgent(proxyUrl);
  }

  private async fetchWithRetry(
    url: string,
    config: AxiosRequestConfig,
    retries: number = 0
  ): Promise<any> {
    try {
      await this.enforceRateLimit();
      
      // Hybrid approach: Scrape HTML page first, then try API
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      const page = await browser.newPage();
      
      // Set realistic viewport and locale for Taiwan
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true
      });
      
      // Set locale and timezone for Taiwan
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      await page.setUserAgent(this.getRandomUserAgent());
      
      // Load cookies from file if available
      if (fs.existsSync(COOKIE_FILE)) {
        try {
          const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
          await page.setCookie(...cookies);
          console.log(`Loaded ${cookies.length} cookies from ${COOKIE_FILE}`);
        } catch (e) {
          console.log('Failed to load cookies from file:', e);
        }
      }
      
      const headers: any = {
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      };
      
      if (this.config.shopeeCookies) {
        await page.setExtraHTTPHeaders({
          ...headers,
          'Cookie': this.config.shopeeCookies
        });
      } else {
        await page.setExtraHTTPHeaders(headers);
      }

      // Intercept network requests to capture API responses and headers
      let apiResponseData: any = null;
      let capturedRequestHeaders: any = null;
      const capturedUrls: string[] = [];
      
      // Capture request headers for get_pc API
      await page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/v4/pdp/get_pc') || url.includes('/api/v4/pdp/get_rw')) {
          console.log('Capturing request headers for get_pc API...');
          capturedRequestHeaders = request.headers();
          console.log('Captured headers:', Object.keys(capturedRequestHeaders));
        }
      });
      
      await page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/api/')) {
          capturedUrls.push(url);
          try {
            const data = await response.json();
            console.log(`Captured API response from: ${url.substring(0, 80)}...`);
            
            // Specifically capture get_pc and get_rw endpoints as per requirements
            if (url.includes('/api/v4/pdp/get_pc') || url.includes('/api/v4/pdp/get_rw')) {
              console.log('Found get_pc or get_rw API endpoint!');
              apiResponseData = data;
            }
            // Also check if this response contains product data
            if (data && data.data && data.data.item) {
              console.log('Found product data in API response!');
              apiResponseData = data;
            }
          } catch (e) {
            // Response might not be JSON
          }
        }
      });

      // Extract storeId and dealId from params (handle both naming conventions)
      const storeId = config.params?.shop_id || config.params?.storeId;
      const dealId = config.params?.item_id || config.params?.dealId;
      
      // Use correct URL format from the requirements: https://shopee.tw/a-i.{storeId}.{dealId}
      const productUrl = `https://shopee.tw/a-i.${storeId}.${dealId}`;
      console.log(`Navigating to: ${productUrl}`);
      
      await page.goto(productUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      console.log('Page loaded, checking for API responses...');
      
      // Wait and scroll to trigger lazy loading
      await this.sleep(3000);
      await page.evaluate(() => {
        (window as any).scrollBy(0, 500);
      });
      await this.sleep(2000);
      await page.evaluate(() => {
        (window as any).scrollBy(0, -500);
      });
      await this.sleep(2000);
      
      // If we captured API data, check if it has error 90309999
      if (apiResponseData) {
        console.log('Successfully captured API data from network requests');
        
        // If the response has error 90309999, try using cookies for direct API call
        if (apiResponseData.error === 90309999 || apiResponseData[3] === 90309999) {
          console.log('API response has error 90309999, trying direct API call with cookies...');
          
          const cookies = await page.cookies();
          const cookieString = cookies
            .filter(c => c.name.includes('SPC') || c.name.includes('csrftoken') || c.name.includes('REC'))
            .map(c => `${c.name}=${c.value}`)
            .join('; ');
          
          await browser.close();
          
          // Try direct API call with extracted cookies and captured headers
          if (cookieString) {
            const axios = require('axios');
            const queryString = new URLSearchParams(config.params as any).toString();
            const fullUrl = `${url}?${queryString}`;
            
            try {
              const headers: any = {
                'Cookie': cookieString,
                'User-Agent': this.getRandomUserAgent(),
                'Accept': 'application/json, text/plain, */*',
                'Referer': productUrl,
                'Origin': 'https://shopee.tw',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
                'af-ac-enc-dat': 'null',
                'x-api-source': 'pc'
              };
              
              // Add all captured dynamic headers if available
              if (capturedRequestHeaders) {
                Object.keys(capturedRequestHeaders).forEach(key => {
                  if (capturedRequestHeaders[key] && !headers[key]) {
                    headers[key] = capturedRequestHeaders[key];
                  }
                });
                console.log('Using captured headers:', Object.keys(capturedRequestHeaders));
              }
              
              console.log('Making direct API call with captured headers...');
              const response = await axios.get(fullUrl, {
                headers,
                timeout: this.config.timeout
              });
              console.log('Direct API call with cookies successful!');
              return response.data;
            } catch (apiError) {
              console.log('Direct API call failed, returning original response');
              return apiResponseData;
            }
          }
        }
        
        await browser.close();
        return apiResponseData;
      }
      
      console.log('No API data captured, trying HTML extraction...');
      
      // Extract cookies from page for fallback
      const cookies = await page.cookies();
      const cookieString = cookies
        .filter(c => c.name.includes('SPC') || c.name.includes('csrftoken') || c.name.includes('REC'))
        .map(c => `${c.name}=${c.value}`)
        .join('; ');
      
      console.log(`Extracted cookies: ${cookieString.substring(0, 100)}...`);
      
      // Extract product data from HTML using multiple methods
      const productData = await page.evaluate(() => {
        // Method 1: Try window.__INITIAL_STATE__
        if ((window as any).__INITIAL_STATE__) {
          return (window as any).__INITIAL_STATE__;
        }
        
        // Method 2: Try to find in script tags with broader patterns
        const scripts = (document as any).querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          if (text && (text.includes('item_id') || text.includes('shop_id') || text.includes('price') || text.includes('name'))) {
            try {
              // Try various patterns - more aggressive
              const patterns = [
                /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
                /__INITIAL_STATE__\s*=\s*({.+?});/,
                /window\.INITIAL_STATE\s*=\s*({.+?});/,
                /INITIAL_STATE\s*=\s*({.+?});/,
                /window\.product\s*=\s*({.+?});/,
                /product\s*=\s*({.+?});/,
                /({.*?"item_id".*?"shop_id".*?})/,
                /({.*?"id".*?"name".*?"price".*?})/
              ];
              
              for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                  try {
                    const parsed = JSON.parse(match[1]);
                    // Check if it looks like product data
                    if (parsed.item || parsed.data || parsed.name || parsed.price) {
                      return parsed;
                    }
                  } catch (e) {
                    continue;
                  }
                }
              }
            } catch (e) {
              continue;
            }
          }
        }
        
        // Method 3: Extract from page content using multiple selectors
        const titleSelectors = ['h1', '.product-name', '[class*="name"]', '[class*="title"]', '[class*="ProductName"]', '[class*="ItemName"]'];
        const priceSelectors = ['[class*="price"]', '.price', '[data-price]', '[class*="Price"]', '[class*="ItemPrice"]'];
        
        let title = '';
        let price = '';
        
        for (const selector of titleSelectors) {
          const element = (document as any).querySelector(selector);
          if (element && element.textContent) {
            title = element.textContent.trim();
            break;
          }
        }
        
        for (const selector of priceSelectors) {
          const element = (document as any).querySelector(selector);
          if (element && element.textContent) {
            price = element.textContent.trim();
            break;
          }
        }
        
        if (title || price) {
          return {
            data: {
              item: {
                name: title,
                price: price,
                item_id: null,
                shop_id: null
              }
            }
          };
        }
        
        return null;
      });
      
      console.log('Product data extracted:', productData ? 'Success' : 'Failed');
      console.log('Extracted data:', JSON.stringify(productData).substring(0, 200));
      
      await browser.close();

      // If we got data from HTML, return it
      if (productData && productData.data && productData.data.item) {
        return {
          bff_meta: null,
          error: null,
          error_msg: null,
          data: productData.data
        };
      }
      
      // Fallback: Try API with extracted cookies
      if (cookieString) {
        const axios = require('axios');
        const queryString = new URLSearchParams(config.params as any).toString();
        const fullUrl = `${url}?${queryString}`;
        
        try {
          const response = await axios.get(fullUrl, {
            headers: {
              'Cookie': cookieString,
              'User-Agent': this.getRandomUserAgent(),
              'Accept': 'application/json, text/plain, */*',
              'Referer': productUrl,
              'Origin': 'https://shopee.tw'
            },
            timeout: this.config.timeout
          });
          return response.data;
        } catch (apiError) {
          console.log('API call failed, returning HTML extraction result');
        }
      }
      
      // Return error if both methods failed
      return {
        error: 'SCRAPING_ERROR',
        error_msg: 'Failed to extract data from HTML and API',
        data: { item: {} as any }
      };
    } catch (error: any) {
      await this.sleep(this.config.retryDelay * Math.pow(2, retries));
      
      if (retries < this.config.maxRetries) {
        return this.fetchWithRetry(url, config, retries + 1);
      }
      
      console.error('Browser scraping error:', error.message);
      return {
        error: 'SCRAPING_ERROR',
        error_msg: error.message || 'Failed to scrape with browser',
        data: { item: {} as any }
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async scrapeProduct(request: ShopeeProductRequest): Promise<ShopeeProductResponse> {
    const { storeId, dealId } = request;

    // Try get_pc endpoint first
    const url = `${SHOPEE_API.baseUrl}${SHOPEE_API.endpoints.get_pc}`;
    const params = {
      item_id: dealId,
      shop_id: storeId
    };

    try {
      const data = await this.fetchWithRetry(url, { params });
      
      if (data && data.data && data.data.item) {
        return data as ShopeeProductResponse;
      }

      // Fallback to get_rw endpoint
      const rwUrl = `${SHOPEE_API.baseUrl}${SHOPEE_API.endpoints.get_rw}`;
      const rwData = await this.fetchWithRetry(rwUrl, { params });
      
      return rwData as ShopeeProductResponse;
    } catch (error: any) {
      console.error('Scraping error:', error.message);
      return {
        error: 'SCRAPING_ERROR',
        error_msg: error.message || 'Failed to scrape product data',
        data: { item: {} as any }
      };
    }
  }

  async scrapeMultipleProducts(requests: ShopeeProductRequest[]): Promise<ShopeeProductResponse[]> {
    const results: ShopeeProductResponse[] = [];
    const concurrency = 3; // Reduced concurrency to avoid detection

    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(req => this.scrapeProduct(req))
      );
      results.push(...batchResults);

      // Add longer delay between batches to avoid rate limiting
      if (i + concurrency < requests.length) {
        await this.sleep(3000);
      }
    }

    return results;
  }

  updateConfig(newConfig: Partial<ScraperConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.proxies) {
      this.proxyManager = new ProxyManager(newConfig.proxies);
    }
  }

  getStats() {
    return {
      proxyCount: this.proxyManager.getProxyCount(),
      useProxy: this.config.useProxy,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout
    };
  }
}

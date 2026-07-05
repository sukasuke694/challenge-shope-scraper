import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ShopeeScraper } from './scraper';
import { ShopeeProductRequest } from './types';
import { API_CONFIG } from './config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

const app = express();
const scraper = new ShopeeScraper();
const COOKIE_FILE = path.join(__dirname, '../shopee_cookies.json');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: API_CONFIG.rateLimitWindowMs,
  max: API_CONFIG.rateLimitMax,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    error_msg: 'Too many requests, please try again later'
  }
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const cookieFileExists = fs.existsSync(COOKIE_FILE);
  let cookieInfo = null;
  
  if (cookieFileExists) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
      cookieInfo = {
        exists: true,
        count: cookies.length,
        lastModified: fs.statSync(COOKIE_FILE).mtime
      };
    } catch (e) {
      cookieInfo = { exists: true, error: 'Failed to read cookies' };
    }
  } else {
    cookieInfo = { exists: false };
  }
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: scraper.getStats(),
    cookies: cookieInfo
  });
});

// Main scraping endpoint
app.get('/api/shopee', async (req: Request, res: Response) => {
  const { storeId, dealId } = req.query;

  if (!storeId || !dealId) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      error_msg: 'storeId and dealId are required parameters'
    });
  }

  const request: ShopeeProductRequest = {
    storeId: storeId as string,
    dealId: dealId as string
  };

  try {
    const result = await scraper.scrapeProduct(request);
    
    if (result.error) {
      return res.status(500).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('API Error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      error_msg: error.message || 'An unexpected error occurred'
    });
  }
});

// Batch scraping endpoint
app.post('/api/shopee/batch', async (req: Request, res: Response) => {
  const { requests } = req.body;

  if (!Array.isArray(requests) || requests.length === 0) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      error_msg: 'requests must be a non-empty array'
    });
  }

  // Validate each request
  for (const req of requests) {
    if (!req.storeId || !req.dealId) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        error_msg: 'Each request must have storeId and dealId'
      });
    }
  }

  try {
    const results = await scraper.scrapeMultipleProducts(requests);
    
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;

    res.json({
      total: results.length,
      success: successCount,
      errors: errorCount,
      error_rate: (errorCount / results.length * 100).toFixed(2) + '%',
      results
    });
  } catch (error: any) {
    console.error('Batch API Error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      error_msg: error.message || 'An unexpected error occurred'
    });
  }
});

// Stats endpoint
app.get('/api/stats', (req: Request, res: Response) => {
  res.json(scraper.getStats());
});

// Login endpoint for manual Shopee login
app.post('/api/shopee/login', async (req: Request, res: Response) => {
  console.log('Starting manual login process...');
  
  try {
    const browser = await puppeteer.launch({
      headless: false, // Show browser for manual login
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    
    // Set realistic viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      isLandscape: true
    });

    // Navigate to Shopee login page
    console.log('Navigating to Shopee login page...');
    await page.goto('https://shopee.tw/user/login', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('Browser opened. Please complete the login manually.');
    console.log('The browser will close automatically after login is detected or after 5 minutes.');

    // Wait for login to complete (check for login cookies)
    let isLoggedIn = false;
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();

    while (!isLoggedIn && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
      
      const cookies = await page.cookies();
      const hasAuthCookies = cookies.some(c => 
        c.name.includes('SPC_EC') || 
        c.name.includes('SPC_CLIENT_ID') ||
        c.name.includes('SPC_F')
      );

      if (hasAuthCookies) {
        isLoggedIn = true;
        console.log('Login detected! Saving cookies...');
        
        // Save cookies to file
        fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
        
        await browser.close();
        
        return res.json({
          success: true,
          message: 'Login successful! Cookies saved to shopee_cookies.json',
          cookieCount: cookies.length
        });
      }
    }

    // Timeout
    await browser.close();
    
    return res.status(408).json({
      error: 'LOGIN_TIMEOUT',
      error_msg: 'Login timeout. Please try again.'
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'LOGIN_ERROR',
      error_msg: error.message || 'Failed to initiate login process'
    });
  }
});

// Start server
const PORT = API_CONFIG.port;
app.listen(PORT, () => {
  console.log(`Shopee Scraper API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Scrape endpoint: http://localhost:${PORT}/api/shopee?storeId=xxx&dealId=xxx`);
});

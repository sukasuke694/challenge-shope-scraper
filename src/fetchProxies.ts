import axios from 'axios';

interface Proxy {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
}

async function fetchFreeProxies(): Promise<Proxy[]> {
  const proxies: Proxy[] = [];
  
  try {
    // Try multiple free proxy sources
    const sources = [
      'https://proxylist.geonode.com/api/proxy-list?limit=10&page=1&sort_by=last_checked&sort_type=desc&protocols=http',
      'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
      'https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list'
    ];

    for (const source of sources) {
      try {
        console.log(`Fetching from: ${source}`);
        const response = await axios.get(source, { timeout: 10000 });
        
        if (source.includes('geonode')) {
          // Parse JSON response
          const data = response.data;
          if (Array.isArray(data.data)) {
            data.data.forEach((proxy: any) => {
              if (proxy.protocols.includes('http')) {
                proxies.push({
                  host: proxy.ip,
                  port: proxy.port
                });
              }
            });
          }
        } else {
          // Parse text response (format: ip:port)
          const lines = response.data.split('\n');
          lines.forEach((line: string) => {
            const match = line.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)$/);
            if (match) {
              proxies.push({
                host: match[1],
                port: parseInt(match[2])
              });
            }
          });
        }
        
        if (proxies.length > 0) {
          console.log(`Found ${proxies.length} proxies`);
          break;
        }
      } catch (error) {
        console.log(`Failed to fetch from ${source}`);
        continue;
      }
    }
  } catch (error) {
    console.error('Error fetching proxies:', error);
  }

  return proxies;
}

async function main() {
  console.log('Fetching free proxies...');
  const proxies = await fetchFreeProxies();
  
  if (proxies.length === 0) {
    console.log('No proxies found. Please add proxies manually to .env file.');
    console.log('\nYou can get free proxies from:');
    console.log('- https://www.proxy-list.download/');
    console.log('- https://free-proxy-list.net/');
    console.log('- https://hideip.me/');
    return;
  }

  console.log('\nProxies found:');
  console.log(JSON.stringify(proxies, null, 2));
  
  console.log('\nAdd this to your .env file:');
  console.log(`USE_PROXY=true`);
  console.log(`PROXIES=${JSON.stringify(proxies)}`);
}

main().catch(console.error);

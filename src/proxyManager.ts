import { ProxyConfig } from './types';

export class ProxyManager {
  private proxies: ProxyConfig[];
  private currentIndex: number = 0;

  constructor(proxies: ProxyConfig[] = []) {
    this.proxies = proxies;
  }

  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  getRandomProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * this.proxies.length);
    return this.proxies[randomIndex];
  }

  addProxy(proxy: ProxyConfig): void {
    this.proxies.push(proxy);
  }

  removeProxy(proxy: ProxyConfig): void {
    this.proxies = this.proxies.filter(p => 
      p.host !== proxy.host || p.port !== proxy.port
    );
  }

  getProxyCount(): number {
    return this.proxies.length;
  }
}

import axios, {
  AxiosRequestConfig,
  AxiosInstance,
  AxiosResponse,
  AxiosError
} from 'axios'
import * as cheerio from 'cheerio'
import type { Browser, Page } from 'puppeteer'
import puppeteer from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
class RequestService {
  instance: AxiosInstance
  browser: Browser | undefined
  retry = 5

  constructor(private config: AxiosRequestConfig, private isUseCloudflareProtection = false) {
    this.instance = axios.create(this.config)
    puppeteer.use(Stealth())
  }
  private parseResult(data: AxiosResponse): cheerio.CheerioAPI | object {
    if (data.headers['content-type'].includes('application/json')) {
      return data.data
    }
    return cheerio.load(data.data)
  }
  async createBrowser() {
    return (await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-site-isolation-trials'],
      executablePath: process.env.PUPPETEER_EXEC_PATH
    })) as unknown as Browser
  }
  getDomainFromURL(url: string) {
    const domain = url.match(/^https?:\/\/([^/]+)/i)
    return domain?.[1]
  }
  async load(url: string, retryCount = 0): Promise<cheerio.CheerioAPI | undefined> {
    if (!this.browser) this.browser = await this.createBrowser();
    const page = await this.browser.newPage()
    try {
      if (retryCount > 1 && this.isUseCloudflareProtection) await page.setJavaScriptEnabled(true)
      const convertedCookies = this.config.headers?.cookie
        ?.toString()
        .split(';')
        .map(cookie => {
          const [name, value] = cookie.split('=')
          return { name, value, domain: this.getDomainFromURL(this.config.baseURL || url) }
        })
      if (convertedCookies) {
        for (const cookie of convertedCookies) {
          await page.setCookie(cookie)
        }
      }
      if (typeof this.config.headers?.userAgent == 'string') page.setUserAgent(this.config.headers?.userAgent)
      await page.goto(this.config.baseURL + url, {
        waitUntil: retryCount > 1 ? 'networkidle2' : 'load',
        //3 minutes
        timeout: 180000
      })
      if (this.isUseCloudflareProtection) await page.waitForSelector('body > pre', {
        timeout: retryCount === 0 ? 2500 : 7500
      })
      const html = await page.content()
      page.close();
      return cheerio.load(html)
    } catch (e) {
      if (retryCount < this.retry) {
        console.log(`[${retryCount}] load ${e} error retrying: ${url}`)
        page.close();
        await this.wait(5000);
        return this.load(url, retryCount + 1)
      }
      console.error(e)
    } finally {
      try { if (page) await page.close() } catch (e) { }
    }
  }
  async get(url: string, config?: AxiosRequestConfig, retryCount = 0) {
    return new Promise<cheerio.CheerioAPI | object>(async (resolve, reject) => {
      try {
        const result = await this.instance.get(url, config)
        resolve(this.parseResult(result))
      } catch (e) {
        const errorList = [
          'EPROTO',
          'EADDRINUSE',
          'ETIMEDOUT',
          'ECONNRESET',
          'ENOBUFS'
        ]
        if(e instanceof AxiosError){
          if(e.response && e.response.data) resolve(this.parseResult(e.response))
          if (errorList.includes(e.code || '')) {
            if (retryCount < this.retry) {
              console.log(
                `[${retryCount}] get ${e.code} ${e.response?.status} error retrying: ${e.config.url}`
              )
              await this.wait(5000);
              resolve(this.get(url, config, retryCount + 1))
            }
          }
        }
        reject(e)
      }
    })
  }
  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return new Promise<cheerio.CheerioAPI | object>(async (resolve, reject) => {
      try {
        const result = await this.instance.post(url, data, config)
        resolve(this.parseResult(result))
      } catch (e) {
        reject(e)
      }
    })
  }
  async request(config: AxiosRequestConfig) {
    return new Promise<cheerio.CheerioAPI | object>(async (resolve, reject) => {
      try {
        const result = await this.instance.request(config)
        resolve(this.parseResult(result))
      } catch (e) {
        reject(e)
      }
    })
  }
  async wait(time: number) {
    new Promise((resolve) => setTimeout(resolve, time))
  }
}
export default RequestService

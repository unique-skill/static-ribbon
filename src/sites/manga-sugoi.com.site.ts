import ManageSite from '../classes/MangaSite.class'
import MangaSiteMeta from '../interfaces/MangaSiteMeta.interface'
import RequestService from '../services/request.service'
import { CheerioAPI } from 'cheerio'
import MangaMeta from '../interfaces/MangaMeta.interface'
import { estimateTime, formatDisplayTime, pastTimeToDate } from '../services/time.service'
import ChapterMeta from '../interfaces/ChapterMeta.interface'
import ChapterPageMeta from '../interfaces/ChapterPageMeta.interface'
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'fs'
import { writeFile, appendFile } from 'fs/promises'
import PQueue from 'p-queue'
import MangaSiteIndex from '../interfaces/MangaSiteIndex'
const currentWorker = +(process.env?.WORKER_INDEX ?? 1)
const totalWorker = +(process.env?.WORKER_COUNT ?? 1)
class MangaSugoiSite implements ManageSite {
  request: RequestService = new RequestService({
    baseURL: 'https://manga-sugoi.com',
    headers: {
      'Content-Type': '*/*',
      'User-Agent': this.userAgent,
    },
    timeout: 180000
  })
  siteId = 3
  meta: MangaSiteMeta = {
    siteId: this.siteId,
    name: 'MangaSugoi',
    totalPages: 0,
    index: []
  }
  queue: PQueue
  totalMangas: number = 0
  progressTimer: NodeJS.Timeout | undefined
  constructor(public userAgent: string) {
    this.queue = new PQueue({ concurrency: 6 });
  }
  async run() {
    console.log(`[${this.meta.name}] Start to run [${this.meta.name}]`)
    await this.updateTotalPages()
    console.log(`[${this.meta.name}] Total pages: ${this.meta.totalPages}`)
    await this.fetchMangas()
    await this.writeIndexToFile()
  }
  makeFolder() {
    //If data/ is not exist, create it
    if (!existsSync('data')) {
      mkdirSync('data')
    }
    //If data/siteId is not exist, create it
    if (!existsSync(`data/${this.siteId}`)) {
      mkdirSync(`data/${this.siteId}`)
    }
  }
  async fetchMangas() {
    const since = performance.now()
    const startTime = new Date()
    this.makeFolder()
    console.log(`[${this.meta.name}] Start fetch manga list...`)
    let startPage = 1
    let endPage = this.meta.totalPages
    if (totalWorker > 1) {
      const totalPagesPerWorker = Math.ceil(this.meta.totalPages / totalWorker)
      startPage = currentWorker * totalPagesPerWorker + 1
      endPage = (currentWorker + 1) * totalPagesPerWorker
      if (endPage > this.meta.totalPages) endPage = this.meta.totalPages
    }
    console.log(
      `[${this.meta.name}] Worker ${currentWorker} start from page ${startPage} to ${endPage}`
    )
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      const page = (await this.request.get(
        `/page/${currentPage}`
      )) as CheerioAPI
      const mangas = page('div.flexbox4').find('div.flexbox4-content')
      console.log(`[${this.meta.name}] Page ${currentPage} (${startPage}-${endPage}/${this.meta.totalPages})`)
      console.log(`[${this.meta.name}] Queue ${this.queue.pending} pending ${this.queue.size} total`)
      for (const manga of mangas) {
        const url = page(manga).children().first().attr('href')
        const mangaId = url?.split('/')[4] || '#'
        this.totalMangas++
        this.queue.add(async () => {
          try {
            const manga = await this.getMangaMeta(mangaId, true, true)
            //Write it to file
            await writeFile(
              `data/${this.siteId}/${mangaId}.json`,
              JSON.stringify(manga)
            )
            this.addIndex(manga)
          } catch (e) {
            console.log(`[${this.meta.name}] Error while fetch manga: ${e}`)
          }
        })
      }
    }
    this.progressTimer = setInterval(async () => {
      console.log(
        `[${this.meta.name}] (${((this.meta.index.length / (this.totalMangas)) * 100).toFixed(
          4
        )}%) | ${this.meta.index.length}/${this.totalMangas} | ${formatDisplayTime((new Date().getTime() - startTime.getTime()) / 1000)}/${formatDisplayTime(
          estimateTime({
            current: this.meta.index.length,
            total: this.totalMangas,
            since
          })
        )}`
      )
    }, 10000)
    await this.queue.onIdle()
    clearInterval(this.progressTimer)
    console.log(`[${this.meta.name}] Finsihed loaded ${this.meta.index.length} mangas`)
  }
  async writeIndexToFile() {
    //Write index to file
    await writeFile(
      `data/${this.siteId}/${currentWorker}-index.json`,
      JSON.stringify(this.meta.index)
    )
  }
  addIndex(manga: MangaMeta) {
    const index: MangaSiteIndex = {
      mangaId: manga.mangaId,
      title: manga.title,
      otherTitles: manga.otherTitles,
      tags: manga.tags,
      thumbnail: manga.thumbnail,
      year: manga.year,
      lastUpdated: manga.lastUpdated,
      status: manga.status,
      totalChapters: manga.chapters.length,
      totalPages: manga.chapters.map(c => c.pages.length).reduce((a, b) => a + b, 0),
    }
    this.meta.index.push(index)
  }
  async updateTotalPages() {
    const homePage = (await this.request.get('/page/1')) as CheerioAPI
    const totalPages = homePage('div.pagination')
      .find('a')
      .last()
      .prev()
      .text()
    console.log(
      `[${this.meta.name}] Total pages: ${totalPages}`
    )
    this.meta.totalPages = parseInt(
      totalPages,
      10
    )
  }
  async getMangaMeta(
    mangaId: string,
    fetchChapters = false,
    fetchPage = false
  ): Promise<MangaMeta> {
    return new Promise<MangaMeta>(async (resolve, reject) => {
      try {
        const page = (await this.request.get(`/series/${mangaId}`)) as CheerioAPI
        const panelBody = page('div.series-flex')
        const aniframe = page(panelBody).find('div.series-flexleft')
        const topInfomationBody = panelBody.find('div.series-flexright')
        const status = aniframe.find('span.status').text()?.toUpperCase();
        let year = "1980";
        let author: string[] = [];
        let artist: string[] = [];
        let otherTitles: string[] = [];
        for (const info of aniframe.find('ul.series-infolist').find('li')) {
          const text = page(info).children().first().text();
          const data = page(info).find('span').first().text();
          switch (text) {
            case 'Published':
              year = data
              break;
            case 'Author':
              author = data?.split(',') || []
              break;
            case 'Artist':
              artist = data?.split(',') || []
              break;
            case 'Alternative':
              otherTitles = data?.split(',') || []
              break;
          }
        }
        const chapters = fetchChapters
          ? await this.getChapterList(mangaId, fetchPage)
          : []
        let tags = [];
        for (const tag of topInfomationBody.find('div.series-genres').find('a')) {
          tags.push(page(tag).text())
        }
        //Find newest chapter and get date
        const toYear = new Date();
        toYear.setFullYear(parseInt(year));
        const lastUpdated = chapters.length > 0 ? chapters.map(c => c.lastUpdated).sort((a, b) => b.getTime() - a.getTime())[0] : toYear;

        let description = topInfomationBody.find('div.series-synops').text()
        //If have \n from frist and end of description, remove it
        if (description) {
          if (description.startsWith('\n')) description = description.substring(1)
          if (description.endsWith('\n')) description = description.substring(0, description.length - 1)
        }

        //Filter all "" string
        artist = artist.filter(a => a != "")
        author = author.filter(a => a != "")
        tags = tags.filter(a => a != "")

        const mangaMeta: MangaMeta = {
          siteId: this.siteId,
          mangaId,
          created: lastUpdated,
          lastUpdated,
          title: topInfomationBody.find('.series-title').children().first().text() || null,
          otherTitles,
          status,
          description,
          year: parseInt(year) || 1980,
          thumbnail:
            aniframe.find('img').attr('src') || null,
          chapters,
          author,
          artist,
          tags,
          publisher: null,
        }
        resolve(mangaMeta)
      } catch (e) {
        console.log(`[${this.meta.name}] Error update manga meta: ${e}`)
        reject(e)
      }
    })
  }
  async getChapterList(
    mangaId: string,
    fetchPage = false
  ): Promise<ChapterMeta[]> {
    return new Promise<ChapterMeta[]>(async (resolve, reject) => {
      const chapters = []
      try {
        const page = (await this.request.get(`/${mangaId}`)) as CheerioAPI
        const chapterList = page('ul.series-chapterlist').children().find('div.flexch-infoz')
        for (const chapter of chapterList) {
          const atag = page(chapter).find('a')
          const updated = atag.children().last().text()
          const name = atag.children().first().text()
          const chapterId = atag.attr('href')?.split('/')[3] || '0'
          let nameSplit = name.split(' ');
          let chapterCount = nameSplit[nameSplit.length - 1];
          if (!chapterCount) chapterCount = nameSplit[nameSplit.length - 2];
          const pages = fetchPage
            ? await this.getChapterPages(mangaId, chapterId)
            : []
          const chapterMeta: ChapterMeta = {
            siteId: this.siteId,
            mangaId,
            chapterId,
            name: name || null,
            chapterCount: parseInt(chapterCount || '-1', 10),
            lastUpdated: pastTimeToDate(updated),
            pages
          }
          chapters.push(chapterMeta)
        }
        resolve(chapters)
      } catch (e) {
        console.log(e)
        console.log(`[${this.meta.name}] Error loading chapter list: ${e}`)
        reject(e)
      }
    })
  }
  async getChapterPages(
    mangaId: string,
    chapterId: string
  ): Promise<ChapterPageMeta[]> {
    return new Promise<ChapterPageMeta[]>(async (resolve, reject) => {
      const pages = []
      try {
        const page = (await this.request.get(
          `/${chapterId}`
        )) as CheerioAPI
        const chapterPage = page('div.reader-area').find('img')
        for (const page of chapterPage) {
          const att = page.attribs
          let pageId = '0';
          try {
            pageId = att['alt'].split(" ")[att['alt'].split(" ").length - 1].replace('(', '').replace(')', '');
          } catch (e) { }
          const chapterPageMeta: ChapterPageMeta = {
            siteId: this.siteId,
            mangaId,
            chapterId,
            pageId,
            name: att['alt'] || '',
            url: att['src']?.replace('\n', '') || ''
          }
          pages.push(chapterPageMeta)
        }
        resolve(pages)
      } catch (e) {
        console.log(e)
        console.log(`[${this.meta.name}] Error loading chapter page: ${e}`)
        reject(e)
      }
    })
  }
  getSiteId(): number {
    return this.siteId
  }
}
export default MangaSugoiSite

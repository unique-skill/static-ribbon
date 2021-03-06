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
class MangaThaiSite implements ManageSite {
  request: RequestService = new RequestService({
    baseURL: 'https://mangathai.com',
    headers: {
      'Content-Type': '*/*',
      'User-Agent': this.userAgent,
      cookie: 'configPageView=all'
    },
    timeout: 180000
  })
  siteId = 1
  totalMangas: number = 0
  meta: MangaSiteMeta = {
    siteId: this.siteId,
    name: 'MangaThai',
    totalPages: 0,
    index: []
  }
  queue: PQueue
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
      const mangas = page('div.aniframe')
      console.log(`[${this.meta.name}] Page ${currentPage} (${startPage}-${endPage}/${this.meta.totalPages})`)
      console.log(`[${this.meta.name}] Queue ${this.queue.pending} pending ${this.queue.size} total`)
      for (const manga of mangas) {
        const url = page(manga).find('a').last().attr('href')
        const mangaId = url?.split('/')[3] || '#'
        this.totalMangas++
        // let mangaMeta: MangaMeta = {
        //     siteId: this.siteId,
        //     mangaId: mangaId,
        //     lastUpdated: pastTimeToDate(page(manga).find(".label-ago").first().text()),
        //     title: page(manga).find(".manga-title").text() || 'No title available',
        //     otherTitles: [],
        //     status: "",
        //     description: page(manga).find("a").attr("data-original-title") || 'No description available',
        //     year: 0,
        //     thumbnail: page(manga).find("img").attr("src") || 'No thumbnail available',
        //     totalChapters: 0,
        // }
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
    const totalPages = homePage('ul.pagination')
      .find('li')
      .last()
      .prev()
      .text()
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
        const page = (await this.request.get(`/${mangaId}`)) as CheerioAPI
        const panelBody = page('div.panel-body>div.row')
        const aniframe = page(panelBody).find('div.aniframe')
        const topInfomationBody = panelBody.find(
          'div.col-lg-9.col-sm-8.col-xs-12'
        )
        const infomationBody = topInfomationBody.find('p')
        const rawOtherTitles = infomationBody.first().text().split(' :  ')[1]
        const otherTitles =
          rawOtherTitles == '-' || rawOtherTitles == ' '
            ? []
            : rawOtherTitles.split(',')
        let status = infomationBody.find('.label-info').text()
        switch (status) {
          case '????????????????????????':
              status = 'ONGOING'
              break
          case '??????????????????':
              status = 'COMPLETED'
              break
          default:
              status = 'UNKNOWN'
      }
        const year = infomationBody.find('.label-primary').text()
        const chapters = fetchChapters
          ? await this.getChapterList(mangaId, fetchPage)
          : []
        //Find newest chapter and get date
        const lastUpdated = chapters.length > 0 ? chapters.map(c => c.lastUpdated).sort((a, b) => b.getTime() - a.getTime())[0] : new Date(0);
        const mangaMeta: MangaMeta = {
          siteId: this.siteId,
          mangaId,
          created: pastTimeToDate(
            aniframe.find('.label-ago').first().text()
          ),
          lastUpdated: lastUpdated,
          title: page('#thisPostname').text() || null,
          otherTitles,
          status,
          description:
            topInfomationBody.find('.text-warning').text() ||
            null,
          year: parseInt(year, 10) || 0,
          thumbnail:
            aniframe.find('img').attr('src') || null,
          chapters,
          author: [],
          artist: [],
          tags: [],
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
        const chapterList = page('tbody').children()
        for (const chapter of chapterList) {
          const name = page(chapter).find('a')
          const updated = name.parent().next().html() || '0 ????????? ?????????????????????'
          const chapterId = name.attr('href')?.split('/')[4] || '0'
          const pages = fetchPage
            ? await this.getChapterPages(mangaId, chapterId)
            : []
          const chapterMeta: ChapterMeta = {
            siteId: this.siteId,
            mangaId,
            chapterId,
            name: name.html() || null,
            chapterCount: parseInt(
              name.attr('href')?.split('/')[4]?.split('-')[1] || '-1'
            ),
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
          `/${mangaId}/${chapterId}`
        )) as CheerioAPI
        const chapterPage = page('div.display_content').find('img')
        for (const page of chapterPage) {
          const att = page.attribs
          const chapterPageMeta: ChapterPageMeta = {
            siteId: this.siteId,
            mangaId,
            chapterId,
            pageId: att['id'] || '0',
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
export default MangaThaiSite

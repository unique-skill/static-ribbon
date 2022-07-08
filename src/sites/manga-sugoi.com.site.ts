import ManageSite from '../classes/MangaSite.class'
import MangaSiteMeta from '../interfaces/MangaSiteMeta.interface'
import RequestService from '../services/request.service'
import { CheerioAPI } from 'cheerio'
import * as core from '@actions/core'
import MangaMeta from '../interfaces/MangaMeta.interface'
import { pastTimeToDate } from '../services/time.service'
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
  constructor(public userAgent: string) { }
  async run() {
    core.info(`Start to run ${this.meta.name}`)
    await this.updateTotalPages()
    core.info(`Total pages: ${this.meta.totalPages}`)
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
    this.makeFolder()
    const queue = new PQueue({ concurrency: 4 })
    core.info('Start fetch manga list...')
    let startPage = 1
    let endPage = this.meta.totalPages
    if (totalWorker > 1) {
      const totalPagesPerWorker = Math.ceil(this.meta.totalPages / totalWorker)
      startPage = currentWorker * totalPagesPerWorker + 1
      endPage = (currentWorker + 1) * totalPagesPerWorker
      if (endPage > this.meta.totalPages) endPage = this.meta.totalPages
    }
    core.info(
      `Worker ${currentWorker} start from page ${startPage} to ${endPage}`
    )
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      const page = (await this.request.get(
        `/page/${currentPage}`
      )) as CheerioAPI
      const mangas = page('div.flexbox4').find('div.flexbox4-content')
      core.info(`Page ${currentPage} (${startPage}-${endPage}/${this.meta.totalPages})`)
      core.info(`Queue ${queue.pending} pending ${queue.size} total`)
      for (const manga of mangas) {
        const url = page(manga).children().first().attr('href')
        const mangaId = url?.split('/')[4] || '#'
        queue.add(async () => {
          try {
            const manga = await this.getMangaMeta(mangaId, true, true)
            //Write it to file
            await writeFile(
              `data/${this.siteId}/${mangaId}.json`,
              JSON.stringify(manga)
            )
            this.addIndex(manga)
            core.info(`Start load ${this.meta.index.length} mangas`)
          } catch (e) {
            core.info(`Error while fetch manga: ${e}`)
          }
        })
      }
    }
    await queue.onIdle()
    core.info(`Finsihed loaded ${this.meta.index.length} mangas`)
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
    core.info(
      `Total pages: ${totalPages}`
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
        const status = aniframe.find('div.status').text()
        const chapters = fetchChapters
          ? await this.getChapterList(mangaId, fetchPage)
          : []
        const tags = [];
        for (const tag of topInfomationBody.find('div.series-genres').find('a')) {
          tags.push(page(tag).text())
        }
        const description = topInfomationBody.find('div.series-synops').text()
        const mangaMeta: MangaMeta = {
          siteId: this.siteId,
          mangaId,
          created: new Date(),
          lastUpdated: new Date(),
          title: topInfomationBody.find('.series-title').children().first().text() || '-',
          otherTitles: [],
          status,
          description:
            description ||
            '-',
          year: 0,
          thumbnail:
            aniframe.find('img').attr('src') || '-',
          chapters,
          writer: '-',
          artist: '-',
          tags,
          publisher: '-',
        }
        core.info(`Start load ${mangaMeta.title}`)
        resolve(mangaMeta)
      } catch (e) {
        core.info(`Error update manga meta: ${e}`)
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
            name: name || '-',
            chapterCount: parseInt(chapterCount || '-1', 10),
            lastUpdated: pastTimeToDate(updated),
            pages
          }
          chapters.push(chapterMeta)
        }
        resolve(chapters)
      } catch (e) {
        console.log(e)
        core.info(`Error loading chapter list: ${e}`)
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
        core.info(`Error loading chapter page: ${e}`)
        reject(e)
      }
    })
  }
  getSiteId(): number {
    return this.siteId
  }
}
export default MangaSugoiSite

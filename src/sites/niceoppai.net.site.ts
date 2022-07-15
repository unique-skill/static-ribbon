import ManageSite from "../classes/MangaSite.class"
import MangaSiteMeta from "../interfaces/MangaSiteMeta.interface"
import RequestService from "../services/request.service"
const currentWorker = +(process.env?.WORKER_INDEX ?? 1)
const totalWorker = +(process.env?.WORKER_COUNT ?? 1)
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from 'fs'
import { writeFile, appendFile } from 'fs/promises'
import PQueue from 'p-queue'
import { CheerioAPI } from "cheerio"
import MangaMeta from "../interfaces/MangaMeta.interface"
import { estimateTime, formatDisplayTime, strTimeToDate } from "../services/time.service"
import ChapterMeta from "../interfaces/ChapterMeta.interface"
import ChapterPageMeta from "../interfaces/ChapterPageMeta.interface"
import MangaSiteIndex from "../interfaces/MangaSiteIndex"
class NiceOppaiSite implements ManageSite {
    request: RequestService = new RequestService({
        baseURL: 'https://www.niceoppai.net',
        headers: {
            'Content-Type': '*/*',
            'User-Agent': this.userAgent,
            cookie: 'configPageView=all'
        },
        timeout: 180000
    })
    siteId = 2
    totalMangas: number = 0
    meta: MangaSiteMeta = {
        siteId: this.siteId,
        name: 'Nice Oppai',
        totalPages: 0,
        index: []
    }
    progressTimer: NodeJS.Timeout | undefined
    queue: PQueue
    constructor(public userAgent: string) {
        this.queue = new PQueue({ concurrency: 6 });
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
    async run() {
        console.log(`[${this.meta.name}] Start to run [${this.meta.name}]`)
        await this.updateTotalPages()
        console.log(`[${this.meta.name}] Total pages: ${this.meta.totalPages}`)
        await this.fetchMangas()
        await this.writeIndexToFile()
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
            `Worker ${currentWorker} start from page ${startPage} to ${endPage}`
        )
        for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
            const page = (await this.request.get(
                `/manga_list/all/any/name-az/${currentPage}`
            )) as CheerioAPI
            const mangas = page('div.nde')
            console.log(`[${this.meta.name}] Page ${currentPage} (${startPage}-${endPage}/${this.meta.totalPages})`)
            console.log(`[${this.meta.name}] Queue ${this.queue.pending} pending ${this.queue.size} total`)
            for (const manga of mangas) {
                const url = page(manga).find('a').last().attr('href')
                const mangaId = url?.split('/')[3] || '#'
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
                )}%) | ${this.meta.index.length}/${this.totalMangas} | ${formatDisplayTime((new Date().getTime() - startTime.getTime())/1000)}/${formatDisplayTime(
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

    async getMangaMeta(
        mangaId: string,
        fetchChapters = false,
        fetchPage = false
    ): Promise<MangaMeta> {
        return new Promise<MangaMeta>(async (resolve, reject) => {
            try {
                const page = (await this.request.get(`/${mangaId}`)) as CheerioAPI
                const panelBody = page('div.mng_ifo')
                const det = panelBody.find('div.det').find('p')
                const created = strTimeToDate(det.eq(7).text().split(': ')[1])
                const otherTitles = [];
                const title = page('h1.ttl').first().text()

                if(det.eq(1).text()?.split(': ')[1] !== '-') otherTitles.push(det.eq(1).text()?.split(': ')[1])
                const year = det.eq(8).text()?.split(': ')[1]
                let status = det.eq(9).text()?.split(': ')[1]
                switch (status) {
                    case 'ยังไม่จบ':
                        status = 'ONGOING'
                        break
                    case 'จบแล้ว':
                        status = 'COMPLETED'
                        break
                    default:
                        status = 'UNKNOWN'
                }
                const description = det.eq(0).text() != '-' && det.eq(0).text() != '' ? det.eq(0).text() : null
                const artist = [det.eq(2).text()?.split(': ')[1]]
                if(artist[0] === '-') artist.pop()
                const author = [det.eq(3).text()?.split(': ')[1]]
                if(author[0] === '-') author.pop()
                const tags = det.eq(5).text()?.split(':\n')[1]?.split(', ') || []
                const publisher = det.eq(4).text().split(': ')[1] != '-' ? det.eq(4).text().split(': ')[1] : null

                //If have space from frist and end of tags, remove it
                for(let i = 0; i < tags.length; i++) {
                    if(tags[i].startsWith(' ')) tags[i] = tags[i].substring(1)
                    if(tags[i].endsWith(' ')) tags[i] = tags[i].substring(0, tags[i].length - 1)
                }

                const chapters = fetchChapters
                    ? await this.getChapterList(mangaId, fetchPage)
                    : []
                //Find newest chapter and get date
                const lastUpdated = chapters.length > 0 ? chapters.map(c => c.lastUpdated).sort((a, b) => b.getTime() - a.getTime())[0] : created;
                const mangaMeta: MangaMeta = {
                    siteId: this.siteId,
                    mangaId,
                    created,
                    lastUpdated,
                    title,
                    otherTitles,
                    status,
                    description,
                    year: parseInt(year),
                    thumbnail: panelBody.find('img.cvr').attr('src') || '',
                    chapters,
                    artist,
                    author,
                    tags,
                    publisher
                }
                resolve(mangaMeta)
            } catch (e) {
                console.log(`[${this.meta.name}] Error update manga meta: ${e}`)
                reject(e)
            }
        })
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
        const homePage = (await this.request.get('/manga_list/all/any/name-az/1')) as CheerioAPI
        const totalPages = homePage('ul.pgg').find('li').last().children().first().attr('href')?.split('/')[7] || '1';
        console.log(
            `Total pages: ${totalPages}`
        )
        this.meta.totalPages = parseInt(
            totalPages,
            10
        )
    }

    async getChapterList(
        mangaId: string,
        fetchPage = false
    ): Promise<ChapterMeta[]> {
        return new Promise<ChapterMeta[]>(async (resolve, reject) => {
            const chapters = []
            try {
                const page = (await this.request.get(`/${mangaId}`)) as CheerioAPI
                const chapterList = page('ul.lst').find('li.lng_')
                for (const chapterElement of chapterList) {
                    const text = page(chapterElement).text();
                    if (text.includes('Nothing yet')) resolve(chapters)
                    const chapter = page(chapterElement).find('a.lst');
                    const updated = chapter.find('b.dte').text()
                    const fullName = chapter.find('b.val').text();
                    const chapterCount = fullName.split(' ')[1] || '0'
                    const chapterId = chapter.attr('href')?.split('/')[4] || '#'
                    const pages = fetchPage
                        ? await this.getChapterPages(mangaId, chapterId)
                        : []
                    const chapterMeta: ChapterMeta = {
                        siteId: this.siteId,
                        mangaId,
                        chapterId,
                        name: fullName || null,
                        chapterCount: isNaN(parseInt(chapterCount)) ? -1 : parseInt(chapterCount),
                        lastUpdated: strTimeToDate(updated),
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
                const chapterPage = page('#image-container').find('img')
                for (const page of chapterPage) {
                    const att = page.attribs
                    const chapterPageMeta: ChapterPageMeta = {
                        siteId: this.siteId,
                        mangaId,
                        chapterId,
                        pageId: pages.length.toString(),
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
export default NiceOppaiSite
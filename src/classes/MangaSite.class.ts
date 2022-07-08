import ChapterMeta from '../interfaces/ChapterMeta.interface'
import MangaMeta from '../interfaces/MangaMeta.interface'
import MangaSiteIndex from '../interfaces/MangaSiteIndex'
import MangaSiteMeta from '../interfaces/MangaSiteMeta.interface'
import RequestService from '../services/request.service'
import { writeFile, appendFile } from 'fs/promises'
class ManageSite {
  request: RequestService
  siteId = 0
  meta: MangaSiteMeta = {
    siteId: this.siteId,
    name: 'Unknown',
    totalPages: 0,
    index: []
  }
  constructor(public userAgent: string) {
    this.request = new RequestService({
      baseURL: 'https://yue.sh/',
      headers: {
        'Content-Type': '*/*',
        'User-Agent': this.userAgent
      }
    })
  }
  run() { }
  async writeIndexToFile() {
    //Write index to file
    await writeFile(
      `data/${this.siteId}/index.json`,
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
  getSiteId(): number {
    return this.siteId
  }
}
export default ManageSite

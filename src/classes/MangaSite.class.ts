import ChapterMeta from '../interfaces/ChapterMeta.interface'
import MangaMeta from '../interfaces/MangaMeta.interface'
import MangaSiteMeta from '../interfaces/MangaSiteMeta.interface'
import RequestService from '../services/request.service'
class ManageSite {
  request: RequestService
  siteId = 0
  meta: MangaSiteMeta = {
    siteId: this.siteId,
    name: 'Unknown',
    totalPages: 0
  }
  totalLoaded = 0
  constructor(public userAgent: string) {
    this.request = new RequestService({
      baseURL: 'https://yue.sh/',
      headers: {
        'Content-Type': '*/*',
        'User-Agent': this.userAgent
      }
    })
  }
  run() {}
  getSiteId(): number {
    return this.siteId
  }
}
export default ManageSite

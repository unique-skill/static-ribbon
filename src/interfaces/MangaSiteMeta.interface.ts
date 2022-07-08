import MangaMeta from './MangaMeta.interface'
import MangaSiteIndex from './MangaSiteIndex'

interface MangaSiteMeta {
  siteId: number
  name: string
  totalPages: number
  index: MangaSiteIndex[]
}
export default MangaSiteMeta

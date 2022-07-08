import ChapterMeta from './ChapterMeta.interface'

interface MangaMeta {
  siteId: number
  mangaId: string
  created: Date
  lastUpdated: Date
  title: string
  otherTitles: string[]
  status: string
  description: string
  year: number
  thumbnail: string
  chapters: ChapterMeta[]
  writer: string
  artist: string
  tags: string[]
  publisher: string
}
export default MangaMeta

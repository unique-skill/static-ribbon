import ChapterMeta from './ChapterMeta.interface'

interface MangaMeta {
  siteId: number
  mangaId: string
  created: Date
  lastUpdated: Date
  title: string | null
  otherTitles: string[]
  status: string
  description: string | null
  year: number
  thumbnail: string | null
  chapters: ChapterMeta[]
  author: string[]
  artist: string[]
  tags: string[]
  publisher: string | null
}
export default MangaMeta

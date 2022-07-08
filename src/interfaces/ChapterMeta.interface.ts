import ChapterPageMeta from './ChapterPageMeta.interface'

interface ChapterMeta {
  siteId: number
  mangaId: string
  chapterId: string
  name: string
  chapterCount: number
  lastUpdated: Date
  pages: ChapterPageMeta[]
}
export default ChapterMeta

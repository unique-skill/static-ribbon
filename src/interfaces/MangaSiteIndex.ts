interface MangaSiteIndex {
  mangaId: string
  title: string | null
  otherTitles: string[]
  tags: string[]
  thumbnail: string | null
  year: number
  lastUpdated: Date
  status: string
  totalChapters: number
  totalPages: number
}
export default MangaSiteIndex

const pastTimeToDate = (pastTime: string) => {
  try {
    //Input: "1 วัน ที่แล้ว  0" or "1 วัน ที่แล้ว  0" or "1 เดือน ที่แล้ว  0" or "1 ปี ที่แล้ว  0"
    //Output: Date
    const split = pastTime.split(' ')
    const time = split[0]
    const unit = split[1]
    const timeNumber = parseInt(time)
    const date = new Date()
    switch (unit) {
      case 'วัน':
        date.setDate(date.getDate() - timeNumber)
        break
      case 'อาทิตย์':
        date.setMonth(date.getMonth() - timeNumber)
        break
      case 'เดือน':
        date.setMonth(date.getMonth() - timeNumber)
        break
      case 'ปี':
        date.setFullYear(date.getFullYear() - timeNumber)
        break
    }
    return date
  } catch (e) {
    return new Date()
  }
}
const strTimeToDate = (time: string) => {
  //Input: Jan 08, 2019
  //Output: Date
  const split = time.split(' ')
  const month = split[0]
  const day = split[1]
  const year = split[2]
  const date = new Date()
  date.setDate(parseInt(day))
  date.setMonth(parseInt(month) - 1)
  date.setFullYear(parseInt(year))
  return date
}
const formatDisplayTime = (time: number) => {
  let seconds = ~~time
  let minutes = 0
  let hours = 0

  while (seconds >= 3600) {
    seconds -= 3600
    hours += 1
  }

  while (seconds >= 60) {
    seconds -= 60
    minutes += 1
  }

  if (hours) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes) return `${minutes}m ${seconds}s`

  return `${seconds}s`
}

const estimateTime = ({
  since,
  current,
  total
}: {
  since: number
  current: number
  total: number
}) => (((performance.now() - since) / current) * (total - current)) / 1000
export {pastTimeToDate, strTimeToDate, estimateTime, formatDisplayTime}

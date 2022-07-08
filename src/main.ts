import * as core from '@actions/core'
import MangaThaiSite from './sites/mangathai.com.site'
import randomUseragent from 'random-useragent'
import NiceOppaiSite from './sites/niceoppai.net.site'
import MangaSugoiSite from './sites/manga-sugoi.com.site'
async function run(): Promise<void> {
  try {
    const sites = [new MangaThaiSite(randomUseragent.getRandom()), new NiceOppaiSite(randomUseragent.getRandom()), new MangaSugoiSite(randomUseragent.getRandom())]
    const currentWorker = +(process.env?.WORKER_INDEX ?? 1)
    const totalWorker = +(process.env?.WORKER_COUNT ?? 1)

    core.info(`Worker ${currentWorker}/${totalWorker}`)
    // for (const site of sites) {
      // await site.run()
    // }
    await sites[1].run();
  } catch (error) {
    console.log(error)
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()

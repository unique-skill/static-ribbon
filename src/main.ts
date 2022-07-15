import * as core from '@actions/core'
import MangaThaiSite from './sites/mangathai.com.site'
import randomUseragent from 'random-useragent'
import NiceOppaiSite from './sites/niceoppai.net.site'
import MangaSugoiSite from './sites/manga-sugoi.com.site'
async function run(): Promise<void> {
  try {
    const sites = [new NiceOppaiSite(randomUseragent.getRandom()), new MangaSugoiSite(randomUseragent.getRandom()), new MangaThaiSite(randomUseragent.getRandom())]
    const currentWorker = +(process.env?.WORKER_INDEX ?? 1)
    const totalWorker = +(process.env?.WORKER_COUNT ?? 1)

    core.info(`Worker ${currentWorker}/${totalWorker}`);

    for (const site of sites) {
      try{
        await site.run()
      }catch(e){
        if(e instanceof Error){
          core.info(`Worker ${currentWorker}/${totalWorker} ${site.meta.name} error: ${e.message}`)
        }
      }
    }
  } catch (error) {
    console.log(error)
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run().catch(console.error);

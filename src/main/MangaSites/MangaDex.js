import fs from 'fs'
import path from 'path'
import { basePath, MangaSite } from './MangaSite'

class MangaDex extends MangaSite {
  constructor () {
    super()
    this.id = 0
    this.name = 'MangaDex'
    this.pattern = 'mangadex.org'
    this.indexPage = 'https://mangadex.org'
    this.mangaJSON = [/https:\/\/mangadex\.org\/api\/?id=(\d+)&type=manga/]
    this.chapterJSON = [/https:\/\/mangadex\.org\/api\/?id=(\d+)&server=[\w\d%\-.]*&type=chapter/]
    this.mangaInfoJs = fs.readFileSync(path.resolve(basePath, 'scripts', 'md_mangaInfo.js'), 'utf8')
  }

  isMangaURL (url = this._url) {
    return /https:\/\/mangadex\.org\/title\/(\d+)/.test(url)
  }

  isMangaChapterURL (url) {
    return /https:\/\/mangadex\.org\/chapter\/(\d+)/.test(url)
  }

  async getMangaInfo (view) {
    return view.webContents.executeJavaScriptInIsolatedWorld(1, [{ code: this.mangaInfoJs }])
  }

  getNetworkWatcherRulesSet () {
    return {
      response: true,
      headers: ['referer']
    }
  }

  parseRequest (request) {
    // console.log('request in ' + this.name, request.url)
  }

  parseResponse (response) {
    // console.log('response in ' + this.name, response.url, response.headers)
  }
}

export default MangaDex

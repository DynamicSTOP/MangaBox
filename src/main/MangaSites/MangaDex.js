import fs from 'fs'
import path from 'path'
import { basePath, MangaSite } from './MangaSite'

import { getSHA } from '../global'

class MangaDex extends MangaSite {
  constructor () {
    super()
    this.id = 0
    this.name = 'MangaDex'
    this.pattern = 'mangadex.org'
    this.indexPage = 'https://mangadex.org'
    this.mangaInfoJs = fs.readFileSync(path.resolve(basePath, 'scripts', 'md_mangaInfo.js'), 'utf8')

    this.regexps = {
      URL: {
        mangaJSON: /https:\/\/mangadex\.org\/api\/\?id=(\d+)&type=manga/,
        chapterJSON: /https:\/\/mangadex\.org\/api\/\?id=(\d+)&server=[\w\d%\-.]*&type=chapter/,
        manga: /https:\/\/mangadex\.org\/title\/(\d+)/,
        chapter: /https:\/\/mangadex\.org\/chapter\/(\d+)/
      }
    }

    this.rawMangaJSONSha = {}
    this.rawChaptersJSONs = {}
    this.imagePaths = {}
  }

  isMangaURL (url = this._url) {
    return this.regexps.URL.manga.test(url)
  }

  isMangaChapterURL (url) {
    return this.regexps.URL.chapter.test(url)
  }

  async setStorage (storage) {
    const allManga = await super.setStorage(storage)
    allManga.map((manga) => {
      this.rawMangaJSONSha[manga.manga_site_id] = getSHA(JSON.stringify(manga.json.raw))
    })
    return allManga
  }

  /**
   *
   * @param webContents {Electron.WebContents}
   * @returns {Promise<any>}
   */
  async getMangaInfo (webContents) {
    return webContents.executeJavaScriptInIsolatedWorld(1, [{ code: this.mangaInfoJs }])
  }

  getNetworkWatcherRulesSet () {
    return {
      response: true,
      headers: ['referer'],
      responseHeaders: ['content-type']
    }
  }

  /**
   *
   * @param request {Object}
   */
  parseRequest (request) {
    // console.log('request in ' + this.name, request.url)
  }

  /**
   *
   * @param response {Object}
   */
  parseResponse (response) {
    // console.log('response in ' + this.name, response.url)
    if (response.responseHeaders) {
      if (response.responseHeaders['content-type'] === 'application/json') {
        console.log('json', response.url)
        if (this.regexps.URL.mangaJSON.test(response.url)) {
          this.updateManga(response)
        } else if (this.regexps.URL.chapterJSON.test(response.url)) {
          console.log('chapter json', response.url)
        }
      }
    }
  }

  async updateManga (response) {
    if (this._storage === null) return
    try {
      const newJSONData = JSON.parse(Buffer.from(response.result.body, 'base64').toString())
      if (!newJSONData.status || newJSONData.status.toLowerCase() !== 'ok') return

      const mangaId = parseInt(this.regexps.URL.mangaJSON.exec(response.url)[1])
      if (this.rawMangaJSONSha[mangaId] && getSHA(JSON.stringify(newJSONData)) === this.rawMangaJSONSha[mangaId]) {
        return
      }

      const manga = await this._storage.getManga({
        site_id: this.id,
        manga_site_id: mangaId
      })
      if (manga) {
        const oldRaw = JSON.stringify(manga.json.raw)
        const newRaw = JSON.stringify(newJSONData)

        if (oldRaw !== newRaw) {
          this.rawMangaJSONSha[mangaId] = newJSONData
          manga.json.raw = newJSONData
          await this._storage.updateManga(manga)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }
}

export default MangaDex

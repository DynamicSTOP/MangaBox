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
    this.rawChaptersJSONSha = {}
    this.imagePaths = {}
    this.imageCheckStore = []
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
      this.rawMangaJSONSha[manga.manga_site_id] = getSHA(JSON.stringify(manga.json.raw || null))
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
    if (this._storage === null) return
    if (response.responseHeaders) {
      if (response.responseHeaders['content-type'] === 'application/json') {
        let JSONData
        try {
          JSONData = JSON.parse(Buffer.from(response.result.body, 'base64').toString())
          if (!JSONData.status || JSONData.status.toLowerCase() !== 'ok') return
        } catch (e) {
          console.error(e)
          return
        }
        if (this.regexps.URL.mangaJSON.test(response.url)) {
          this.updateManga(response.url, JSONData)
        } else if (this.regexps.URL.chapterJSON.test(response.url)) {
          this.updateChapter(JSONData)
        }
      }
    }
  }

  async updateManga (url = '', mangaJSON = {}) {
    const mangaId = parseInt(this.regexps.URL.mangaJSON.exec(url)[1])
    if (this.rawMangaJSONSha[mangaId] && getSHA(JSON.stringify(mangaJSON)) === this.rawMangaJSONSha[mangaId]) {
      return
    }

    const manga = await this._storage.getManga({
      site_id: this.id,
      manga_site_id: mangaId
    })
    if (manga) {
      const oldRaw = JSON.stringify(manga.json.raw)
      const newRaw = JSON.stringify(mangaJSON)

      if (oldRaw !== newRaw) {
        this.rawMangaJSONSha[mangaId] = JSON.stringify(mangaJSON)
        manga.json.raw = mangaJSON
        await this._storage.updateManga(manga)
      }
    }
  }

  async updateChapter (chapterJSON = {}) {
    if (typeof this.saveMangaSiteIds[chapterJSON.manga_id] === 'undefined') return
    if (this.rawChaptersJSONSha[chapterJSON.id] && getSHA(JSON.stringify(chapterJSON)) === this.rawChaptersJSONSha[chapterJSON.id]) return
    this.rawChaptersJSONSha[chapterJSON.id] = getSHA(JSON.stringify(chapterJSON))

    const mangaId = this.saveMangaSiteIds[chapterJSON.manga_id]
    let chapter = await this._storage.getChapter({
      manga_id: mangaId,
      manga_site_chapter_id: chapterJSON.id
    })

    if (!chapter) {
      chapter = await this._storage.addChapter({
        manga_id: mangaId,
        manga_site_chapter_id: chapterJSON.id,
        json: chapterJSON
      })
    } else {
      chapter.json = chapterJSON
      await this._storage.updateChapter(chapter)
    }
    const h = chapterJSON.hash ? chapterJSON.hash.slice(0, 4) : ''
    chapterJSON.page_array.map((pageFileName, pageNum) => {
      const fullPath = chapterJSON.server + chapterJSON.hash + '/' + pageFileName
      if (typeof this.imagePaths[fullPath] !== 'undefined') return
      // TODO may be better redirect ? or check file sha1 at least
      const fullPathSV = fullPath.replace('/data/', '/data-saver/')
      this.imagePaths[fullPath] = `${mangaId}/${chapter.manga_site_chapter_id}/${h}_${pageNum + 1}_${pageFileName}`
      this.imagePaths[fullPathSV] = `${mangaId}/${chapter.manga_site_chapter_id}/${h}_${pageNum + 1}_${pageFileName}`
      this.imageCheckStore.push(fullPath)
      this.imageCheckStore.push(fullPathSV)
    })
    await this._moveToStoreImages()
  }

  async _moveToStoreImages () {
    if (this.imageCheckStore.length === 0) return
    const paths = await this._storage.getFromPathsByUrls(this.imageCheckStore)
    if (paths && paths.length) {
      await this._storage.moveCachedFiles(paths.map((p) => {
        return {
          id: p.id,
          pathTo: this.imagePaths[p.url],
          stored: p.stored,
          willBeStored: true
        }
      }))
    }
  }
}

export default MangaDex

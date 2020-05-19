import path from 'path'
import { getFileExtensionFromHeaders } from '../NetworkWatcher'

export const basePath = process.env.NODE_ENV === 'production' ? path.resolve(__dirname) : path.resolve(__dirname, '..', '..')

export class MangaSite {
  constructor () {
    /**
     * unique id
     * @type {number}
     */
    this.id = -1

    /**
     * used in topbar as site name
     * @type {string}
     */
    this.name = 'MangaSite'

    /**
     * used in top bar as regexp to highlight current tab
     * @type {string|RegExp}
     */
    this.pattern = 'example.com'

    /**
     * url to open in siteView
     * @type {string}
     */
    this.indexPage = 'https://example.com'

    /**
     * @type {Storage}
     */
    this._storage = null

    /**
     * @type {string}
     */
    this._url = ''
  }

  /**
   * @param url {string}
   * @returns {boolean}
   */
  isMangaURL (url = this._url) {
    return false
  }

  /**
   *
   * @param storage {Storage}
   */
  setStorage (storage) {
    this._storage = storage
  }

  /**
   * @param url {string}
   * @returns {boolean}
   */
  isMangaChapterURL (url = this._url) {
    return false
  }

  /**
   * if this._lastManga is in storage
   * @returns {Promise<boolean>}
   */
  async isMangaStored () {
    if (this.isMangaURL(this._url) && this._storage && this._lastManga) {
      return !!(await this._storage.getManga({
        manga_site_id: this._lastManga.manga_site_id,
        site_id: this.id
      }))
    }
    return false
  }

  /**
   *
   * @param webContents {Electron.WebContents}
   * @returns {Promise<Object|false>}
   */
  async getMangaInfo (webContents) {
    // false
    // or
    // {
    //   manga_site_id: 123456,
    //   site_id: 1,
    //   title: 'manga title',
    //   url: 'https://example.com/manga/123456',
    //   json: {
    //     image: "url to title image"
    //   }
    // }
    return false
  }

  /**
   * if url belongs to current site
   * @param url {string}
   * @returns {boolean}
   */
  testURL (url) {
    return !!url.match(this.pattern)
  }

  getNetworkWatcherRulesSet () {
    // false
    // or something like this
    // {
    //   request: false,
    //   response: [/\/api\//, /\.json/],
    //   headers: true
    // }
    return false
  }

  /**
   *
   * @param request {Object}
   */
  parseRequest (request = {}) {
    console.log('request in ' + this.name, request)
  }

  /**
   *
   * @param response {Object}
   */
  parseResponse (response = {}) {
    console.log('response in ' + this.name, response)
  }

  /**
   *
   * @param url {string}
   * @param webContents {Electron.WebContents}
   * @returns {Promise<boolean>}
   */
  async updateStatus (url = '', webContents) {
    this._url = url
    if (this.isMangaURL(this._url)) {
      await this.updateLastManga(webContents)
    } else {
      this._lastManga = false
    }
    return false
  }

  /**
   *
   * @param webContents {Electron.WebContents}
   * @returns {Promise<Object|false>}
   */
  async updateLastManga (webContents) {
    try {
      this._lastManga = await this.getMangaInfo(webContents)
    } catch (e) {
      this._lastManga = false
    }
    return this._lastManga
  }

  /**
   *
   * @param manga {Object}
   * @returns {Promise<void>}
   */
  async saveMangaTitleImage (manga = {}) {
    if (manga.json && manga.json.image) {
      const row = await this._storage.getFromPathsByUrl(manga.json.image)
      if (row && row.stored === false) {
        const ext = getFileExtensionFromHeaders(row.info.responseHeaders)
        await this._storage.moveCachedFile(row.id, `${manga.id}${ext}`, true)
      }
    }
  }

  /**
   *
   * @returns {Promise<Object|false>}
   */
  async addManga () {
    if (this._lastManga && this._storage) {
      const manga = await this._storage.addManga(this._lastManga)
      await this.saveMangaTitleImage(manga)
      return manga
    }
    return false
  }
}

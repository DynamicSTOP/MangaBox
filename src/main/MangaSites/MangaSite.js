import path from 'path'

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
  }

  /**
   * @param url
   * @returns {boolean}
   */
  isMangaURL (url) {
    return false
  }

  /**
   * @param url
   * @returns {boolean}
   */
  isMangaChapterURL (url) {
    return false
  }

  /**
   *
   * @param view current _siteView
   * @returns {Promise<Object|false>}
   */
  async getMangaInfo (view) {
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
   * @param url
   * @returns {boolean}
   */
  testURL (url) {
    return url.match(this.pattern)
  }
}

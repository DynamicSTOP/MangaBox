import { ipcMain, globalShortcut, BrowserWindow, BrowserView, screen, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { networkWatcher, getFileExtensionFromHeaders } from './NetworkWatcher'

const basePath = process.env.NODE_ENV === 'production' ? path.resolve(__dirname) : path.resolve(__dirname, '..')

class MainWindow {
  constructor () {
    this._window = null
    this._debug = process.env.NODE_ENV === 'development'
    this._siteView = null
    this._storage = null
    this._savedTraffic = 0
    this._currentSite = null
    this._lastManga = null
    this.__savedTrafficTimeout = null

    networkWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))

    this.config = {
      // TODO refactor sites to separate classes with some interface
      sites: [{
        text: 'Google',
        url: 'https://www.google.com'
      }, {
        siteId: 0,
        text: 'MangaDex',
        url: 'https://mangadex.org',
        type: 'manga',
        mangaRegexp: /https:\/\/mangadex\.org\/title\/(\d+)/,
        chapterRegexp: /https:\/\/mangadex\.org\/chapter\/(\d+)/,
        mangaJSON: /https:\/\/mangadex\.org\/api\/?id=(\d+)&type=manga/,
        chapterJSON: /https:\/\/mangadex\.org\/api\/?id=(\d+)&server=[\w\d%\-.]*&type=chapter/,
        mangaInfoJs: fs.readFileSync(path.resolve(basePath, 'scripts', 'md_mangaInfo.js'), 'utf8')
      }]
    }
  }

  _resetParams () {
    this._window = null
    this._siteView = null
    this._currentSite = null
    this._lastManga = null
  }

  attachHandlers () {
    this.attachHotkeys()
    this.attachMessenger()
  }

  create () {
    if (this._window !== null) {
      this._window.focus()
      return
    }
    this.openMainWindow()
  }

  openMainWindow () {
    const ses = session.fromPartition('persist:MainWindow')
    const { width, height } = screen.getPrimaryDisplay().workArea

    this._window = new BrowserWindow({
      width,
      height,
      webPreferences: {
        preload: path.resolve(basePath, 'preload', 'preload.js'),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses
      },
      titleBarStyle: 'hidden',
      title: 'MangaBox',
      icon: path.resolve(basePath, 'images', 'ext_icon_inactive.png'),
      frame: false
    })

    this._window.removeMenu()

    const winURL = this._debug
      ? 'http://localhost:9080'
      : `file://${__dirname}/index.html`

    this._window.loadURL(winURL)
    this._window.maximize()
    this._window.on('closed', this._resetParams.bind(this))
  }

  attachHotkeys () {
    globalShortcut.register('CommandOrControl+Shift+F12', () => {
      if (this._siteView !== null) {
        this._siteView.webContents.openDevTools()
      }
      if (this._window !== null && this._window.webContents) {
        this._window.webContents.openDevTools()
      }
    })
    globalShortcut.register('CommandOrControl+Shift+K', () => {
      // TODO ask for destroy, then kill
      if (this._siteView !== null) {
        this._window.removeBrowserView(this._siteView)
        this._siteView.destroy()
        this._siteView = null
        this.sendToRenderer('SITE_NAVIGATED', null)
      }
    })
  }

  attachMessenger () {
    ipcMain.removeAllListeners('async-renderer-message')

    ipcMain.on('async-renderer-message', (event, message) => {
      try {
        const json = JSON.parse(message)
        const { data, type } = json
        this.parseMessageFromRenderer(type, data)
      } catch (e) {
        console.error(e)
      }
    })
  }

  parseMessageFromRenderer (type, data) {
    switch (type) {
      case 'APP_LOADED':
        this.sendToRenderer('APP_CONFIG', this.config)
        break
      case 'SITE_NAVIGATE':
        this.siteNavigate(data)
        break
      case 'MANGA_ADD':
        this.addManga()
        break
      default:
        if (this._debug) {
          console.log('message from renderer', type, data)
        }
        this.sendToRenderer('unhandled', {
          data,
          type
        })
        break
    }
  }

  sendToRenderer (type, data) {
    if (this._window) {
      this._window.send('async-main-message', JSON.stringify({
        sender: 'main',
        type,
        data
      }))
    }
  }

  setStorage (storage) {
    this._storage = storage
    networkWatcher.setStorage(storage)
  }

  siteNavigate (url) {
    if (this._siteView === null) {
      this.createSiteView()
    }
    this._siteView.webContents.once('dom-ready', () => {
      this.sendToRenderer('SITE_NAVIGATED', url)
      if (this._savedTraffic > 0) {
        this.updateSavedSize(0)
      }
    })
    this._siteView.webContents.loadURL(url)
  }

  createSiteView () {
    if (this._siteView !== null) return
    if (this._window === null) return
    const ses = session.fromPartition('persist:site')
    const size = this._window.getContentSize()

    this._siteView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses,
        webviewTag: false
      }
    })
    networkWatcher.attach(this._siteView)
    this._window.addBrowserView(this._siteView)
    this._siteView.setBounds({
      x: 0,
      y: 20,
      width: size[0],
      height: size[1] - 20
    })

    this._siteView.setAutoResize({
      width: true,
      height: true
    })

    this._siteView.webContents.on('dom-ready', async () => {
      if (this._siteView) {
        const url = this._siteView.webContents.getURL()
        this._currentSite = this.config.sites.find((site) => url.indexOf(site.url) !== -1)
        const isManga = this.isMangaUrl(url)
        let isMangaStored = false
        if (isManga) {
          await this.setLastManga()
          isMangaStored = !!(await this._storage.getManga({
            manga_site_id: this._lastManga.manga_site_id,
            site_id: this._lastManga.site_id
          }))
        }
        this.sendToRenderer('URL_CURRENT', url)
        this.sendToRenderer('CONTROLS_UPDATE', {
          isManga,
          isMangaStored,
          isChapter: this.isChapterUrl(url)
        })
      }
    })
  }

  async setLastManga () {
    if (this._siteView && this._currentSite) {
      try {
        this._lastManga = await this._siteView.webContents.executeJavaScriptInIsolatedWorld(1, [{ code: this._currentSite.mangaInfoJs }])
      } catch (e) {
        console.error(e)
      }
    }
  }

  async saveMangaImage (manga = {}) {
    if (manga.json && manga.json.image) {
      const row = await this._storage.getFromPathsByUrl(manga.json.image)
      if (row && row.stored === false) {
        const ext = getFileExtensionFromHeaders(row.info.responseHeaders)
        await this._storage.moveCachedFile(row.path, `manga${path.sep}${manga.id}${ext}`)
      }
    }
  }

  async addManga () {
    if (this._siteView) {
      const url = this._siteView.webContents.getURL()
      if (this.isMangaUrl(url) && this._lastManga) {
        const manga = await this._storage.addManga(this._lastManga)
        await this.saveMangaImage(manga)
        this.sendToRenderer('MANGA_ADDED', manga)
      }
    }
  }

  isMangaUrl (url) {
    return !!this._currentSite && this._currentSite.type === 'manga' && this._currentSite.mangaRegexp.test(url)
  }

  isChapterUrl (url) {
    return this.config.sites.some((site) => site.type === 'manga' && site.mangaRegexp.test(url))
  }

  updateSavedSize (size) {
    this._savedTraffic += size
    // should prevent 500 messages regarding saved traffic. not that important anyway
    if (this._savedTrafficTimeout) {
      clearTimeout(this._savedTrafficTimeout)
    }
    this._savedTrafficTimeout = setTimeout(() => {
      this.sendToRenderer('INFO_UPDATE', { savedTraffic: this._savedTraffic })
      this._savedTrafficTimeout = null
    }, 200)
  }
}

export default MainWindow

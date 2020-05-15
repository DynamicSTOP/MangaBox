import { ipcMain, globalShortcut, BrowserWindow, BrowserView, screen, session } from 'electron'
import path from 'path'
import networkWatcher from './NetworkWatcher'

const basePath = process.env.NODE_ENV === 'production' ? path.resolve(__dirname) : path.resolve(__dirname, '..')

class MainWindow {
  constructor () {
    this._window = null
    this._debug = process.env.NODE_ENV === 'development'
    this._siteView = null
    this._storage = null
    this._savedTraffic = 0

    networkWatcher.on('Request', (data) => this.sendToMainView('Request', data))
    networkWatcher.on('Response', (data) => this.sendToMainView('Response', data))

    networkWatcher.on('Request', (data) => console.log('Request', data.url))
    networkWatcher.on('Response', (data) => console.log('Response', data.url))

    networkWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))

    this.config = {
      sites: [{
        text: 'Google',
        url: 'https://www.google.com'
      }, {
        text: 'MangaDex',
        url: 'https://mangadex.org',
        type: 'manga',
        mangaRegexp: /https:\/\/mangadex\.org\/title\/(\d+)/,
        chapterRegexp: /https:\/\/mangadex\.org\/chapter\/(\d+)/
      }]
    }
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

    this._window.on('closed', () => {
      this._window = null
      this._siteView = null
    })
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

  sendToMainView (type, data) {
    if (this._siteView) {
      this._siteView.webContents.send('async-main-message', {
        sender: 'main',
        type,
        data
      })
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
    this._siteView.webContents.once('dom-ready', () => this.sendToRenderer('SITE_NAVIGATED', url))
    this._siteView.webContents.loadURL(url)
  }

  createSiteView () {
    if (this._siteView !== null) return
    if (this._window === null) return
    const ses = session.fromPartition('persist:site')
    const size = this._window.getContentSize()

    this._siteView = new BrowserView({
      webPreferences: {
        // preload: path.resolve(preloadPath, 'preload_game.js'),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses,
        webviewTag: false
      }
    })
    networkWatcher.attach(this._siteView)
    // networkWatcher.loadSettingsFromPlugin(this._currentPlugin)
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

    this._siteView.webContents.on('dom-ready', () => {
      if (this._siteView) {
        const url = this._siteView.webContents.getURL()
        this.sendToRenderer('URL_CURRENT', url)
        this.sendToRenderer('CONTROLS_UPDATE', {
          isManga: this.isMangaUrl(url),
          isChapter: this.isChapterUrl(url)
        })
      }
    })
  }

  addManga () {
    if (this._siteView) {
      const url = this._siteView.webContents.getURL()
      if (this.isMangaUrl(url)) {
        console.log('adding', url)
      }
    }
  }

  isMangaUrl (url) {
    return this.config.sites.some((site) => site.type === 'manga' && site.mangaRegexp.test(url))
  }

  isChapterUrl (url) {
    return this.config.sites.some((site) => site.type === 'manga' && site.mangaRegexp.test(url))
  }

  updateSavedSize (size) {
    this._savedTraffic += size
    this.sendToRenderer('INFO_UPDATE', { savedTraffic: this._savedTraffic })
  }
}

export default MainWindow

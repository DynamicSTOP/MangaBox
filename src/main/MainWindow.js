import { ipcMain, globalShortcut, BrowserWindow, BrowserView, screen, session } from 'electron'
import path from 'path'
import { networkWatcher } from './NetworkWatcher'
import Google from './MangaSites/Google'
import MangaDex from './MangaSites/MangaDex'

const enabledSites = [Google, MangaDex]

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
    this.sites = []

    networkWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))
    this.addSites()
  }

  _resetParams () {
    this._window = null
    this._siteView = null
    this._currentSite = null
    this._lastManga = null
  }

  addSites () {
    this.sites = enabledSites.map((SiteConstructor) => new SiteConstructor(this._storage))
    this.sites.map((site) => {
      const rules = site.getNetworkWatcherRulesSet()
      if (!rules) return
      rules.marker = site.id
      networkWatcher.addWatcherRules(rules)
    })
    networkWatcher.on('Request', (request) => {
      this.sites.map((site) => {
        if (site.id === request.marker) {
          site.parseRequest(request)
        }
      })
    })
    networkWatcher.on('Response', (response) => {
      this.sites.map((site) => {
        if (site.id === response.marker) {
          site.parseResponse(response)
        }
      })
    })
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

    ipcMain.on('async-renderer-message', async (event, message) => {
      try {
        const json = JSON.parse(message)
        const { data, type } = json
        await this.parseMessageFromRenderer(type, data)
      } catch (e) {
        console.error(e)
      }
    })
  }

  async parseMessageFromRenderer (type, data) {
    switch (type) {
      case 'APP_LOADED':
        this.sendToRenderer('APP_CONFIG', {
          sites: this.sites.map((s, i) => {
            return {
              index: i,
              text: s.name,
              pattern: s.pattern
            }
          })
        })
        break
      case 'SITE_NAVIGATE':
        this.siteNavigate(data)
        break
      case 'MANGA_ADD':
        if (this._currentSite) {
          const manga = await this._currentSite.addManga()
          this.sendToRenderer('MANGA_ADDED', manga)
        }
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
    this.sites.map((site) => site.setStorage(storage))
    networkWatcher.setStorage(storage)
  }

  siteNavigate (index) {
    if (index >= this.sites.length) return
    if (this._siteView === null) {
      this.createSiteView()
    }
    this._siteView.webContents.once('dom-ready', () => {
      this.sendToRenderer('SITE_NAVIGATED', this.sites[index].indexPage)
      if (this._savedTraffic > 0) {
        this.updateSavedSize(0)
      }
    })
    this._siteView.webContents.loadURL(this.sites[index].indexPage)
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
        this.sendToRenderer('URL_CURRENT', url)

        this._currentSite = this.sites.find((site) => site.testURL(url))
        if (this._currentSite) {
          await this._currentSite.updateStatus(url, this._siteView)

          this.sendToRenderer('CONTROLS_UPDATE', {
            isManga: this._currentSite.isMangaURL(),
            isMangaStored: await this._currentSite.isMangaStored(),
            isChapter: this._currentSite.isMangaChapterURL()
          })
        } else {
          this.sendToRenderer('CONTROLS_UPDATE', {
            isManga: false,
            isMangaStored: false,
            isChapter: false
          })
        }
      }
    })
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

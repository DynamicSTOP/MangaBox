import { ipcMain, globalShortcut, BrowserWindow, BrowserView, screen, session, Tray, Menu } from 'electron'
import path from 'path'
import { NetworkWatcher } from './NetworkWatcher'
import Google from './MangaSites/Google'
import MangaDex from './MangaSites/MangaDex'
import storage from './Storage'

const enabledSites = [Google, MangaDex]
const basePath = process.env.NODE_ENV === 'production' ? path.resolve(__dirname) : path.resolve(__dirname, '..')
const mainNetworkWatcher = new NetworkWatcher()

class App {
  constructor () {
    this._window = null
    this._debug = process.env.NODE_ENV === 'development'
    this._siteView = null
    /**
     *
     * @type {Storage|null}
     * @private
     */
    this._storage = null
    this._savedTraffic = 0
    this._currentSite = null
    this._lastManga = null
    this.__savedTrafficTimeout = null
    /**
     *
     * @type {null|Electron.Tray}
     * @private
     */
    this._tray = null
    this.sites = []

    mainNetworkWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))
    this.addSites()
  }

  addTrayIcon () {
    this._tray = new Tray(path.resolve(basePath, 'images', 'ext_icon_inactive.png'))
    const contextMenu = Menu.buildFromTemplate([
      {
        id: 2,
        label: 'Force check'
      },
      { type: 'separator' },
      {
        id: 4,
        label: 'Open app',
        click: () => this.show()
      },
      {
        id: 5,
        label: 'Exit',
        role: 'quit'
      }
    ])
    this._tray.setToolTip('MangaBox')
    this._tray.setContextMenu(contextMenu)
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
      mainNetworkWatcher.addWatcherRules(rules)
    })
    mainNetworkWatcher.on('Request', (request) => {
      this.sites.map((site) => {
        if (site.id === request.marker) {
          site.parseRequest(request)
        }
      })
    })
    mainNetworkWatcher.on('Response', (response) => {
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

  show () {
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

    this._window.on('closed', this._resetParams.bind(this))
    this._window.maximize()
    this._window.loadURL(winURL)
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

  /**
   *
   * @param type {string}
   * @param data {Object|undefined}
   * @returns {Promise<void>}
   */
  async parseMessageFromRenderer (type = '', data) {
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

  /**
   *
   * @param type {string}
   * @param data {Object|undefined}
   */
  sendToRenderer (type, data) {
    if (this._window) {
      this._window.send('async-main-message', JSON.stringify({
        sender: 'main',
        type,
        data
      }))
    }
  }

  async initStorage () {
    this._storage = storage
    await this._storage.init()
    this.sites.map((site) => site.setStorage(storage))
    mainNetworkWatcher.setStorage(storage)
  }

  /**
   *
   * @param index {number}
   */
  siteNavigate (index = 0) {
    if (index >= this.sites.length) return
    if (this._siteView === null) {
      this.createSiteView()
    }
    this._siteView.webContents.once('dom-ready', () => {
      this.sendToRenderer('SITE_NAVIGATED', this.sites[index].indexPage)
      if (this._savedTraffic > 0) {
        this.updateSavedSize()
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
    mainNetworkWatcher.attach(this._siteView.webContents)
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
          await this._currentSite.updateStatus(url, this._siteView.webContents)

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

  /**
   *
   * @param size {number}
   */
  updateSavedSize (size = 0) {
    this._savedTraffic += size
    // should prevent 500 messages regarding saved traffic. not that important anyway
    if (this._savedTrafficTimeout) {
      clearTimeout(this._savedTrafficTimeout)
    }
    this._savedTrafficTimeout = setTimeout(() => {
      this.sendToRenderer('INFO_UPDATE', { savedTraffic: this._savedTraffic })
      this._savedTrafficTimeout = null
    }, 300)
  }

  async startChecks () {
    const interval = 30 * 60 * 1000
    const intl = new Intl.DateTimeFormat('en', {
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const check = async () => {
      await this.checkNewChapters()
      const ts = new Date(new Date().getTime() + interval)
      console.log(ts.toString())
      this._tray.setToolTip(`MangaBox - next check at ${intl.format(ts)}`)
    }

    await check()
    setInterval(check, interval)
  }

  /**
   *
   * @param force will ignore time margin
   * @returns {Promise<boolean>}
   */
  async checkNewChapters (force = false) {
    if (this._checkingChapters) return
    const allManga = await this._storage.getAllManga()
    if (!allManga || allManga.length === 0) return
    this._checkingChapters = true
    const timeout = 5 * 1000
    const minTimeMargin = Math.floor(2.8 * 60 * 60 * 1000)
    const currentTime = new Date().getTime()

    const ses = session.fromPartition('persist:site')
    const hiddenWindow = new BrowserWindow({
      width: 400,
      height: 400,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses,
        webviewTag: false
      }
    })

    if (this._storage) {
      const tempWatcher = new NetworkWatcher()
      tempWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))
      tempWatcher.setStorage(this._storage)
      tempWatcher.attach(hiddenWindow.webContents)
    }

    for (let i = 0; i < allManga.length; i++) {
      const manga = allManga[i]
      this._tray.setToolTip(`MangaBox\nChecking ${i + 1}/${allManga.length}\n${manga.title}`)
      if (!force && currentTime - manga.last_check < minTimeMargin) continue
      const site = this.sites.find((site) => site.id === manga.site_id)
      if (!site) continue
      await hiddenWindow.loadURL(manga.url)
      const info = await site.getMangaInfo(hiddenWindow.webContents)
      const newImage = info.json.image
      info.id = manga.id
      if (newImage) {
        const imageChanged = newImage !== manga.json.image
        const shouldMove = imageChanged || await this._storage.isPathExistsAndNotStored(newImage)
        if (shouldMove) {
          await site.saveMangaTitleImage(info)
        }
      }
      Object.assign(info.json, manga.json, { image: newImage || manga.json.image })
      await this._storage.updateManga(info)
      // TODO new chapters notifications
      await (new Promise((resolve) => setTimeout(resolve, timeout)))
    }
    this._checkingChapters = false
    return true
  }
}

export default App

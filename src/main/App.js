import {
  ipcMain,
  globalShortcut,
  BrowserWindow,
  BrowserView,
  screen,
  session,
  Tray,
  Menu,
  MenuItem,
  dialog,
  Notification,
  shell,
  clipboard,
  app
} from 'electron'
import path from 'path'
import fs from 'fs'
import { getFileExtensionFromHeaders, NetworkWatcher } from './NetworkWatcher'
import Google from './MangaSites/Google'
import MangaDex from './MangaSites/MangaDex'
import storage from './Storage'
import { deepObjectMerge } from './global'

const enabledSites = [Google, MangaDex]

class App {
  constructor (pathsConfig = {}) {
    this._pathsConfig = pathsConfig
    this.mainNetworkWatcher = new NetworkWatcher(pathsConfig)
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
    this._savedTrafficTimeout = null
    /**
     *
     * @type {null|Electron.Tray}
     * @private
     */
    this._tray = null
    this.sites = []

    /**
     * for tray icon
     * @type {boolean}
     */
    this.hasNewChapters = false

    this.mainNetworkWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))
    this.addSites()
  }

  addTrayIcon () {
    this._tray = new Tray(path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive.png'))
    const contextMenu = Menu.buildFromTemplate([
      {
        id: 2,
        label: 'Force check',
        click: () => {
          this.checkNewChapters(true)
        }
      },
      {
        id: 3,
        label: 'Drop jsons',
        click: () => this._storage.invalidateJsons()
      },
      { type: 'separator' },
      {
        id: 5,
        label: 'Open app',
        click: () => this.show()
      },
      {
        id: 6,
        label: 'Exit',
        click: () => this.exit()
      }
    ])
    this._tray.on('double-click', () => this.show())
    this._tray.setToolTip('MangaBox')
    this._tray.setContextMenu(contextMenu)
  }

  async onClose () {
    this._window = null
    this._siteView = null
    this._currentSite = null
    await Promise.all(this.sites.map((s) => s.shutDown()))
  }

  addSites () {
    this.sites = enabledSites.map((SiteConstructor) => new SiteConstructor(this._storage))
    this.sites.map((site) => {
      const rules = site.getNetworkWatcherRulesSet()
      if (!rules) return
      rules.marker = site.id
      this.mainNetworkWatcher.addWatcherRules(rules)
    })
    this.mainNetworkWatcher.on('Request', (request) => {
      this.sites.map((site) => {
        if (site.id === request.marker) {
          site.parseRequest(request)
        }
      })
    })
    this.mainNetworkWatcher.on('Response', (response) => {
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
    if (this._tray) {
      this._tray.setImage(path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive.png'))
      this.hasNewChapters = false
    }
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
        preload: path.resolve(this._pathsConfig.preloadAbs, 'preload.js'),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses
      },
      titleBarStyle: 'hidden',
      title: 'MangaBox',
      icon: path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive.png'),
      frame: false
    })

    this._window.removeMenu()

    const winURL = this._debug
      ? 'http://localhost:9080'
      : `file://${__dirname}/index.html`

    this._window.on('closed', this.onClose.bind(this))
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
    globalShortcut.register('CommandOrControl+Shift+K', this.closeSiteView.bind(this))
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

    ipcMain.on('async-site-message', async (event, message) => {
      try {
        const json = JSON.parse(message)
        const { data, type } = json
        await this.parseMessageFromSite(type, data)
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
        await this.sendAppInitialConfig()
        break
      case 'SITE_NAVIGATE':
        this.siteNavigate(data)
        break
      case 'SITE_CLOSE':
        this.closeSiteView()
        break
      case 'MANGA_ADD':
        if (this._currentSite) {
          const manga = await this._currentSite.addManga()
          this.sendToRenderer('MANGA_ADDED', manga)
        }
        break
      case 'MANGA_OPEN':
        if (data.id) {
          const manga = await this._storage.getManga(data)
          this.openSiteView()
          await this._siteView.webContents.loadURL(manga.url)
        }
        break
      case 'MANGA_SET_VIEWED':
        if (data.id) {
          const manga = await this._storage.getManga(data)
          if (!manga) break
          manga.json.newChapters = []
          await this._storage.updateManga(manga)
          this.sendToRenderer('MANGA_UPDATED', manga)
        }
        break
      case 'MANGA_TOGGLE_SAVE':
        if (data.id) {
          const manga = await this._storage.getManga({ id: data.id })
          if (!manga || manga.save === data.save) break
          manga.save = data.save
          await this._storage.updateManga(manga)
          this.sendToRenderer('MANGA_UPDATED', manga)
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

  async parseMessageFromSite (type = '', data) {
    switch (type) {
      case 'CONTEXT_MENU':
        this.showContextMenu(data)
        break
      default:
        if (this._debug) {
          console.log('message from site', type, data)
        }
        this.sendToRenderer('unhandled', {
          data,
          type
        })
        break
    }
  }

  showContextMenu (data) {
    let contextMenu
    if (data.tag === 'a') {
      contextMenu = Menu.buildFromTemplate([
        {
          id: 2,
          label: 'Copy link',
          click: () => {
            clipboard.writeText(data.href)
          }
        },
        {
          id: 3,
          label: 'Open in browser',
          click: () => {
            shell.openExternal(data.href)
          }
        }
      ])
    } else if (data.tag === 'img') {
      contextMenu = Menu.buildFromTemplate([
        {
          id: 2,
          label: 'Copy image into buffer',
          click: async () => {
            const row = await this._storage.getFromPathsByUrl(data.src)
            if (!row) return
            let from
            if (row.stored) {
              from = path.resolve(this._pathsConfig.mangaDirAbs, row.path)
            } else {
              from = path.resolve(this._pathsConfig.cacheDirAbs, row.path)
            }
            clipboard.writeImage(from)
          }
        },
        {
          id: 3,
          label: 'Save image',
          click: async () => {
            let name = data.src.split('/').filter(p => p.length !== 0).pop().replace(/\?.*$/g, '')
            if (name === '') {
              name = new Date().getTime().toString()
            }
            const row = await this._storage.getFromPathsByUrl(data.src)
            if (!row) return
            const ext = getFileExtensionFromHeaders(row.info.responseHeaders)
            if (!name.match(new RegExp(`${ext}$`, 'g'))) {
              name += ext
            }
            let from
            if (row.stored) {
              from = path.resolve(this._pathsConfig.mangaDirAbs, row.path)
            } else {
              from = path.resolve(this._pathsConfig.cacheDirAbs, row.path)
            }
            const to = dialog.showSaveDialogSync(this._window, { defaultPath: name })
            if (to) {
              fs.copyFileSync(from, to)
            }
          }
        },
        {
          id: 4,
          label: 'Open in browser',
          click: () => {
            shell.openExternal(data.src)
          }
        }
      ])
    } else {
      contextMenu = Menu.buildFromTemplate([
        {
          id: 2,
          label: 'Copy current url',
          click: () => {
            clipboard.writeText(data.url)
          }
        }
      ])
    }
    contextMenu.append(new MenuItem({
      id: 98,
      type: 'separator'
    }))
    contextMenu.append(new MenuItem({
      id: 99,
      label: 'Inspect',
      click: () => {
        this._siteView.webContents.inspectElement(data.x, data.y)
      }
    }))
    contextMenu.popup()
  }

  async getLocalImagePath (url = '') {
    const row = await this._storage.getFromPathsByUrl(url)
    if (row) {
      if (process.env.NODE_ENV === 'production') {
        if (row.stored) {
          return 'file://' + path.resolve(this._pathsConfig.mangaDirAbs, row.path)
        } else {
          return 'file://' + path.resolve(this._pathsConfig.cacheDirAbs, row.path)
        }
      } else {
        if (row.stored) {
          return '/loadLocal/' + Buffer.from(path.resolve(this._pathsConfig.mangaDirAbs, row.path)).toString('base64')
        } else {
          return '/loadLocal/' + Buffer.from(path.resolve(this._pathsConfig.cacheDirAbs, row.path)).toString('base64')
        }
      }
    }
    return null
  }

  async sendAppInitialConfig () {
    // get manga info and update paths to local
    const allManga = await this._storage.getAllManga()
    await Promise.all(allManga.map(async (manga, index) => {
      if (manga.json.image) {
        allManga[index].json.image = await this.getLocalImagePath(manga.json.image)
      } else {
        allManga[index].json.image = null
      }
    }))

    const sites = this.sites.map((s, i) => {
      return {
        index: i,
        text: s.name,
        pattern: s.pattern
      }
    })

    this.sendToRenderer('INFO_UPDATE', { savedTraffic: this._savedTraffic })
    this.sendToRenderer('APP_CONFIG',
      {
        allManga,
        sites
      })
    if (this._siteView) {
      this.sendToRenderer('SITE_NAVIGATED', this._siteView.webContents.getURL())
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
    await this._storage.init(this._pathsConfig)
    this._savedTraffic = (await this._storage.getFromVault('_savedTraffic') || 0)
    this.sites.map(async (site) => await site.setStorage(storage))
    this.mainNetworkWatcher.setStorage(storage)
  }

  async exit () {
    await this._storage.updateVault('_savedTraffic', this._savedTraffic)
    await Promise.all(this.sites.map((s) => s.shutDown()))
    app.quit()
  }

  /**
   *
   * @param index {number}
   */
  siteNavigate (index = 0) {
    if (index >= this.sites.length) return
    this.openSiteView()
    this._siteView.webContents.loadURL(this.sites[index].indexPage)
  }

  openSiteView () {
    if (this._siteView === null) {
      this.createSiteView()
    }
    this._siteView.webContents.once('dom-ready', () => {
      this.sendToRenderer('SITE_NAVIGATED', this._siteView.webContents.getURL())
      if (this._savedTraffic > 0) {
        this.updateSavedSize()
      }
    })
  }

  closeSiteView () {
    if (this._siteView !== null) {
      this._window.removeBrowserView(this._siteView)
      this._siteView.destroy()
      this._siteView = null
      this.sendToRenderer('SITE_NAVIGATED', null)
    }
  }

  createSiteView () {
    if (this._siteView !== null) return
    if (this._window === null) return
    const ses = session.fromPartition('persist:site')
    const size = this._window.getContentSize()

    this._siteView = new BrowserView({
      webPreferences: {
        preload: path.resolve(this._pathsConfig.preloadAbs, 'preload_site.js'),
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        enableRemoteModule: true,
        session: ses,
        webviewTag: false
      }
    })
    this.mainNetworkWatcher.attach(this._siteView.webContents)
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
      const tempWatcher = new NetworkWatcher(this._pathsConfig)
      tempWatcher.on('loadedFromCache', this.updateSavedSize.bind(this))
      tempWatcher.setStorage(this._storage)
      tempWatcher.attach(hiddenWindow.webContents)
    }
    this._tray.setImage(path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_processing.png'))
    for (let i = 0; i < allManga.length; i++) {
      const manga = allManga[i]
      this._tray.setToolTip(`MangaBox\nChecking ${i + 1}/${allManga.length}\n${manga.title}`)
      if (!force && (currentTime - manga.last_check < minTimeMargin)) continue
      const site = this.sites.find((site) => site.id === manga.site_id)
      if (!site) continue
      await hiddenWindow.loadURL(manga.url)
      let newChapters = manga.json.newChapters || []
      const info = await site.getMangaInfo(hiddenWindow.webContents)
      // update json.image
      const newImage = info.json.image
      info.id = manga.id
      if (newImage) {
        const imageChanged = newImage !== manga.json.image
        const shouldMove = imageChanged || await this._storage.isPathExistsAndNotStored(newImage)
        if (shouldMove) {
          await site.saveMangaTitleImage(info)
        }
      }

      // update json.newChapters
      // TODO remake into something more nice with multiple lang support, though would need to change db schema
      const alertChapters = []
      if (info.last_ru && manga.last_ru !== info.last_ru && newChapters.indexOf('ru') === -1) {
        alertChapters.push('ru')
      }
      if (info.last_en && manga.last_en !== info.last_en && newChapters.indexOf('en') === -1) {
        alertChapters.push('en')
      }
      if (info.last && manga.last !== info.last && newChapters.indexOf('last') === -1) {
        alertChapters.push('last')
      }
      newChapters = newChapters.concat(alertChapters)
      if (alertChapters.length) {
        this.hasNewChapters = true
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: `New Chapters ${newChapters.join(' ')}!`,
            body: `${info.title} has new chapter${newChapters.length > 1 ? 's' : ''}!`,
            icon: path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive.png')
          })
          notification.once('click', (event) => {
            console.log(info.url)
            this.show()
          })
          notification.show()
        }
      }

      deepObjectMerge(manga, info, {
        json: {
          image: newImage || manga.json.image,
          newChapters
        }
      })
      await this._storage.updateManga(manga)
      manga.json.image = await this.getLocalImagePath(manga.json.image)
      this.sendToRenderer('MANGA_UPDATED', manga)
      await (new Promise((resolve) => setTimeout(resolve, timeout)))
    }
    if (this.hasNewChapters) {
      this._tray.setImage(path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive_2.png'))
    } else {
      this._tray.setImage(path.resolve(this._pathsConfig.imagesAbs, 'ext_icon_inactive.png'))
    }

    this._checkingChapters = false
    return true
  }
}

export default App

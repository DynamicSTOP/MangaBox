// Modules to control application life and create native browser window
import App from './App'
import { app, BrowserWindow, Tray, Menu } from 'electron'
import path from 'path'

const basePath = process.env.NODE_ENV === 'production' ? path.resolve(__dirname) : path.resolve(__dirname, '..')
const myApp = new App()
let tray = null

app.allowRendererProcessReuse = true

app.on('ready', async () => {
  await myApp.initStorage()
  tray = new Tray(path.resolve(basePath, 'images', 'ext_icon_inactive.png'))
  const contextMenu = Menu.buildFromTemplate([
    {
      id: 2,
      label: 'Force check'
    },
    { type: 'separator' },
    {
      id: 4,
      label: 'Open app',
      click: () => myApp.show()
    },
    {
      id: 5,
      label: 'Exit',
      role: 'quit'
    }
  ])
  tray.setToolTip('This is my application.')
  tray.setContextMenu(contextMenu)
  myApp.show()
  myApp.attachHandlers()
  // myApp.checkNewChapters()
})

app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  // if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) myApp.show()
})

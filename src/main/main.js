// Modules to control application life and create native browser window
import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import App from './App'

const notProd = process.env.NODE_ENV !== 'production'
const applicationPaths = {
  cacheDirName: 'cache',
  mangaDirName: 'manga',
  basePath: notProd ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname)
}

applicationPaths.cacheDirAbs = path.resolve(applicationPaths.basePath, applicationPaths.cacheDirName)
applicationPaths.mangaDirAbs = path.resolve(applicationPaths.basePath, applicationPaths.mangaDirName)
applicationPaths.storageAbs = path.resolve(applicationPaths.basePath, 'storage.sqlite')
if (notProd) {
  applicationPaths.preloadAbs = path.resolve(applicationPaths.basePath, 'src', 'preload')
  applicationPaths.imagesAbs = path.resolve(applicationPaths.basePath, 'src', 'images')
} else {
  applicationPaths.preloadAbs = path.resolve(applicationPaths.basePath, 'preload')
  applicationPaths.imagesAbs = path.resolve(applicationPaths.basePath, 'images')
}

if (fs.existsSync(path.resolve(applicationPaths.basePath, 'config.json'))) {
  try {
    const savedPaths = JSON.parse(fs.readFileSync(path.resolve(applicationPaths.basePath, 'config.json'), 'utf8'))
    Object.assign(applicationPaths, savedPaths)
  } catch (e) {
    console.error(e)
  }
}
// fs.writeFileSync(path.resolve(applicationPaths.basePath, 'config.json'), JSON.stringify(applicationPaths, false, ' '), 'utf8')

if (!fs.existsSync(applicationPaths.cacheDirAbs)) {
  fs.mkdirSync(applicationPaths.cacheDirAbs)
  if (notProd) {
    fs.writeFileSync(path.resolve(applicationPaths.cacheDirAbs, '.gitignore'), '*', 'utf8')
  }
}
if (!fs.existsSync(applicationPaths.mangaDirAbs)) {
  fs.mkdirSync(applicationPaths.mangaDirAbs)
  if (notProd) {
    fs.writeFileSync(path.resolve(applicationPaths.mangaDirAbs, '.gitignore'), '*.*', 'utf8')
  }
}

const myApp = new App(applicationPaths)

app.allowRendererProcessReuse = true
app.setAppUserModelId(process.execPath)

const noShow = process.argv.some(arg => arg === '--noshow')
app.on('ready', async () => {
  await myApp.initStorage()
  myApp.addTrayIcon()
  if (!noShow) {
    myApp.show()
  }
  myApp.attachHandlers()
  myApp.startChecks()
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

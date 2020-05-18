// Modules to control application life and create native browser window
import App from './App'
import { app, BrowserWindow } from 'electron'

const myApp = new App()

app.allowRendererProcessReuse = true
app.setAppUserModelId(process.execPath)

app.on('ready', async () => {
  await myApp.initStorage()
  myApp.addTrayIcon()
  myApp.show()
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

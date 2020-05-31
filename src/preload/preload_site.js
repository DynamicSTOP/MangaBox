(function () {
  const { ipcRenderer } = require('electron')

  let lastTarget = null

  window.addEventListener('contextmenu', (e) => {
    lastTarget = e.target
    ipcRenderer.send('async-site-message', JSON.stringify({
      sender: 'site',
      type: 'CONTEXT_MENU',
      data: {
        tag: e.target.tagName.toLocaleLowerCase()
      }
    }))
  }, false)
})()

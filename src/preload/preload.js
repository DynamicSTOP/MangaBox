(function () {
  console.log('Preload loaded')
  const { ipcRenderer } = require('electron')

  ipcRenderer.on('async-main-message', (event, message) => {
    window.postMessage(message, '*')
  })

  function receiveMessageForMain (event) {
    if (event.data) {
      try {
        const data = JSON.parse(event.data)
        if (data.sender === 'renderer') {
          ipcRenderer.send('async-renderer-message', event.data)
        }
      } catch (e) {
      }
    }
  }

  window.addEventListener('message', receiveMessageForMain, false)
})()

(function () {
  const { ipcRenderer } = require('electron')

  let lastTarget = null

  window.addEventListener('contextmenu', (e) => {
    lastTarget = e.target
    const data = {
      tag: e.target.tagName.toLocaleLowerCase(),
      x: e.clientX,
      y: e.clientY,
      url: location.href
    }
    switch (data.tag) {
      case "a":
        data.href = e.target.href
        break
      case "img":
        data.src = e.target.src
        break
    }
    ipcRenderer.send('async-site-message', JSON.stringify({
      sender: 'site',
      type: 'CONTEXT_MENU',
      data
    }))
  }, false)
})()

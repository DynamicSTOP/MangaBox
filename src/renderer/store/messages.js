export const sendMessageToMain = (type = 'UNKNOWN', data = {}) => {
  window.postMessage(JSON.stringify({
    sender: 'renderer',
    type,
    data
  }))
}

export class MessageParser {
  constructor (store) {
    this.store = store
  }

  subscribe () {
    window.addEventListener('message', this.receiveMessage.bind(this), false)
  }

  receiveMessage (event) {
    if (event.data) {
      let data = {}
      try {
        data = JSON.parse(event.data)
      } catch (e) {
      }
      if (data.sender === 'main') {
        this.parseMessage(data)
      }
    }
  }

  parseMessage (message) {
    switch (message.type) {
      case 'APP_CONFIG':
        this.store.commit('CONFIG_UPDATE', message.data)
        break
      case 'SITE_NAVIGATED':
        this.store.commit('SITE_NAVIGATED', message.data)
        break
      case 'INFO_UPDATE':
        this.store.commit('INFO_UPDATE', message.data)
        break
      case 'URL_CURRENT':
        this.store.commit('URL_CURRENT', message.data)
        break
      default:
        console.error('unknown message type', message)
        break
    }
  }
}

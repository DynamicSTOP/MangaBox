// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/
import EventEmitter from 'events'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const getSHA = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}
const checkRule = (rulesGroup, asRegexp = false, toLower) => {
  if (rulesGroup instanceof Array) {
    rulesGroup = rulesGroup.filter((r) => typeof r === 'string').filter((r) => r.length > 0)
    if (toLower) {
      rulesGroup = rulesGroup.map((r) => r.toLowerCase())
    }
    if (asRegexp) {
      rulesGroup = rulesGroup.map((r) => new RegExp(r))
    }
    if (rulesGroup.length === 0) {
      rulesGroup = false
    }
  } else if (rulesGroup !== true) {
    rulesGroup = false
  }
  return rulesGroup
}

const baseDirPath = process.env.NODE_ENV === 'production' ? path.resolve('./') : path.resolve(__dirname, '..', '..')

class NetworkWatcher extends EventEmitter {
  constructor (props) {
    super(props)
    this._view = null
    this._debugger = null
    this._cacheDirectory = path.resolve(baseDirPath, 'cache')
    this._debug = process.env.NODE_ENV === 'development'
    this.loadWatcherRules()
    this.loadCacheRules()
  }

  attach (view) {
    if (this._view) {
      this.detach()
    }

    try {
      view.webContents.debugger.attach('1.3')
      this._view = view
      this._view.webContents.on('destroyed', () => {
        this._view = null
        this._debugger = null
      })
      this._requests = {}
    } catch (err) {
      console.log('Debugger attach failed : ', err)
    }

    if (this._view) {
      this._debugger = this._view.webContents.debugger
      this._debugger.on('message', this.parseMessage.bind(this))
      this._debugger.sendCommand('Fetch.enable', { patterns: [{ requestStage: 'Request' }, { requestStage: 'Response' }] })
    }
  }

  loadWatcherRules (rules = {}) {
    this.watcherRules = {
      request: false,
      response: false,
      headers: false
    }
    Object.assign(this.watcherRules, rules)
    this.validateWatcherRules()
  }

  validateWatcherRules () {
    this.watcherRules.request = checkRule(this.watcherRules.request, true)
    this.watcherRules.response = checkRule(this.watcherRules.response, true)
    this.watcherRules.headers = checkRule(this.watcherRules.headers, false, true)
  }

  loadCacheRules (rules = {}) {
    this.cacheRules = {
      GET: true,
      POST: false
    }
    Object.assign(this.cacheRules, rules)
    this.validateCacheRules()
  }

  validateCacheRules () {
    this.cacheRules.GET = checkRule(this.cacheRules.GET, true)
    this.cacheRules.POST = checkRule(this.cacheRules.POST, true)
  }

  filterHeaders (headers) {
    if (this.watcherRules.headers === false) {
      return {}
    }

    const filteredHeaders = {}
    if (headers instanceof Array) {
      // response is like this { name: 'status', value: '200' },
      headers.map((oldHeader) => {
        if (this.watcherRules.headers === true || this.watcherRules.headers.indexOf(oldHeader.name.toLowerCase()) !== -1) {
          filteredHeaders[oldHeader.name.toLowerCase()] = oldHeader.value
        }
      })
      return filteredHeaders
    } else if (typeof headers === 'object') {
      Object.keys(headers).map((oldHeader) => {
        if (this.watcherRules.headers === true || this.watcherRules.headers.indexOf(oldHeader.toLowerCase()) !== -1) {
          filteredHeaders[oldHeader.toLowerCase()] = headers[oldHeader]
        }
      })
    }
    return filteredHeaders
  }

  getPostData (postData, headers) {
    const post = {
      data: postData,
      type: null
    }
    const keys = Object.keys(headers).filter((k) => k.toLowerCase() === 'content-type')
    if (keys.length) {
      post.type = headers[keys[0]]
    }
    return post
  }

  emitRequest (method, url, headers) {
    if (this.watcherRules.request !== false) {
      if (this.watcherRules.request === true || this.watcherRules.request.some(r => r.test(url))) {
        this.emit('Request', {
          method: method,
          url: url,
          headers: this.filterHeaders(headers)
        })
      }
    }
  }

  async emitResponse (method, url, headers, responseHeaders, requestId, postData, responseData = false) {
    if (this.watcherRules.response !== false) {
      if (this.watcherRules.response === true || this.watcherRules.response.some(r => r.test(url))) {
        const responseDetails = {
          method,
          url,
          headers: this.filterHeaders(headers),
          responseHeaders: this.filterHeaders(responseHeaders)
        }
        if (responseData) {
          responseDetails.result = responseData
        } else {
          responseDetails.result = await this._debugger.sendCommand('Fetch.getResponseBody', { requestId })
        }
        if (method === 'POST') {
          responseDetails.post = this.getPostData(postData, headers)
        }
        this.emit('Response', responseDetails)
      }
    }
  }

  shouldCache (method = '', url = '', responseHeaders = []) {
    if (this.cacheRules[method]) {
      if (this.cacheRules[method] === true || this.cacheRules[method].some(r => r.test(url))) {
        const cacheControl = responseHeaders.filter(h => h.name.toLowerCase() === 'cache-control')
        // TODO no-cache implies that we can still store it, but must validate it
        if (cacheControl.length > 0 && cacheControl[0].value.toLowerCase().match(/(no-cache|no-store)/)) {
          return false
        }
        return true
      }
    }
    return false
  }

  loadFromCache (method, url) {
    if (this.shouldCache(method, url)) {
      const baseName = path.resolve(this._cacheDirectory, getSHA(url))
      if (!fs.existsSync(baseName) || !fs.existsSync(`${baseName}.info`)) {
        return false
      }
      try {
        const info = JSON.parse(fs.readFileSync(`${baseName}.info`, 'utf8'))
        // TODO if outdated. might as well check if "update" is same
        if (info.validUntil && info.validUntil < new Date().getTime()) {
          return false
        }
        const body = fs.readFileSync(baseName, info.base64Encoded ? 'base64' : 'utf8')
        const headers = info.responseHeaders.filter(h =>
          ['age'].indexOf(h.name.toLowerCase()) === -1
        )

        headers.push({
          name: 'age',
          value: Math.floor(((new Date().getTime()) - info.date) / 1000).toString()
        })

        return {
          ...info,
          body,
          headers
        }
      } catch (e) {
        console.error(e)
      }
    }
    return false
  }

  updateCache (method, url, headers, responseHeaders, requestId, postData) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
    let cacheControl = responseHeaders.filter(h => h.name.toLowerCase() === 'cache-control')
    if (cacheControl.length > 0) {
      cacheControl = cacheControl[0].value.toLowerCase()
      if (cacheControl.match(/no-store/)) return
    } else {
      cacheControl = false
    }

    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expires
    const expires = responseHeaders.filter(h => h.name.toLowerCase() === 'expires')
    let expireDate = false
    if (expires.length > 0) {
      expireDate = new Date(expires[0].value)
      if (!(expireDate instanceof Date) || isNaN(expireDate.getTime())) {
        expireDate = false
      }
      if (expireDate === false || new Date().getTime() < expireDate.getTime()) return
      expireDate = expireDate.getTime()
    }

    if (this.shouldCache(method, url, responseHeaders)) {
      const baseName = path.resolve(this._cacheDirectory, getSHA(url))
      const info = {
        url,
        responseHeaders: responseHeaders.filter(h => ['cookie', 'authorization', 'age'].indexOf(h.name) === -1)
      }

      info.date = new Date().getTime()

      let validUntil = false
      let sMaxAge = false
      if (cacheControl) {
        if (cacheControl.match(/no-cache/)) {
          info.revalidate = true
        }

        let match = cacheControl.match(/max-age=(-?\d+)/)
        if (match && match.length === 2) {
          const maxAge = parseInt(match[2])
          if (maxAge <= 0) return
          validUntil = new Date().getTime() + maxAge * 1000
        }

        match = cacheControl.match(/s-maxage=(-?\d+)/)
        if (match && match.length === 2) {
          const maxAge = parseInt(match[2])
          if (maxAge <= 0) return
          sMaxAge = true
          validUntil = new Date().getTime() + maxAge * 1000
        }

        if (cacheControl.match(/immutable/)) {
          info.revalidate = false
          info.immutable = true
        }
      }

      if (!sMaxAge && expireDate !== false && (validUntil === false || expireDate < validUntil)) {
        validUntil = expireDate
      }

      if (validUntil !== false) {
        info.validUntil = validUntil
      }

      if (method === 'POST') {
        info.post = this.getPostData(postData, headers)
      }
      this._debugger.sendCommand('Fetch.getResponseBody', { requestId })
        .then((result) => {
          info.base64Encoded = result.base64Encoded
          fs.writeFileSync(`${baseName}.info`, JSON.stringify(info), 'utf8')
          fs.writeFileSync(`${baseName}`, result.body, result.base64Encoded ? 'base64' : 'utf8')
        })
    }
  }

  parseMessage (event, method, params) {
    // check this page https://chromedevtools.github.io/devtools-protocol/tot/Network
    if (method === 'Fetch.requestPaused') {
      const requestType = params.responseHeaders ? 'Response' : 'Request'
      const { method, url, headers, postData } = params.request
      const { requestId, responseHeaders } = params
      try {
        if (requestType === 'Request') {
          this.emitRequest(method, url, headers)
          if (params.resourceType !== 'Document') {
            const cached = this.loadFromCache(method, url)
            if (cached) {
              this._debugger.sendCommand('Fetch.fulfillRequest', {
                requestId,
                responseCode: 200,
                responseHeaders: cached.headers,
                body: cached.body
              }).catch(console.error)
              this.emitResponse(method, url, headers, responseHeaders, requestId, postData, {
                base64Encoded: true,
                body: cached.body
              })
              return
            }
          }
        } else {
          this.emitResponse(method, url, headers, responseHeaders, requestId, postData)
          this.updateCache(method, url, headers, responseHeaders, requestId, postData)
        }
      } catch (e) {
        console.error(e)
      }
      this._debugger.sendCommand('Fetch.continueRequest', { requestId })
    }
  }

  detach () {
    if (this._view) {
      this._debugger.detach()
    }
    this._view = null
  }
}

const nw = new NetworkWatcher()
export default nw

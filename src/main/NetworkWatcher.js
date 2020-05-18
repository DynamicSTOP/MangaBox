// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/
import EventEmitter from 'events'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import https from 'https'

const getSHA = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}
const checkRule = (rulesGroup, asRegexp = false, toLower) => {
  if (typeof rulesGroup === 'undefined') return false
  if (rulesGroup instanceof Array) {
    rulesGroup = rulesGroup.map((r) => {
      if (r instanceof RegExp) return r
      if (typeof r === 'string' && r.length > 0) {
        if (toLower) {
          r = r.toLowerCase()
        }
        if (asRegexp) {
          r = new RegExp(r)
        }
        return r
      }
      return false
    }).filter((r) => r !== false)
    if (rulesGroup.length === 0) {
      rulesGroup = false
    }
  } else if (rulesGroup !== true) {
    rulesGroup = false
  }
  return rulesGroup
}

const baseDirPath = process.env.NODE_ENV === 'production' ? path.resolve('./') : path.resolve(__dirname, '..', '..')

export class NetworkWatcher extends EventEmitter {
  constructor () {
    super()
    /**
     *
     * @type {null|Electron.WebContents}
     * @private
     */
    this._webContents = null
    /**
     *
     * @type {null|Electron.Debugger}
     * @private
     */
    this._debugger = null
    this._cacheDirectory = path.resolve(baseDirPath, 'cache')
    this._debug = process.env.NODE_ENV === 'development'
    this._storage = false
    this.watcherRulesSets = []
    this.loadCacheRules()
  }

  /**
   *
   * @param webContents {Electron.WebContents}
   */
  attach (webContents) {
    if (this._webContents) {
      this._debugger.detach()
      this._debugger = null
      this._webContents = null
    }

    try {
      webContents.debugger.attach('1.3')
      this._webContents = webContents
    } catch (err) {
      console.error('Debugger attach failed : ', err)
    }

    if (this._webContents) {
      this._debugger = this._webContents.debugger
      this._debugger.on('message', this.parseMessage.bind(this))
      this._debugger.sendCommand('Fetch.enable', { patterns: [{ requestStage: 'Request' }, { requestStage: 'Response' }] })
    }
  }

  addWatcherRules (rulesSet = {}) {
    if (!rulesSet) return
    const { headers, response, request, marker } = rulesSet
    rulesSet.request = checkRule(request, true)
    rulesSet.response = checkRule(response, true)
    rulesSet.headers = checkRule(headers, false, true)
    if (marker && this.watcherRulesSets.some(s => s.marker === marker)) {
      const index = this.watcherRulesSets.findIndex(s => s.marker === marker)
      this.watcherRulesSets[index] = rulesSet
    } else {
      this.watcherRulesSets.push(rulesSet)
    }
  }

  loadCacheRules (rules = {}) {
    this.cacheRules = {
      GET: true,
      POST: false
    }
    Object.assign(this.cacheRules, rules)
    this.validateCacheRules()
  }

  setStorage (storage) {
    this._storage = storage
  }

  validateCacheRules () {
    this.cacheRules.GET = checkRule(this.cacheRules.GET, true)
    this.cacheRules.POST = checkRule(this.cacheRules.POST, true)
  }

  filterHeaders (headers, rulesSet = {}) {
    if (rulesSet.headers === false) {
      return {}
    }

    const filteredHeaders = {}
    if (headers instanceof Array) {
      // response is like this { name: 'status', value: '200' },
      headers.map((oldHeader) => {
        if (rulesSet.headers === true || rulesSet.headers.indexOf(oldHeader.name.toLowerCase()) !== -1) {
          filteredHeaders[oldHeader.name.toLowerCase()] = oldHeader.value
        }
      })
      return filteredHeaders
    } else if (typeof headers === 'object') {
      Object.keys(headers).map((oldHeader) => {
        if (rulesSet.headers === true || rulesSet.headers.indexOf(oldHeader.toLowerCase()) !== -1) {
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
    const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
    if (key) {
      post.type = headers[key]
    }
    return post
  }

  emitRequest (method, url, headers) {
    if (this.watcherRulesSets.some((s) => s.request !== false).length !== 0) {
      this.watcherRulesSets.filter((set) => set.request === true || (set.request !== false && set.request.some(r => r.test(url))))
        .map((set) => {
          this.emit('Request', {
            marker: set.marker,
            method: method,
            url: url,
            headers: this.filterHeaders(headers, set)
          })
        })
    }
  }

  async emitResponse (method, url, headers, responseHeaders, requestId, postData, responseData = false) {
    if (this.watcherRulesSets.some((s) => s.response !== false).length !== 0) {
      const sets = this.watcherRulesSets.filter((set) => set.response === true || (set.response !== false && set.response.some(r => r.test(url))))
      if (sets.length === 0) return
      const responseDetails = {
        method,
        url
      }
      if (responseData) {
        responseDetails.result = responseData
      }
      if (method === 'POST') {
        responseDetails.post = this.getPostData(postData, headers)
      }
      sets.map(async (set) => {
        responseDetails.marker = set.marker
        responseDetails.headers = this.filterHeaders(headers, set)
        responseDetails.responseHeaders = this.filterHeaders(responseHeaders, set)
        if (!responseDetails.result) {
          try {
            responseDetails.result = await this._debugger.sendCommand('Fetch.getResponseBody', { requestId })
          } catch (e) {
            console.error(e)
            return
          }
        }
        this.emit('Response', responseDetails)
      })
    }
  }

  shouldCache (method = '', url = '', responseHeaders = []) {
    if (this.cacheRules[method]) {
      if (this.cacheRules[method] === true || this.cacheRules[method].some(r => r.test(url))) {
        const cacheControl = responseHeaders.find(h => h.name.toLowerCase() === 'cache-control')
        if (cacheControl && cacheControl.value.toLowerCase().match(/(no-store)/)) {
          return false
        }
        if (responseHeaders.find(h => ['authorization', 'set-cookie'].indexOf(h.name.toLowerCase()) !== -1)) {
          return false
        }
        return true
      }
    }
    return false
  }

  async loadFromCache (method, url, headers = {}, forceRevalidate = false) {
    if (this._storage === false) return false
    if (this.shouldCache(method, url)) {
      const row = await this._storage.getFromPathsByUrl(url)
      if (row === false) return false

      const cachedPath = path.resolve(baseDirPath, row.path)
      if (!fs.existsSync(cachedPath)) {
        await this._storage.deleteFromPathsByUrl(url)
        return false
      }
      let validation = false
      try {
        let { info } = row
        const { stored } = row

        let body = false
        if (forceRevalidate || info.revalidate || (info.validUntil && info.validUntil < new Date().getTime())) {
          validation = await this.revalidate(method, info, headers)
          if (!validation.result) {
            return false
          } else {
            if (validation.statusCode === 200) {
              fs.writeFileSync(cachedPath, validation.body, 'base64')
              body = validation.body
              info = {
                url,
                headers,
                responseHeaders: validation.responseHeaders.filter(h => ['set-cookie', 'authorization', 'age'].indexOf(h.name) === -1),
                base64Encoded: true
              }
            }
            if (validation.statusCode === 200 || validation.statusCode === 304) {
              const expireDate = this.getExpiredFromHeaders(info.responseHeaders)
              const cacheControl = this.getCacheControlFromHeaders(info.responseHeaders)
              const cacheControlInfo = this.getCacheControlInfo(cacheControl, expireDate)
              Object.assign(info, cacheControlInfo)
              info.date = new Date().getTime()
              info.responseHeaders = validation.responseHeaders.filter(h => ['set-cookie', 'authorization', 'age'].indexOf(h.name) === -1)
              await this._storage.addToPaths(url, path.relative(baseDirPath, cachedPath), info, stored)
            } else {
              return false
            }
          }
        }

        if (body === false) {
          body = fs.readFileSync(cachedPath, info.base64Encoded ? 'base64' : 'utf8')
        }
        const filteredHeaders = info.responseHeaders.filter(h =>
          ['age'].indexOf(h.name.toLowerCase()) === -1
        )

        let age = Math.floor(((new Date().getTime()) - info.date) / 1000)
        if (age < 1) {
          age = 1
        }
        filteredHeaders.push({
          name: 'age',
          value: age.toString()
        })
        filteredHeaders.push({
          name: 'Via',
          value: '1.0 MangaBoxCache'
        })

        return {
          ...info,
          body,
          responseHeaders: filteredHeaders,
          redownloaded: validation && validation.statusCode === 200
        }
      } catch (e) {
        console.error(e)
      }
    }
    return false
  }

  getExpiredFromHeaders (headers) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expires
    const expires = headers.find(h => h.name.toLowerCase() === 'expires')
    if (expires) {
      const expireDate = new Date(expires.value)
      if (!(expireDate instanceof Date) || isNaN(expireDate.getTime()) || new Date().getTime() < expireDate.getTime()) {
        return false
      }
      return expireDate.getTime()
    }
    return false
  }

  getCacheControlFromHeaders (headers) {
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
    const cacheControl = headers.find(h => h.name.toLowerCase() === 'cache-control')
    if (cacheControl) {
      return cacheControl.value.toLowerCase()
    }
    return false
  }

  getCacheControlInfo (cacheControl = '', expireDate) {
    const info = {}

    let validUntil = false
    let sMaxAge = false
    if (cacheControl) {
      if (cacheControl.match(/(no-cache|must-revalidate)/)) {
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
    return info
  }

  async updateCache (method, url, headers, responseHeaders, requestId, postData) {
    const cacheControl = this.getCacheControlFromHeaders(responseHeaders)
    if (cacheControl && cacheControl.match(/no-store/)) return false
    if (this._storage === false) return false

    if (this.shouldCache(method, url, responseHeaders)) {
      // TODO check if need to check db
      const row = await this._storage.getFromPathsByUrl(url)
      let cachedPath
      let stored = false
      if (row !== false) {
        cachedPath = path.resolve(baseDirPath, row.path)
        stored = row.stored
      } else {
        cachedPath = path.resolve(this._cacheDirectory, getSHA(url))
      }
      const info = {
        url,
        headers,
        responseHeaders: responseHeaders.filter(h => ['cookie', 'authorization', 'age'].indexOf(h.name) === -1)
      }

      info.date = new Date().getTime()
      const expireDate = this.getExpiredFromHeaders(responseHeaders)
      const cacheControlInfo = this.getCacheControlInfo(cacheControl, expireDate)
      Object.assign(info, cacheControlInfo)

      if (method === 'POST') {
        info.post = this.getPostData(postData, headers)
      }
      try {
        const result = await this._debugger.sendCommand('Fetch.getResponseBody', { requestId })
        info.base64Encoded = result.base64Encoded
        await this._storage.addToPaths(url, path.relative(baseDirPath, cachedPath), info, stored)
        fs.writeFileSync(path.resolve(baseDirPath, cachedPath), result.body, result.base64Encoded ? 'base64' : 'utf8')
      } catch (e) {
        console.error(e)
      }
    }
  }

  shouldFailUrl (url) {
    return !!url.match(/https:\/\/(www\.)?(googletagmanager|google-analytics)\.com/)
  }

  async parseMessage (event, method, params) {
    // check this page https://chromedevtools.github.io/devtools-protocol/tot/Network
    if (method === 'Fetch.requestPaused') {
      const requestType = params.responseHeaders ? 'Response' : 'Request'
      const { method, url, headers, postData } = params.request
      const { requestId, responseHeaders, responseStatusCode } = params
      try {
        if (requestType === 'Request') {
          if (this.shouldFailUrl(url) && this._debugger) {
            return this._debugger.sendCommand('Fetch.failRequest', {
              requestId,
              errorReason: 'Aborted'
            }).catch(console.error)
          }
          this.emitRequest(method, url, headers)
          const cached = await this.loadFromCache(method, url, headers, params.resourceType === 'Document')
          if (cached && this._debugger) {
            try {
              await this._debugger.sendCommand('Fetch.fulfillRequest', {
                requestId,
                responseCode: 200,
                responseHeaders: cached.responseHeaders,
                body: cached.body
              })
              await this.emitResponse(method, url, headers, cached.responseHeaders, requestId, postData, {
                base64Encoded: true,
                body: cached.body
              })
              if (!cached.redownloaded) {
                if (cached.body.length > 0) {
                  let size = (cached.body.length / 4) * 3
                  const match = cached.body.match(/(=+)$/)
                  if (match) {
                    size -= match[1].length
                  }
                  this.emit('loadedFromCache', size)
                }
              }
              return
            } catch (e) {
              console.error('ERROR in Fetch.fulfillRequest', url, e.message, e)
            }
          }
        } else {
          if (responseStatusCode === 200) {
            await this.updateCache(method, url, headers, responseHeaders, requestId, postData)
          }
          await this.emitResponse(method, url, headers, responseHeaders, requestId, postData)
        }
      } catch (e) {
        console.error(e)
      }
      // there are awaits above. can already be dead by this point
      if (this._debugger) {
        this._debugger.sendCommand('Fetch.continueRequest', { requestId }).catch(console.error)
      } else {
        console.error('debugger is', this._debugger)
      }
    }
  }

  revalidate (method, info, currentHeaders = {}) {
    if (method.toLowerCase() !== 'get') return Promise.resolve({ result: false })
    return new Promise((resolve) => {
      const options = {
        method: method.toUpperCase(),
        headers: {
          ...currentHeaders
        }
      }

      const modifiedHeader = Object.keys(options.headers).find(k => k.toLowerCase() === 'if-modified-since')
      if (modifiedHeader) {
        options.headers[modifiedHeader] = new Date(info.date).toUTCString()
      } else {
        options.headers['If-Modified-Since'] = new Date(info.date).toUTCString()
      }

      const etag = Object.keys(info.headers).find(k => k.toLowerCase() === 'etag')
      if (etag) {
        options.headers[etag] = info.headers[etag]
      }
      const ua = Object.keys(currentHeaders).find(k => k.toLowerCase() === 'user-agent')
      if (ua) {
        options.headers[ua] = currentHeaders[ua]
      }
      let body = Buffer.from('')

      const req = https.request(info.url, options, (result) => {
        result.on('data', (chunk) => {
          body = Buffer.concat([body, chunk])
        })
        result.on('end', () => {
          resolve({
            result: true,
            statusCode: result.statusCode,
            responseHeaders: Object.keys(result.headers).map(k => {
              return {
                name: k.toLowerCase(),
                value: result.headers[k]
              }
            }),
            body: body.toString('base64')
          })
        })
      })

      req.on('error', (err) => {
        console.error('error while revalidating', err)
        resolve({ result: false })
      })
      req.end()
    })
  }
}

export const getFileExtensionFromHeaders = (responseHeaders) => {
  const contentType = responseHeaders.find(h => h.name === 'content-type')
  if (contentType) {
    switch (contentType.value) {
      case 'image/jpeg':
        return '.jpg'
      case 'image/png':
        return '.png'
      case 'image/gif':
        return '.gif'
      case 'image/webp':
        return '.webp'
      case 'image/apng':
        return '.apng'
      case 'image/bmp':
        return '.bmp'
      case 'image/x-icon':
        return '.x-icon'
      case 'image/svg+xml':
        return '.svg'
      case 'image/tiff':
        return '.tiff'
    }
  }
  return ''
}

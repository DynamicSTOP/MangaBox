import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'

const sqlite = sqlite3.verbose()

class Storage {
  constructor () {
    /**
     *
     * @type {sqlite3.Database|null}
     */
    this.db = null
    this._dumping = false
    this._pathsConfig = {}
    this._dirExists = {}
  }

  async init (pathsConfig = {}) {
    pathsConfig.backupPath = path.resolve(pathsConfig.mangaDirAbs, 'backup.json')
    pathsConfig.backupPathsPath = path.resolve(pathsConfig.mangaDirAbs, 'backup_paths.json')
    this._pathsConfig = pathsConfig

    const initDB = !fs.existsSync(pathsConfig.storageAbs)
    this.db = new sqlite.Database(pathsConfig.storageAbs)
    if (initDB) {
      await this._initDB()
    }
    await this._checkStorage()
    setTimeout(() => this._dumpStorage(), 30 * 60 * 1000)
  }

  async _checkStorage () {
    const allManga = await this.getAllManga()
    if (allManga.length === 0 && fs.existsSync(this._pathsConfig.backupPath)) {
      try {
        const mangaArray = JSON.parse(fs.readFileSync(this._pathsConfig.backupPath, 'utf8'))
        for (let i = 0; i < mangaArray.length; i++) {
          await this.addManga(mangaArray[i])
        }
      } catch (e) {
        console.error(e)
      }

      const storedPaths = await this.getAllStoredPaths()
      if (storedPaths.length === 0 && fs.existsSync(this._pathsConfig.backupPathsPath)) {
        try {
          const paths = JSON.parse(fs.readFileSync(this._pathsConfig.backupPathsPath, 'utf8'))
          for (let i = 0; i < paths.length; i++) {
            const { url, path, info, stored } = paths[i]
            await this.addToPaths(url, path, info, stored)
          }
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  async _dumpStorage () {
    if (this._dumping) return
    this._dumping = true
    const allManga = await this.getAllManga()
    fs.writeFileSync(this._pathsConfig.backupPath, JSON.stringify(allManga), 'utf8')
    const allStoredPaths = await this.getAllStoredPaths()
    fs.writeFileSync(this._pathsConfig.backupPathsPath, JSON.stringify(allStoredPaths), 'utf8')
    this._dumping = false
  }

  _run (sql = '', params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err !== null) {
          reject(err)
        }
        resolve()
      })
    })
  }

  _get (sql = '', params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          return reject(err)
        }
        return resolve(row)
      })
    })
  }

  async _initDB () {
    try {
      // paths
      await this._run('CREATE TABLE paths ' +
        ' (' +
        ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        ' url VARCHAR(255) UNIQUE,' +
        ' path VARCHAR(255),' +
        ' info TEXT,' +
        ' stored BOOLEAN,' +
        ' time DATETIME default CURRENT_TIMESTAMP' +
        ')')
      await this._run('CREATE INDEX paths_path_index ON paths (stored, path)')

      // manga data
      await this._run(
        'CREATE TABLE manga ' +
        '(' +
        ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        ' site_id INTEGER,' +
        ' manga_site_id INTEGER,' +
        ' url VARCHAR(255),' +
        ' save BOOLEAN,' +
        ' title VARCHAR(255),' +
        ' last_check INTEGER,' +
        ' last_en INTEGER,' +
        ' last_ru INTEGER,' +
        ' last INTEGER,' +
        ' json TEXT' +
        ')')
      await this._run('CREATE INDEX manga_id_index ON manga (site_id DESC, manga_site_id DESC)')
      await this._run('CREATE INDEX manga_last_index ON manga (last_en DESC, last_ru DESC, last DESC)')

      // chapters
      await this._run(
        'CREATE TABLE chapters ' +
        '(' +
        ' id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        ' manga_id INTEGER,' +
        ' manga_site_chapter_id INTEGER,' +
        ' json TEXT,' +
        ' FOREIGN KEY(manga_id) REFERENCES manga(id)' +
        ')')
      await this._run('CREATE INDEX chapter_id_index ON chapters (manga_id DESC, manga_site_chapter_id DESC)')

      // vault (for settings and some temp stuff)
      await this._run('CREATE TABLE vault (name VARCHAR(255) PRIMARY KEY, value text)')
    } catch (e) {
      console.error(e)
    }
  }

  async addToPaths (url = '', path = '', info = {}, stored = false) {
    try {
      await this._run(
        'INSERT OR REPLACE INTO paths (id, url, path, info, stored) ' +
        'VALUES ((select id from paths where url = ?),?,?,?,?)',
        [url, url, path, JSON.stringify(info), stored])
      return await this.getFromPathsByUrl(url)
    } catch (e) {
      console.error(e)
    }
    return false
  }

  async storePath (url = '', info = {}, body) {
    try {
      const rowStored = await this.getFromPathsByUrl(url)
      if (rowStored) {
        await this.addToPaths(url, rowStored.path, info, rowStored.stored)
        fs.writeFileSync(path.resolve(this._pathsConfig.mangaDirAbs, rowStored.path), body, info.base64Encoded ? 'base64' : 'utf8')
      } else {
        const row = await this.addToPaths(url, '', info, false)
        await this.addToPaths(url, row.id.toString(), info, false)
        fs.writeFileSync(path.resolve(this._pathsConfig.cacheDirAbs, row.id.toString()), body, info.base64Encoded ? 'base64' : 'utf8')
      }
      return true
    } catch (e) {
      console.error(e)
    }
    return false
  }

  async getFromPathsByUrl (url = '') {
    const row = await this._get('SELECT * FROM paths WHERE url = ? ', url)
    if (typeof row === 'undefined') return false
    try {
      row.info = JSON.parse(row.info)
      row.stored = !!row.stored
    } catch (e) {
      return false
    }
    return row
  }

  async getFromPathsByUrls (urls = []) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM paths WHERE url in (${Array(urls.length).fill('?').join(',')})`, urls, (error, rows) => {
        if (error) {
          return reject(error)
        }
        resolve(rows.map(r => {
          r.stored = !!r.stored
          r.info = JSON.parse(r.info)
          return r
        }))
      })
    })
  }

  async moveCachedFile (id = 0, pathTo = '', willBeStored = true) {
    const row = await this._get('SELECT * FROM paths WHERE id = ?', [id])
    if (typeof row === 'undefined') return false
    try {
      let from, to

      if (row.stored) {
        from = path.resolve(this._pathsConfig.mangaDirAbs, row.path)
      } else {
        from = path.resolve(this._pathsConfig.cacheDirAbs, row.path)
      }

      if (willBeStored) {
        to = path.resolve(this._pathsConfig.mangaDirAbs, pathTo)
      } else {
        to = path.resolve(this._pathsConfig.cacheDirAbs, pathTo)
      }

      fs.renameSync(from, to)
      await this._run('UPDATE paths SET path = ?, stored = ? WHERE id = ?', [pathTo, willBeStored, id])
      return await this.getFromPathsByUrl(row.url)
    } catch (e) {
      return false
    }
  }

  /**
   *
   * @param instructions
   * @return {Promise<void>}
   */
  async moveCachedFilesToManga (instructions = []) {
    if (instructions.length === 0) return

    const stmt = this.db.prepare('UPDATE paths SET path = ?, stored = ? WHERE id = ?')

    await Promise.all(instructions.map(instruction =>
      new Promise((resolve, reject) => {
        // first check if dir exists
        const checkDirs = instruction.pathTo.split('/')
        checkDirs.pop()

        if (instruction.willBeStored) {
          const mangaDirFullPath = path.resolve(this._pathsConfig.mangaDirAbs, checkDirs.join('/'))
          if (typeof this._dirExists[mangaDirFullPath] === 'undefined') {
            fs.mkdirSync(mangaDirFullPath, { recursive: true })
            this._dirExists[mangaDirFullPath] = true
          }
        }

        let from, to

        if (instruction.stored) {
          from = path.resolve(this._pathsConfig.mangaDirAbs, instruction.pathFrom)
        } else {
          from = path.resolve(this._pathsConfig.cacheDirAbs, instruction.pathFrom)
        }

        if (instruction.willBeStored) {
          to = path.resolve(this._pathsConfig.mangaDirAbs, instruction.pathTo)
        } else {
          to = path.resolve(this._pathsConfig.cacheDirAbs, instruction.pathTo)
        }
        fs.renameSync(from, to)
        stmt.run(instruction.pathTo, instruction.willBeStored, instruction.id, (err) => {
          if (err !== null) {
            reject(err)
          }
          resolve()
        })
      })
    ))
  }

  async isPathExistsAndNotStored (url = '') {
    const pathRow = await this.getFromPathsByUrl(url)
    return !(!pathRow || pathRow.stored)
  }

  async deleteFromPathsByUrl (url = '') {
    if (url === '') return false
    return await this._run('DELETE FROM paths WHERE url=?', [url])
  }

  /**
   * for selecting
   * @param allowedKeys Array
   * @param object Object
   * @return {{where: [], params: []}}
   * @private
   */
  _prepareWhereParams (allowedKeys = [], object = {}) {
    const where = []
    const params = []
    Object.keys(object)
      .filter((k) => allowedKeys.indexOf(k) !== -1)
      .map((k) => {
        where.push(`${k} = ?`)
        params.push(object[k])
      })
    return {
      where,
      params
    }
  }

  /**
   * For insert and update
   * @param object
   * @param allowedKeys
   * @return {{keys: [], params: []}}
   * @private
   */
  _buildInsertParams (object, allowedKeys = []) {
    const keys = []
    const params = []
    Object.keys(object)
      .filter((k) => allowedKeys.indexOf(k) !== -1)
      .map((k) => {
        keys.push(k)
        switch (k) {
          case 'json':
            params.push(JSON.stringify(object[k]))
            break
          default:
            params.push(object[k])
            break
        }
      })
    return {
      keys,
      params
    }
  }

  /**
   *
   * @param table
   * @param where
   * @param params
   * @return {Promise<boolean>}
   * @private
   */
  async _getWithParams (table = '', where = [], params = []) {
    const row = await this._get(`SELECT * FROM ${table} WHERE ` + where.join(' and '), params)
    if (typeof row === 'undefined') return false
    try {
      if (typeof row.save !== 'undefined') {
        row.save = !!row.save
      }
      if (typeof row.json !== 'undefined') {
        row.json = JSON.parse(row.json)
      }
      return row
    } catch (e) {
      return false
    }
  }

  /**
   * Selects from storage using params
   * @param manga
   * @returns {Promise<Object|false>}
   */
  async getManga (manga = {}) {
    const { where, params } = this._prepareWhereParams(['manga_site_id', 'site_id', 'id', 'url'], manga)
    if (where.length === 0) return false
    return await this._getWithParams('manga', where, params)
  }

  /**
   * Selects from storage using params
   * @param chapter
   * @return {Promise<Object|false>}
   */
  async getChapter (chapter = {}) {
    const { where, params } = this._prepareWhereParams(['manga_id', 'manga_site_chapter_id', 'id'], chapter)
    if (where.length === 0) return false
    return await this._getWithParams('chapters', where, params)
  }

  /**
   *
   * @param table
   * @param keys
   * @param params
   * @return {Promise<unknown>}
   * @private
   */
  async _runInsert (table, keys, params) {
    return await this._run(`INSERT INTO ${table} (${keys.join(',')} ) VALUES (${Array(keys.length).fill('?').join(',')} )`, params)
  }

  /**
   *
   * @param manga {Object}
   * @returns {Promise<Object|false>}
   */
  async addManga (manga = {}) {
    const row = await this.getManga(manga)
    if (row) return row
    const { keys, params } = this._buildInsertParams(manga, ['manga_site_id', 'title', 'site_id', 'url', 'save', 'json', 'last', 'last_en', 'last_ru', 'last_check'])
    await this._runInsert('manga', keys, params)
    this._dumpStorage()
    return await this.getManga(manga)
  }

  /**
   *
   * @param chapter
   * @return {Promise<Object|false>}
   */
  async addChapter (chapter = {}) {
    const row = await this.getChapter(chapter)
    if (row) return row
    const { keys, params } = this._buildInsertParams(chapter, ['manga_id', 'manga_site_chapter_id', 'json'])
    await this._runInsert('chapters', keys, params)
    // this._dumpStorage()
    return await this.getChapter(chapter)
  }

  /**
   *
   * @param manga {Object}
   * @returns {Promise<Object|false>}
   */
  async updateManga (manga = {}) {
    if (!manga.id) return
    const { keys, params } = this._buildInsertParams(manga, ['manga_site_id', 'title', 'site_id', 'url', 'save', 'json', 'last', 'last_en', 'last_ru', 'last_check'])
    params.push(manga.id)
    await this._run('UPDATE manga SET ' + keys.map((k) => `${k} = ?`).join(',') + ' WHERE id = ?', params)
    return await this.getManga({ id: manga.id })
  }

  /**
   *
   * @param manga {Object}
   * @returns {Promise<Object|false>}
   */
  async updateChapter (chapter = {}) {
    if (!chapter.id) return
    const { keys, params } = this._buildInsertParams(chapter, ['manga_id', 'manga_site_chapter_id', 'json'])
    params.push(chapter.id)
    await this._run('UPDATE chapters SET ' + keys.map((k) => `${k} = ?`).join(',') + ' WHERE id = ?', params)
    return await this.getChapter({ id: chapter.id })
  }

  /**
   * @param siteId {number}
   * @returns {Promise<Array.Object>}
   */
  getAllManga (siteId = -1) {
    let where = ''
    let params = []
    if (siteId !== -1) {
      where = 'where site_id = ?'
      params = [siteId]
    }
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * from manga ${where}`, params, (error, rows) => {
        if (error) {
          return reject(error)
        }
        resolve(rows.map(r => {
          r.save = !!r.save
          r.json = JSON.parse(r.json)
          return r
        }))
      })
    })
  }

  /**
   *
   * @returns {Promise<Array.Object>}
   */
  getAllStoredPaths () {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * from paths where stored = ?', [true], (error, rows) => {
        if (error) {
          return reject(error)
        }
        resolve(rows.map(r => {
          r.stored = !!r.stored
          r.info = JSON.parse(r.info)
          return r
        }))
      })
    })
  }

  async getFromVault (name = '') {
    const row = await this._get('SELECT name, value FROM vault WHERE name=?', name)
    if (row) {
      try {
        return JSON.parse(row.value)
      } catch (e) {
        console.error(e)
      }
    }
  }

  async updateVault (name = '', value) {
    await this._run('INSERT OR REPLACE INTO vault (name, value) VALUES (?,?)', [name, JSON.stringify(value)])
  }
}

const storage = new Storage()
export default storage

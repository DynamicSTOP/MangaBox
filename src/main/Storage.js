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

  async isPathExistsAndNotStored (url = '') {
    const pathRow = await this.getFromPathsByUrl(url)
    return !(!pathRow || pathRow.stored)
  }

  async deleteFromPathsByUrl (url = '') {
    if (url === '') return false
    return await this._run('DELETE FROM paths WHERE url=?', [url])
  }

  /**
   *
   * @param manga
   * @returns {Promise<Object|false>}
   */
  async getManga (manga = {}) {
    const allowedKeys = ['manga_site_id', 'site_id', 'id', 'url']
    const where = []
    const params = []
    Object.keys(manga)
      .filter((k) => allowedKeys.indexOf(k) !== -1)
      .map((k) => {
        where.push(`${k} = ?`)
        params.push(manga[k])
      })
    if (where.length === 0) return false

    const row = await this._get('SELECT * FROM manga WHERE ' + where.join(' and '), params)
    if (typeof row === 'undefined') return false
    try {
      row.save = !!row.save
      row.json = JSON.parse(row.json)
    } catch (e) {
      return false
    }
    return row
  }

  _buildMangaParams (manga) {
    const allowedKeys = ['manga_site_id', 'title', 'site_id', 'url', 'save', 'json', 'last', 'last_en', 'last_ru', 'last_check']
    const keys = []
    const params = []
    Object.keys(manga)
      .filter((k) => allowedKeys.indexOf(k) !== -1)
      .map((k) => {
        keys.push(k)
        switch (k) {
          case 'json':
            params.push(JSON.stringify(manga[k]))
            break
          default:
            params.push(manga[k])
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
   * @param manga {Object}
   * @returns {Promise<Object|false>}
   */
  async addManga (manga = {}) {
    const row = await this.getManga(manga)
    if (row) return row
    const { keys, params } = this._buildMangaParams(manga)
    await this._run('INSERT INTO manga (' + keys.join(',') + ') VALUES (' + Array(keys.length).fill('?').join(',') + ')', params)
    this._dumpStorage()
    return await this.getManga(manga)
  }

  /**
   *
   * @param manga {Object}
   * @returns {Promise<Object|false>}
   */
  async updateManga (manga = {}) {
    if (!manga.id) return
    const { keys, params } = this._buildMangaParams(manga)
    params.push(manga.id)
    await this._run('UPDATE manga SET ' + keys.map((k) => `${k} = ?`).join(',') + ' WHERE id = ?', params)
    return this.getManga({ id: manga.id })
  }

  /**
   *
   * @returns {Promise<Array.Object>}
   */
  getAllManga () {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * from manga', (error, rows) => {
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

import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const getSHA = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}

const sqlite = sqlite3.verbose()
const basePath = process.env.NODE_ENV === 'production' ? path.resolve('./') : path.resolve(__dirname, '..', '..')
const dbPath = path.resolve(basePath, 'storage.sqlite')
const backupPath = path.resolve(basePath, 'manga', 'backup.json')
const backupPathsPath = path.resolve(basePath, 'manga', 'backup_paths.json')

class Storage {
  constructor () {
    /**
     *
     * @type {sqlite3.Database|null}
     */
    this.db = null
    this._dumping = false
    this._cacheDirectory = path.resolve(basePath, 'cache')
    setTimeout(() => this._dumpStorage(), 30 * 60 * 1000)
  }

  async init () {
    const initDB = !fs.existsSync(dbPath)
    this.db = new sqlite.Database(dbPath)
    if (initDB) {
      await this._initDB()
    }
    if (!fs.existsSync(path.resolve(basePath, 'cache'))) {
      fs.mkdirSync(path.resolve(basePath, 'cache'))
      fs.writeFileSync(path.resolve(basePath, 'cache', '.gitignore'), '*', 'utf8')
    }
    if (!fs.existsSync(path.resolve(basePath, 'manga'))) {
      fs.mkdirSync(path.resolve(basePath, 'manga'))
      fs.writeFileSync(path.resolve(basePath, 'manga', '.gitignore'), '*.*', 'utf8')
    }
    await this._checkStorage()
  }

  resolveCachePath (url = '') {
    return path.resolve(this._cacheDirectory, getSHA(url))
  }

  async _checkStorage () {
    const allManga = await this.getAllManga()

    if (allManga.length === 0 && fs.existsSync(backupPath)) {
      try {
        const mangaArray = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
        for (let i = 0; i < mangaArray.length; i++) {
          await this.addManga(mangaArray[i])
        }
      } catch (e) {
        console.error(e)
      }

      const storedPaths = await this.getAllStoredPaths()
      if (storedPaths.length === 0 && fs.existsSync(backupPathsPath)) {
        try {
          const paths = JSON.parse(fs.readFileSync(backupPathsPath, 'utf8'))
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
    fs.writeFileSync(backupPath, JSON.stringify(allManga), 'utf8')
    const allStoredPaths = await this.getAllStoredPaths()
    fs.writeFileSync(backupPathsPath, JSON.stringify(allStoredPaths), 'utf8')
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
      await this._run('CREATE TABLE paths (url VARCHAR(255) PRIMARY KEY, path VARCHAR(255), info TEXT, stored BOOLEAN, time DATETIME default CURRENT_TIMESTAMP)')
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
    } catch (e) {
      console.error(e)
    }
  }

  async addToPaths (url = '', path = '', info = {}, stored = false) {
    return await this._run(
      'INSERT OR REPLACE INTO paths (url, path, info, stored) VALUES (?,?,?,?)',
      [url, path, JSON.stringify(info), stored])
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

  async moveCachedFile (pathFrom = '', pathTo = '', stored = true) {
    let row = await this._get('SELECT * FROM paths WHERE path = ?', [pathFrom])
    if (typeof row === 'undefined') return false
    try {
      fs.renameSync(path.resolve(basePath, pathFrom), path.resolve(basePath, pathTo))
      await this._run('UPDATE paths SET path = ?, stored = ? WHERE path = ?', [pathTo, stored, pathFrom])
      row = await this.getFromPathsByUrl(row.url)
    } catch (e) {
      return false
    }
    return row
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
}

const storage = new Storage()
export default storage

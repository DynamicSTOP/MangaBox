import sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'

const sqlite = sqlite3.verbose()
const basePath = process.env.NODE_ENV === 'production' ? path.resolve('./') : path.resolve(__dirname, '..', '..')

class Storage {
  constructor () {
    const dbPath = path.resolve(basePath, 'storage.sqlite')
    this.db = null
    const initDB = !fs.existsSync(dbPath)
    this.db = new sqlite.Database(dbPath)
    if (initDB) {
      this._initDB()
    }
    if (!fs.existsSync(path.resolve(basePath, 'cache'))) {
      fs.mkdirSync(path.resolve(basePath, 'cache'))
      fs.writeFileSync(path.resolve(basePath, 'cache', '.gitignore'), '*', 'utf8')
    }
    if (!fs.existsSync(path.resolve(basePath, 'manga'))) {
      fs.mkdirSync(path.resolve(basePath, 'manga'))
      fs.writeFileSync(path.resolve(basePath, 'manga', '.gitignore'), '*.*', 'utf8')
    }
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
        ' title VARCHAR(255),' +
        ' last_check DATETIME,' +
        ' last_en DATETIME,' +
        ' last_ru DATETIME,' +
        ' last DATETIME,' +
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
      row.json = JSON.parse(row.json)
    } catch (e) {
      return false
    }
    return row
  }

  /**
   *
   * @param manga
   * @returns {Promise<Object|false>}
   */
  async addManga (manga = {}) {
    const row = await this.getManga(manga)
    if (row) return row

    const allowedKeys = ['manga_site_id', 'site_id', 'url', 'json', 'last', 'last_en', 'last_ru', 'last_check']
    const values = []
    const params = []
    Object.keys(manga)
      .filter((k) => allowedKeys.indexOf(k) !== -1)
      .map((k) => {
        values.push(k)
        params.push(k === 'json' ? JSON.stringify(manga[k]) : manga[k])
      })

    await this._run('INSERT INTO manga (' + values.join(',') + ') VALUES (' + Array(values.length).fill('?').join(',') + ')', params)
    return await this.getManga(manga)
  }
}

const storage = new Storage()
export default storage

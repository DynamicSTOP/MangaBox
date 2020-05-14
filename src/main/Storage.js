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
      await this._run('CREATE TABLE paths (url VARCHAR(255) PRIMARY KEY, path VARCHAR(255), info TEXT, stored BOOLEAN)')
      await this._run('CREATE INDEX paths_path_index ON paths (stored, path)')

      // manga data
      await this._run(
        'CREATE TABLE manga ' +
        '(' +
        ' id UNSIGNED BIG INT PRIMARY KEY,' +
        ' manga_site_id UNSIGNED BIG INT,' +
        ' url VARCHAR(255),' +
        ' title VARCHAR(255),' +
        ' lastCheck DATETIME,' +
        ' lastEn DATETIME,' +
        ' lastRu DATETIME,' +
        ' last DATETIME,' +
        ' json TEXT' +
        ')')
      await this._run('CREATE INDEX manga_last_index ON manga (lastEn DESC, lastRu DESC, last DESC)')

      // chapters
      await this._run(
        'CREATE TABLE chapters ' +
        '(' +
        ' id UNSIGNED BIG INT PRIMARY KEY,' +
        ' manga_id  UNSIGNED BIG INT,' +
        ' json TEXT,' +
        ' FOREIGN KEY(manga_id) REFERENCES manga(id)' +
        ')')
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
    const row = await this._get('SELECT url, path, info, stored FROM paths WHERE url = ? ', url)
    if (typeof row === 'undefined') return false
    try {
      row.info = JSON.parse(row.info)
    } catch (e) {
      return false
    }
    return row
  }
}

const storage = new Storage()
export default storage

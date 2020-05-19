'use strict'
const chalk = require('chalk')
const electron = require('electron')
const path = require('path')
const fs = require('fs')
const express = require('express')
const { spawn } = require('child_process')
const webpack = require('webpack')
const WebpackDevServer = require('webpack-dev-server')
const crypto = require('crypto')

const getSHA = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}

const mainConfig = require('./webpack.main.config')
const rendererConfig = require('./webpack.renderer.config')

let electronProcess = null
let manualRestart = false
let hotMiddleware

function logStats (proc, data) {
  let log = ''

  log += chalk.yellow.bold(`┏ ${proc} Process ${new Array((19 - proc.length) + 1).join('-')}`)
  log += '\n\n'
  let images = false
  if (typeof data === 'object') {
    data.toString({
      colors: true,
      chunks: false
    }).split(/\r?\n/).forEach(line => {

      /* this line suppress out of img assets... since there is too many of those */
      if (proc === 'Renderer' && JSON.stringify(line).match(/^"\s*\\u001b\[1m\\u001b\[32mimgs\/\d+(_d)?--ships\.png/)) {
        if (!images) {
          log += '  ' + line + '\n'
          log += '       ... suppressed rows check dev-runner.js ...\n'
          images = true
        }
        return
      }

      log += '  ' + line + '\n'
    })
  } else {
    log += `  ${data}\n`
  }

  log += '\n' + chalk.yellow.bold(`┗ ${new Array(28 + 1).join('-')}`) + '\n'

  console.log(log)
}

function electronLog (data, color) {
  let log = ''
  data = data.toString().split(/\r?\n/)
  data.forEach(line => {
    log += `  ${line}\n`
  })

  if (/[0-9A-z]+/.test(log)) {
    console.log(
      chalk[color].bold('┏ Electron -------------------') +
      '\n\n' +
      log +
      chalk[color].bold('┗ ----------------------------') +
      '\n'
    )
  }
}

function startMain () {
  return new Promise((resolve, reject) => {
    mainConfig.mode = 'development'
    const compiler = webpack(mainConfig)

    // compiler.hooks.watchRun.tapAsync('watch-run', (compilation, done) => {
    //   logStats('Background', chalk.white.bold('compiling...'))
    //   hotMiddleware.publish({ action: 'compiling' })
    //   done()
    // })

    compiler.watch({}, (err, stats) => {
      if (err) {
        console.log(err)
        return
      }

      logStats('Main', stats)

      if (electronProcess && electronProcess.kill) {
        manualRestart = true
        process.kill(electronProcess.pid)
        electronProcess = null
        startElectron()

        setTimeout(() => {
          manualRestart = false
        }, 5000)
      }

      resolve()
    })
  })
}

function startRenderer () {
  return new Promise((resolve, reject) => {
    // rendererConfig.entry.renderer = [path.join(__dirname, 'dev-client')].concat(rendererConfig.entry.renderer)
    rendererConfig.mode = 'development'

    const compiler = webpack(rendererConfig)

    compiler.hooks.done.tap('done', stats => {
      logStats('Renderer', stats)
    })

    const server = new WebpackDevServer(
      compiler,
      {
        contentBase: path.join(__dirname, '../', 'dist'),
        quiet: true,
        // hot: true,
        proxy: {
          // generally proxy can be used instead of express, but there are memory leaks there
          // and i can't be bothered to look where exactly
          '/loadLocal': 'http://localhost:9081'
        },
        onListening: function () {
          resolve()
        }
      }
    )

    server.listen(9080)
  })
}

function startElectron () {
  var args = [
    '--inspect=5858',
    path.join(__dirname, '../dist/main.js')
  ]

  // detect yarn or npm and process commandline args accordingly
  if (process.env.npm_execpath.endsWith('yarn.js')) {
    args = args.concat(process.argv.slice(3))
  } else if (process.env.npm_execpath.endsWith('npm-cli.js')) {
    args = args.concat(process.argv.slice(2))
  }

  electronProcess = spawn(electron, args)

  electronProcess.stdout.on('data', data => {
    electronLog(data, 'blue')
  })
  electronProcess.stderr.on('data', data => {
    electronLog(data, 'red')
  })

  electronProcess.on('close', () => {
    if (!manualRestart) process.exit()
  })
}

function init () {
  console.log('Starting in dev mode')

  Promise.all([startMain(), startRenderer()])
    .then(() => {
      startElectron()
    })
    .catch(err => {
      console.error(err)
    })
}

init()

const app = express()
app.get('/loadLocal/*', (req, res) => {
  const filePath = Buffer.from(req.url.replace('/loadLocal/', ''), 'base64').toString()
  if (filePath.match(/\.jpg$/)) {
    res.setHeader('content-type', 'image/jpeg')
  } else if (filePath.match(/\.png$/)) {
    res.setHeader('content-type', 'image/png')
  } else {
    res.status(404)
    res.write('not found')
    return
  }
  const body = fs.readFileSync(filePath, 'base64')
  const buf = Buffer.from(body, 'base64')
  res.setHeader('content-length', buf.length)
  res.setHeader('cache-control', 'max-age=3600')
  res.setHeader('etag', getSHA(buf))
  res.write(buf)
  res.end()
})

app.listen(9081, () => init())

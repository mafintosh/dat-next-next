#!/usr/bin/env node

process.title = 'dat-next-next'

var discovery = require('hyperdiscovery')
var storage = require('dat-storage')
var hyperdrive = require('hyperdrive')
var mirror = require('mirror-folder')
var minimist = require('minimist')
var pretty = require('prettier-bytes')
var speedometer = require('speedometer')
var diff = require('ansi-diff-stream')()
var path = require('path')

var downloadSpeed = speedometer()
var uploadSpeed = speedometer()

var argv = minimist(process.argv.slice(2), {
  default: {utp: true, watch: true},
  boolean: ['utp', 'watch', 'live']
})

var key = argv._[0]
var msg = 'Syncing dat ...'

diff.pipe(process.stdout)

if (key) download(new Buffer(key, 'hex'))
else upload()

function download (key) {

  var archive = hyperdrive(storage('.'), key, {latest: true})
  var modified = false

  archive.on('content', function () {
    archive.content.on('clear', function () {
      modified = true
    })

    archive.content.on('download', function (index, data) {
      modified = true
      downloadSpeed(data.length)
    })

    archive.content.on('upload', function (index, data) {
      uploadSpeed(data.length)
    })
  })

  archive.on('sync', function () {
    msg = 'Dat version is fully synced.'
    log()
    if (modified && !argv.live) process.exit()
    msg += ' Waiting for updates ...'
    log()
  })

  archive.on('update', function () {
    msg = 'Dat was updated, syncing ...'
  })

  archive.on('ready', function () {
    discovery(archive, {live: true, utp: !!argv.utp}).on('connection', onconnection)
    log()
    setInterval(log, 500)
  })

  function log () {
    if (argv.debug) return
    diff.write(
      msg + '\n' +
      'Key is: ' + archive.key.toString('hex') + '\n' +
      'Downloading at ' + pretty(downloadSpeed()) + '/s, Uploading at ' + pretty(uploadSpeed()) + ' (' + archive.metadata.peers.length + ' peers)'
    )
  }
}


function upload () {
  var archive = hyperdrive(storage('.'), {indexing: true, latest: true})

  archive.on('ready', function () {
    if (!archive.writable) {
      archive.close(download)
      return
    }

    archive.content.on('upload', function (index, data) {
      uploadSpeed(data.length)
    })

    console.log('Sharing', process.cwd())
    console.log('Key is: ' + archive.key.toString('hex'))

    var carusel = []

    discovery(archive, {live: true, utp: !!argv.utp}).on('connection', onconnection)

    var progress = mirror(process.cwd(), {name: '/', fs: archive}, {ignore: ignore, watch: argv.watch, dereference: true})

    progress.on('put', function (src, dst) {
      if (carusel.length === 8) carusel.pop()
      carusel.unshift('Adding: ' + dst.name)
    })

    progress.on('del', function (dst) {
      if (carusel.length === 8) carusel.pop()
      carusel.unshift('Removing: ' + dst.name)
    })

    log()
    setInterval(log, 500)

    function log () {
      if (argv.debug) return

      diff.write(
        (carusel.length ? '\n' : '') + carusel.join('\n') + (carusel.length ? '\n\n' : '') +
        'Uploading at ' + pretty(uploadSpeed()) + ' (' + archive.metadata.peers.length + ' peers)'
      )
    }
  })
}

function ignore (name, st) {
  if (st && st.isDirectory()) return true // ignore dirs
  if (name.indexOf('.DS_Store') > -1) return true
  if (name.indexOf('.dat') > -1) return true
  return false
}

function onconnection (c, info) {
  if (argv.debug) {
    console.log('New connection:', info)
    c.on('error', function (err) {
      console.log('Connection error:', err)
    })
    c.on('close', function () {
      console.log('Connection closed')
    })
  }
}

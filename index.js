#!/usr/bin/env node

process.title = 'dat-next-next'

var discovery = require('hyperdiscovery')
var storage = require('dat-storage')
var hyperdrive = require('hyperdrive')
var mirror = require('mirror-folder')
var minimist = require('minimist')
var pretty = require('prettier-bytes')
var speed = require('speedometer')()
var diff = require('ansi-diff-stream')()
var path = require('path')

var argv = minimist(process.argv.slice(2), {
  default: {utp: true, watch: true, seed: false},
  boolean: ['utp', 'watch', 'live']
})

var key = argv._[0]
var msg = 'Syncing dat ...'

if (key) download(new Buffer(key, 'hex'))
else upload()

function download (key) {
  diff.pipe(process.stdout)

  var archive = hyperdrive(storage('.'), key, {latest: true})
  var modified = false

  archive.on('content', function () {
    archive.content.on('clear', function () {
      modified = true
    })

    archive.content.on('download', function (index, data) {
      modified = true
      speed(data.length)
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
    discovery(archive, {live: true, utp: !!argv.utp})
    log()
    setInterval(log, 500)
  })

  function log () {
    diff.write(
      msg + '\n' +
      'Key is: ' + archive.key.toString('hex') + '\n' +
      'Downloading at ' + pretty(speed()) + '/s'
    )
  }
}


function upload () {
  var archive = hyperdrive(storage('.'), {indexing: true, latest: true})

  archive.on('ready', function () {
    console.log('Sharing', process.cwd())
    console.log('Key is: ' + archive.key.toString('hex'))

    discovery(archive, {live: true, utp: !!argv.utp})

    if (!!argv.seed) return

    var progress = mirror(process.cwd(), {name: '/', fs: archive}, {ignore: ignore, watch: argv.watch, dereference: true})

    progress.on('put', function (src, dst) {
      console.log('Adding file', dst.name)
    })

    progress.on('del', function (dst) {
      console.log('Removing file', dst.name)
    })
  })
}

function ignore (name, st) {
  if (st && st.isDirectory()) return true // ignore dirs
  if (name.indexOf('.DS_Store') > -1) return true
  if (name.indexOf('.dat') > -1) return true
  return false
}

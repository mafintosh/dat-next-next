#!/usr/bin/env node

process.title = 'dat-next-next'

var progress = require('progress-string')
var speedometer = require('speedometer')
var hypercore = require('hypercore')
var hyperdiscovery = require('hyperdiscovery')
var ansi = require('ansi-diff-stream')
var pretty = require('prettier-bytes')
var speed = require('speedometer')
var ram = require('random-access-memory')
var raf = require('random-access-file')
var pump = require('pump')
var fs = require('fs')
var net = require('net')
var minimist = require('minimist')
var path = require('path')

var argv = minimist(process.argv.slice(2), {alias: {sleep: 's', quiet: 'q'}})
var uploadSpeed = speedometer()
var downloadSpeed = speedometer()
var indexSpeed = speedometer()
var diff = ansi()

diff.pipe(process.stdout)

var src = argv._[0]
var dest = argv._[1]
var key = null
var downloaded = 0
var bar = null
var indexBar = null

var indexed = 0
var total = 0

if (dest) {
  key = src
  src = null
}

var feed = hypercore(storage, key, {indexing: !key, sparse: true, maxRequests: Number(argv['max-requests'] || 16)}) // sparse: true cause we manually manage .download

if (argv.stats) {
  localcast()
  console.log('Open https://hyperdrive.technology to view the stats')
}

feed.ready(function () {
  for (var i = 0; i < feed.length; i++) {
    if (feed.has(i)) downloaded++
  }

  if (src) {
    console.log('Share this command:\ndat-next-next ' + feed.key.toString('hex') + ' ' + JSON.stringify(src) + '\n')
    if (!feed.length) {
      total = fs.statSync(src).size
      indexBar = progress({width: 50, total: total, style: (a, b) => a + '>' + b })
      var rs = fs.createReadStream(src)
      rs.pipe(feed.createWriteStream())
      rs.on('data', function (data) {
        indexSpeed(data.length)
        indexed += data.length
      })
    }
  } else {
    feed.get(0, function () {
      if (feed.length === downloaded) { // WORKAROUND
        log()
        process.exit(0)
      }
      feed.download({linear: argv.linear}, function () {
        log()
        process.exit(0)
      })
    })
  }

  log()
  setInterval(log, 1000)
  hyperdiscovery(feed, {utp: argv.utp !== false})
})

feed.on('upload', function (index, data) {
  uploadSpeed(data.length)
})

feed.on('download', function (index, data) {
  downloaded++
  downloadSpeed(data.length)
})

function localcast () {
  var cast = require('localcast')('hypercore')

  feed.ready(list)
  cast.on('localcast', list)

  feed.on('download', function (index) {
    cast.emit('download', {index: index, length: feed.length})
  })

  feed.on('upload', function (index) {
    cast.emit('upload', {index: index, length: feed.length})
  })

  function list () {
    var list = []

    for (var i = 0; i < feed.length; i++) {
      list.push(feed.has(i) ? 1 : 0)
    }

    cast.emit('list', list)
  }
}

function log () {
  if (argv.quiet) return
  if (!feed.length && !indexBar) return diff.write('Connecting to swarm ...')
  if (!bar) bar = progress({width: 50, total: feed.length, style: (a, b) => a + '>' + b })

  if (src) {
    if (!indexBar) {
      diff.write(
        'Uploading ' + pretty(uploadSpeed()) + '/s'
      )
    } else {
      diff.write(
        '[' + indexBar(indexed) + ']\n\n' +
        (indexed < total ? ('Indexing ' + pretty(indexSpeed()) + '/s') : ('Uploading ' + pretty(uploadSpeed()) + '/s'))
      )
    }
  } else if (feed.length === downloaded) {
    diff.write(
      '\n[' + bar(downloaded) + ']\n\n' +
      'Download completed.'
    )
  } else {
    diff.write(
      '\n[' + bar(downloaded) + ']\n\n' +
      'Downloading ' + pretty(downloadSpeed()) + '/s, Uploading ' + pretty(uploadSpeed()) + '/s'
    )
  }
}

function storage (name) {
  if (name === 'data') return raf(src || dest)
  if (argv.sleep) return raf(path.join(argv.sleep, 'sleep', name))
  return ram()
}

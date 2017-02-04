#!/usr/bin/env node

process.title = 'dat-share'

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
var diff = ansi()

diff.pipe(process.stdout)

var src = argv._[0]
var dest = argv._[1]
var key = null
var downloaded = 0
var bar = null

if (dest) {
  key = src
  src = null
}

var feed = hypercore(key, {indexing: !key}, function (name) {
  if (name === 'data') return raf(src || dest)
  if (argv.sleep) return raf(path.join(argv.sleep, 'sleep', name))
  return ram()
})

feed.ready(function () {
  for (var i = 0; i < feed.blocks; i++) {
    if (feed.has(i)) downloaded++
  }

  if (src) {
    console.log('Share this command:\ndat-share ' + feed.key.toString('hex') + ' ' + JSON.stringify(src) + '\n')
    if (!feed.blocks) fs.createReadStream(src).pipe(feed.createWriteStream())
  } else {
    feed.get(0, function () {
      if (feed.blocks === downloaded) { // WORKAROUND
        log()
        process.exit(0)
      }
      feed.download(function () {
        log()
        process.exit(0)
      })
    })
  }

  log()
  setInterval(log, 1000)
  hyperdiscovery(feed)
})

feed.on('upload', function (index, data) {
  uploadSpeed(data.length)
})

feed.on('download', function (index, data) {
  downloaded++
  downloadSpeed(data.length)
})

function log () {
  if (argv.quiet) return
  if (!feed.blocks) return diff.write('Connecting to swarm ...')
  if (!bar) bar = progress({width: 50, total: feed.blocks, style: (a, b) => a + '>' + b })

  if (src) {
    diff.write('Uploading ' + pretty(uploadSpeed()) + '/s')
  } else if (feed.blocks === downloaded) {
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

#!/usr/bin/env node

process.title = 'dat-next-next'

var discovery = require('hyperdiscovery')
var hyperdrive = require('hyperdrive')
var mirror = require('mirror-folder')
var minimist = require('minimist')
var path = require('path')

var argv = minimist(process.argv.slice(2), {
  default: {utp: true, watch: true, seed: false},
  boolean: ['utp', 'watch']
})

var key = argv._[0]

if (key) download(new Buffer(key, 'hex'))
else upload()

function download (key) {
  var filter = argv._[1] || '/'
  var archive = hyperdrive('.dat', key, {sparse: true})

  if (filter[0] !== '/') filter = '/' + filter

  archive.on('ready', function () {
    console.log('Syncing to', process.cwd())
    console.log('Key is: ' + archive.key.toString('hex'))

    if (archive.metadata.length) {
      copy()
    } else {
      console.log('Waiting for update ...')
      archive.metadata.once('append', copy)
    }

    discovery(archive, {live: true, utp: !!argv.utp})

    function copy () {
      console.log('Dat contains ' + archive.metadata.length + ' changes')

      var length = archive.metadata.length
      var progress = mirror({name: filter, fs: archive}, path.join(process.cwd(), filter))
      var changed = false

      progress.on('put', function (src) {
        changed = true
        console.log('Downloading file', src.name)
      })

      progress.on('del', function (src) {
        changed = true
        console.log('Removing file', src.name)
      })

      progress.on('end', function () {
        if (!changed) {
          console.log('In sync, waiting for update ...')
          if (length !== archive.metadata.length) copy()
          else archive.metadata.once('append', copy)
          return
        }
        console.log('Done! Bye.')
        process.exit(0)
      })
    }
  })
}

function upload () {
  var archive = hyperdrive('.dat')

  archive.on('ready', function () {
    console.log('Sharing', process.cwd())
    console.log('Key is: ' + archive.key.toString('hex'))

    discovery(archive, {live: true, utp: !!argv.utp})

    if (!!argv.seed) return

    var progress = mirror(process.cwd(), {name: '/', fs: archive}, {ignore: ignore, live: argv.watch, dereference: true})

    progress.on('put', function (src) {
      console.log('Adding file', src.name)
    })

    progress.on('del', function (src) {
      console.log('Removing file', src.name)
    })
  })
}

function ignore (name, st) {
  if (st && st.isDirectory()) return true // ignore dirs
  if (name.indexOf('.DS_Store') > -1) return true
  if (name.indexOf('.dat') > -1) return true
  return false
}

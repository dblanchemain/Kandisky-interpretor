const fs   = require('fs');
const path = require('path');

// audio_server.py doit être hors du asar pour pouvoir être spawn()é en prod
const rootFiles     = ['audio_server.py'].filter(p => fs.existsSync(p));
const extraResource = ['resources/bin', ...rootFiles].filter(p => fs.existsSync(p));

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource,
    ignore: [
      /^\/\.git\//,
      /^\/node_modules\/.cache\//,
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'kandisky-interpretor',
        authors: 'D.Blanchemain',
        description: 'Kandisky Interpretor – lecteur de partitions OpenWork',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        name: 'Kandisky Interpretor',
        format: 'ULFO',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          depends: ['libportaudio2', 'libsndfile1', 'python3', 'python3-pip'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          requires: ['portaudio', 'libsndfile', 'python3', 'python3-pip'],
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};

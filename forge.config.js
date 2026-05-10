const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
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
        options: {},
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {},
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

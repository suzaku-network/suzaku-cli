// Creates symlinks in local node_modules so Turbopack (bounded root) can resolve
// workspace-level packages without traversing above packages/ui-tools/.
const fs = require('fs')
const path = require('path')

const pkg = require('../package.json')
const localModules = path.resolve(__dirname, '../node_modules')
const rootModules = path.resolve(__dirname, '../../../node_modules')

const allDeps = {
  ...pkg.dependencies,
  ...pkg.devDependencies,
}

for (const dep of Object.keys(allDeps)) {
  const localPath = path.join(localModules, dep)
  const rootPath = path.join(rootModules, dep)

  if (!fs.existsSync(localPath) && fs.existsSync(rootPath)) {
    const dir = path.dirname(localPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.symlinkSync(rootPath, localPath)
  }
}

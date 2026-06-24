import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// SOT-1135: recharts imports es-toolkit utilities via CJS deep subpaths such as
// `es-toolkit/compat/maxBy`. es-toolkit's exports map resolves `./compat/*` to the CommonJS
// `*.js` files (there is no `import` condition for that wildcard), so Vite/Rollup runs them
// through the commonjs transform. For functions that internally `require()` helpers (e.g.
// maxBy/minBy `require` identity + iteratee; last `require` toArray), that transform emits
// self-shadowing code (`var require_identity = require_identity();`) which throws at runtime:
//   TypeError: require_identity is not a function
// The dashboard's radar chart (the only Polar/Radar usage in the app) is the first thing to
// hit `maxBy`/`minBy`/`last`, so the whole `/` route blanked via the route error boundary.
//
// This plugin redirects every flat `es-toolkit/compat/<name>` deep import to a virtual module
// that re-exports `<name>` from the ESM barrel (`es-toolkit/compat`, which resolves to the
// `.mjs` build and is never run through the broken CJS transform) as a default export — so
// recharts' default imports keep working while the CJS transform is avoided entirely.
function esToolkitCompatEsm(): Plugin {
  const PREFIX = 'es-toolkit/compat/'
  const VIRTUAL = '\0es-toolkit-compat-esm:'
  return {
    name: 'es-toolkit-compat-esm',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith(PREFIX)) {
        const name = id.slice(PREFIX.length)
        // Only flat subpaths (e.g. `maxBy`), matching es-toolkit's `./compat/*` shim files.
        if (name && !name.includes('/')) return VIRTUAL + name
      }
      return null
    },
    load(id) {
      if (id.startsWith(VIRTUAL)) {
        const name = id.slice(VIRTUAL.length)
        return `import { ${name} } from 'es-toolkit/compat'\nexport default ${name}\n`
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [esToolkitCompatEsm(), react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})

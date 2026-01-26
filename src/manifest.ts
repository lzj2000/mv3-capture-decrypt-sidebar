import type { ManifestV3Export } from '@crxjs/vite-plugin'

// Extension display name.
const EXTENSION_NAME = 'MV3 Capture + Decrypt Sidebar'

// Extension version.
const EXTENSION_VERSION = '0.0.1'

// Action button title.
const ACTION_TITLE = 'Capture + Decrypt'

// Extension permissions list.
const EXTENSION_PERMISSIONS = ['debugger', 'activeTab', 'storage'] as const

// MV3 manifest definition for CRXJS.
export const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: EXTENSION_NAME,
  version: EXTENSION_VERSION,
  action: {
    default_title: ACTION_TITLE
  },
  devtools_page: 'devtools.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  permissions: [...EXTENSION_PERMISSIONS]
}

// DevTools panel title.
const panelTitle = 'Capture + Decrypt'

// DevTools panel page.
const panelPage = 'devtools-panel.html'

// No icon for now.
const panelIcon = ''

// Create the custom DevTools panel.
function createDevtoolsPanel() {
  chrome.devtools.panels.create(panelTitle, panelIcon, panelPage)
}

// Register the panel on load.
createDevtoolsPanel()

// Background. Cross-browser: makes the toolbar icon open the panel.
//  - Chrome/Edge: the side panel (chrome.sidePanel) opens on the action click.
//  - Firefox: there's no sidePanel API; the sidebar (sidebar_action) is toggled instead.
const ext = globalThis.browser || globalThis.chrome;

// Chrome/Edge: open the side panel when the toolbar icon is clicked.
if (ext.sidePanel && ext.sidePanel.setPanelBehavior) {
  const enable = () => ext.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  ext.runtime.onInstalled.addListener(enable);
  ext.runtime.onStartup.addListener(enable);
  enable();
  // Belt and braces: if setPanelBehavior failed (policy, transient error), the icon
  // would otherwise be a dead button — open the panel explicitly on click too.
  if (ext.action && ext.action.onClicked && ext.sidePanel.open) {
    ext.action.onClicked.addListener((tab) => {
      ext.sidePanel.open({ tabId: tab.id }).catch(() => {});
    });
  }
}

// Firefox: toggle the sidebar when the toolbar icon is clicked (action.onClicked only
// fires when there's no popup / side-panel handler, which is the Firefox case).
if (ext.sidebarAction && ext.action && ext.action.onClicked) {
  ext.action.onClicked.addListener(() => ext.sidebarAction.toggle());
}

/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetter(this, "ExtensionParent",
                              "resource://gre/modules/ExtensionParent.jsm");

let {
  TabManager,
  TabContext,
  WindowListManager,
  makeWidgetId
} = ExtensionParent.apiManager.global;

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

// WeakMap[Extension -> WebPanel]
let panelMap = new WeakMap();

// Responsible for the panels section of the manifest as well
// as the associated panel.
function WebPanel(options, extension) {
  this.extension = extension;

  let widgetId = makeWidgetId(extension.id);
  this.id = `${widgetId}-webext-panel`;

  this.tabManager = TabManager.for(extension);

  this.defaults = {
    enabled: true,
    title: options.default_title || extension.name,
    location: options.default_location || "after_browser",
    panel: options.default_panel || "",
  };

  this.tabContext = new TabContext(tab => Object.create(this.defaults),
                                   extension);
}

WebPanel.prototype = {
  build() {
    this.tabContext.on("tab-select", // eslint-disable-line mozilla/balanced-listeners
                       (evt, tab) => { this.updateWindow(tab.ownerGlobal); });

    for (let window of WindowListManager.browserWindows()) {
      this.updateWindow(window);
    }
  },

  createPanel(window, details) {
    let {document} = window;
    if (!details || !details.panel) {
      details = this.defaults;
    }

    let box = document.createElementNS(XUL_NS, "box");
    box.setAttribute("id", this.id);
    box.setAttribute("collapsed", details.collapsed);
    box.setAttribute("label", details.title);
    box.setAttribute("pack", "end");
    box.setAttribute("customizable", "false");
    box.setAttribute("style", "padding: 2px; min-width: 40px; min-height: 40px;");
    box.setAttribute("mode", "icons");
    box.setAttribute("iconsize", "small");

    let browser = document.createElementNS(XUL_NS, "browser");
    browser.setAttribute("id", "inner-" + this.id);
    browser.setAttribute("style", "-moz-appearance: none; overflow: hidden; background: transparent; padding: 4px;");
    browser.setAttribute("type", "content");
    browser.setAttribute("transparent", "true");
    browser.setAttribute("webextension-view-type", "panel");
    browser.setAttribute("context", "contentAreaContextMenu");
    browser.setAttribute("tooltip", "aHTMLTooltip");
    browser.setAttribute("flex", "1");
    box.appendChild(browser);

    this.placePanel(this.defaults.location, box);

    return box;
  },

  placePanel(location, box) {
    let document = box.ownerDocument;

    let placement = {
      "before_browser": (ele) => {
        let splitter = document.getElementById("sidebar-splitter");
        splitter.hidden = false;
        let a = document.getElementById("browser-border-start");
        a.parentNode.insertBefore(ele, a.nextSibling);
      },
      "after_browser": (ele) => {
        let a = document.getElementById("browser-border-end");
        let splitter = document.getElementById("sidebar-splitter-end");
        if (!splitter) {
          splitter = document.createElementNS(XUL_NS, "splitter");
          splitter.setAttribute("id", "sidebar-splitter-end");
          splitter.setAttribute("class", "chromeclass-extrachrome sidebar-splitter");
          a.parentNode.insertBefore(splitter, a);
        }
        a.parentNode.insertBefore(ele, a);
      },
      "above_browser": (ele) => {
        let a = document.getElementById("navigator-toolbox");
        let splitter = document.getElementById("sidebar-splitter-above");
        if (!splitter) {
          splitter = document.createElementNS(XUL_NS, "splitter");
          splitter.setAttribute("id", "sidebar-splitter-above");
          splitter.setAttribute("class", "chromeclass-extrachrome sidebar-splitter");
          a.parentNode.insertBefore(splitter, a.nextSibling);
        }
        a.parentNode.insertBefore(ele, splitter);
      },
      "below_browser": (ele) => {
        let a = document.getElementById("browser-panel");
        let splitter = document.getElementById("sidebar-splitter-below");
        if (!splitter) {
          splitter = document.createElementNS(XUL_NS, "splitter");
          splitter.setAttribute("id", "sidebar-splitter-below");
          splitter.setAttribute("class", "chromeclass-extrachrome sidebar-splitter");
          a.appendChild(splitter);
        }
        a.appendChild(ele);
      },
    }
    placement[location](box);
  },

  // Update the panel |node| with the tab context data
  // in |tabData|.
  updatePanel(window, tabData) {
    let {document} = window;
    let title = tabData.title || this.extension.name;
    let box = document.getElementById(this.id);
    if (!box) {
      box = this.createPanel(window, tabData);
    }
    // handle any updates we may need
    let label = box.firstChild;
    label.setAttribute("value", title);
    let browser = document.getElementById("inner-" + this.id);
    browser.setAttribute("src", this.extension.baseURI.resolve(tabData.panel || this.defaults.panel));
    this.placePanel(tabData.location || this.defaults.location, box);
  
    browser.messageManager.loadFrameScript("chrome://browser/content/content.js", true);
    ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
  },

  // Update the panel for a given window.
  updateWindow(window) {
    let tab = window.gBrowser.selectedTab;
    this.updatePanel(window, this.tabContext.get(tab));
  },

  // Update the panel when the extension changes the icon,
  // title, badge, etc. If it only changes a parameter for a single
  // tab, |tab| will be that tab. Otherwise it will be null.
  updateOnChange(tab) {
    if (tab) {
      if (tab.selected) {
        this.updateWindow(tab.ownerGlobal);
      }
    } else {
      for (let window of WindowListManager.browserWindows()) {
        this.updateWindow(window);
      }
    }
  },

  // tab is allowed to be null.
  // prop should be one of "icon", "title", or "panel".
  setProperty(tab, prop, value) {
    if (tab == null) {
      this.defaults[prop] = value;
    } else if (value != null) {
      this.tabContext.get(tab)[prop] = value;
    } else {
      delete this.tabContext.get(tab)[prop];
    }

    this.updateOnChange(tab);
  },

  // tab is allowed to be null.
  // prop should be one of "icon", "title", or "panel".
  getProperty(tab, prop) {
    if (tab == null) {
      return this.defaults[prop];
    }
    return this.tabContext.get(tab)[prop];
  },

  shutdown() {
    this.tabContext.shutdown();
    for (let window of WindowListManager.browserWindows()) {
      let {document} = window;
      document.getElementById(this.id).remove();
    }
  },
};

WebPanel.for = (extension) => {
  return panelMap.get(extension);
};

ExtensionParent.apiManager.on("manifest_panel", (type, directive, extension, manifest) => {
  let webPanel = new WebPanel(manifest.panel, extension);
  webPanel.build();
  panelMap.set(extension, webPanel);
});

ExtensionParent.apiManager.on("shutdown", (type, extension) => {
  if (panelMap.has(extension)) {
    // Don't remove everything on app shutdown so session restore can handle
    // restoring UI.
    // XXX shutdownReason has not landed yet
    if (extension.shutdownReason != "APP_SHUTDOWN") {
      panelMap.get(extension).shutdown();
    }
    panelMap.delete(extension);
  }
});

class API extends ExtensionAPI {
  getAPI(context) {
    let {extension} = context;
    return {
      panels: {
        setPanel(details) {
          let tab = details.tabId !== null ? TabManager.getTab(details.tabId, context) : null;
          let url = details.panel && context.uri.resolve(details.panel);
          let panel = panelMap.get(extension);
          panel.setProperty(tab, "panel", url);
          if (details.location) {
            panel.setProperty(tab, "location", details.location);
          }
        },
        getPanel(details) {
          let tab = details.tabId !== null ? TabManager.getTab(details.tabId, context) : null;

          let panel = panelMap.get(extension).getProperty(tab, "panel");
          return Promise.resolve(panel);
        },
      },
    };
  }
}

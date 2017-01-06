document.getElementById("after_browser").addEventListener("click", () => {
  browser.panels.setPanel({panel: "index.html", location: "after_browser"});
});
document.getElementById("before_browser").addEventListener("click", () => {
  browser.panels.setPanel({panel: "index.html", location: "before_browser"});
});
document.getElementById("above_browser").addEventListener("click", () => {
  browser.panels.setPanel({panel: "index.html", location: "above_browser"});
});
document.getElementById("below_browser").addEventListener("click", () => {
  browser.panels.setPanel({panel: "index.html", location: "below_browser"});
});

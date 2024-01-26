const $ = (querry) => document.getElementById(querry);
const $$ = (querry) => document.querySelector(querry);

const isURL = (text) => /^((https?:\/\/|www)[^\s]+)/g.test(text.toLowerCase());

window.isDownloadSupported =
  typeof document.createElement("a").download !== "undefined";
// window.isProductionEnvironment = !window.location.host.startsWith("localhost");

// set dispaly name
Events.on("display-name", (e) => {
  const me = e.detail.message;
  const $displayName = $("#display-name");
  $displayName.textContent = "You are " + me.displayName;
  $displayName.title = me.deviceName;
});

class PeersUI {
  constructor() {
    Events.on("peer-joined", (e) => this._onPeerJoined(e.detail));
    Events.on("peer-left", (e) => this._onPeerLeft(e.detail));
    Events.on("peers", (e) => this._onPeers(e.detail));
    Events.on("file-progress", (e) => this._onFileProgress(e.detail));
    Events.on("paste", (e) => this._onPaste(e));
  }

  _onPeerJoined(peer) {
    if ($(peer.id)) return; // peer already exists
    const peerUI = new PeerUI(peer);
    console.log("Peer Joined");
    $$("x-peers").appendChild(peerUI.$el);
    setTimeout((e) => window.animateBackground(false), 1750); // Stop animation
  }

  _onPeers(peers) {
    this._clearPeers();
    peers.forEach((peer) => this._onPeerJoined(peer));
  }

  _onPeerLeft(peerId) {
    const $peer = $(peerId);
    if (!$peer) {
      return;
    }
    $peer.remove();
  }

  _onFileProgress(progress) {
    const peerId = progress.sender || progress.recipient;
    const $peer = $(peerId);
    if (!$peer) {
      return;
    }
    $peer.ui.setProgress(progress.progress);
  }

  _clearPeers() {
    const $peers = ($$("x-peers").innerHTML = "");
  }

  _onPaste(e) {
    const files =
      e.clipboardData.files ||
      e.clipboardData.items
        .filter((i) => i.type.indexOf("image") > -1)
        .map((i) => i.getAsFile());
    const peers = document.querySelectorAll("x-peer");
    if (files.length > 0 && peers.length > 0) {
      Events.fire("file-selected", { files: files, to: $$("x-peers").id });
    }
  }
}

class PeerUI {
  html() {
    return `
    <label class = "column center" title = "Click to send files">
      <input type = "file" multiple>
      <x-icon shadow = "1">
        <svg class = "icon><use xlink:href = "#"/></svg>
      </x-icon>
      <div class = "progress">
        <div class = "circle"></div>
        <div class = "circle right"></div>
      </div>
      <div class = "name font-subheading"></div>
      <div class = "device-name font-body2"></div>
      <div class = "status font-body2"></div>
    </label>`;
  }

  constructor(peer) {
    this._peer = peer;
    this._initDom();
    this._bindListeners(this.$el);
  }

  _initDom() {
    const el = document.createElement("x-peer");
    el.id = this._peer.id;
    el.innerHTML = this.html();
    el.ui = this;
    el.querySelector("svg use").setAttribute("xlink:href", this._icon());
    el.querySelector(".name").textContent = this._displayName();
    el.querySelector(".device-name").textContent = this._deviceName();
    this.$el = el;
    this.$progress = el.querySelector(".progress");
  }

  _bindListeners(el) {
    el.querySelector("input").addEventListener("change", (e) =>
      this._onFileSelected(e)
    );
    // can remove some
    el.addEventListener("drop", (e) => this._onDrop(e));
    el.addEventListener("dragend", (e) => this._onDragEnd(e));
    el.addEventListener("dragleave", (e) => this._onDragLeave(e));
    el.addEventListener("dragover", (e) => this._onDragOver(e));
    el.addEventListener("contextmenu", (e) => this._onRightClick(e));
    el.addEventListener("touchstart", (e) => this._onTouchStart(e));
    el.addEventListener("touchend", (e) => this._onTouchEnd(e));
    // Prevent default to allow drop
    Event.on("dragover", (e) => e.preventDefault());
    Event.on("drop", (e) => e.preventDefault());
  }

  // can directly use some inside the _initDom instead od creating new functions
  _displayName() {
    return this._peer.name.displayName;
  }

  _deviceName() {
    return this._peer.name.deviceName;
  }

  // likely to change icon to animals
  _icon() {
    const device = this._peer.name.device || this._peer.name;
    if (device.type === "movile") {
      return "#phone-iphone";
    }
    if (device.type === "tablet") {
      return "#tablet-mac";
    }
    return "#desktop-mac";
  }

  _onFileSelected(e) {
    const $input = e.target;
    const files = $input.files;
    Events.fire("file-selected", { files: files, to: this._peer.id });

    // reset input
    $input.value = null;
  }

  setProgress(progress) {
    if (progress > 0) {
      this.$el.setAttribute("transfer", "1");
    }
    if (progress > 0.5) {
      this.$progress.classList.add("over50");
    } else {
      this.$progress.classList.remove("over50");
    }
    // for circle animation of file transfer
    const degrees = `rotate(${progress * 360}deg)`;
    this.$progress.style.setProperty("--progress", degrees);
    if (progress >= 1) {
      this.setProgress(0);
      this.$el.removeAttribute("transfer");
    }
  }

  _onDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    Events.fire("file-selected", { files: files, to: this._peer.id });
    this._onDragEnd();
  }

  _onDragOver() {
    this.$el.setAttribute("drop", "1");
  }

  _onDragEnd() {
    this.$el.removeAttribute("drop");
  }

  // on right click, trigers text message
  _onRightClick(e) {
    e.preventDefault();
    Events.fire("text-recipient", this._peer.id);
  }

  _onTouchStart(e) {
    this._touchStart = Date.now();
    this._touchTimer = setTimeout((_) => this._onTouchEnd(), 610);
  }

  // Detects long tap, if yes, then it will triger text message
  _onTouchEnd(e) {
    if (Date.now() - this._touchStart < 500) {
      clearTimeout(this._touchTimer);
    } else {
      if (e) {
        e.preventDefault();
      }
      Events.fire("text-recipient", this._peer.id);
    }
  }
}

class Dialog {
  constructor(id) {
    this.$el = $(id);
    this.$el
      .querySelectorAll("[close]")
      .forEach((el) => el.addEventListener("click", (e) => this.hide()));
    this.$sutoFocus = this.$el.querySelector("[autofocus]");
  }

  show() {
    this.$el.setAttribute("show", "1");
    if (this.$sutoFocus) {
      this.$sutoFocus.focus();
    }
  }

  hide() {
    this.$el.removeAttribute("show");
    document.activeElement.blur();
    window.blur();
  }
}

class ReceiveDialog extends Dialog {
  constructor() {
    super("receiveDialog");
    Events.on("file-received", (e) => {
      this._nextFile(e.detail);
      window.blop.play();
    });
    this._fileQueue = [];
  }

  _nextFile(nextFile) {
    if (nextFile) {
      this._filesQueue.push(nextFile);
    }
    if (this._busy) {
      return;
    }
    this._busy = true;
    const file = this._filesQueue.shift();
    this._displayFile(file);
  }

  _dequeueFile() {
    if (!this._filesQueue.length) {
      // nothing to do
      this._busy = false;
      return;
    }
    setTimeout((_) => {
      this._busy = false;
      this._nextFile();
    }, 300);
  }

  _displayFile(file) {
    const $a = this.$el.querySelector("#download");
    const url = URL.createObjectURL(file.blob);
    $a.href = url;
    $a.download = file.name;

    if (this._autoDownload()) {
      $a.click();
      return;
    }
    if (file.mime.split("/")[0] === "image") {
      console.log("the file is an image");
      this.$el.querySelector(".preview").style.visibility = "inherit";
      this.$el.querySelector("#img-preview").src = url;
    }

    this.$el.querySelector("#fileName").textContent = file.name;
    this.$el.querySelector("#fileSize").textContent = this._formatFileSize(
      file.size
    );
    this.show();

    if (window.isDownloadSupported) {
      $a.target = "_blank";
      const reader = new FileReader();
      reader.onload = (e) => ($a.href = reader.result);
      reader.readAsDataURL(file.blob);
    }
  }

  _formatFileSize(bytes) {
    if (bytes >= 1e9) {
      return Math.round(bytes / 1e8) / 10 + "GB";
    } else if (bytes >= 1e6) {
      return Math.round(bytes / 1e5) / 10 + "MB";
    } else if (bytes >= 1000) {
      return Math.round(bytes / 1000) + "KB";
    } else {
      return bytes + "B";
    }
  }

  hide() {
    this.$el.querySelector(".preview").style.visibility = "hidden";
    this.$el.querySelector("#img-preview").src = "";
    super.hide();
    this._dequeueFile();
  }

  _autoDownload() {
    return !this.$el.querySelector("#autoDownload").checked;
  }
}

class SendTextDialog extends Dialog {
  constructor() {
    super("sendTextDialog");
    Events.on("text-recipient", (e) => this._onRecipient(e.detail));
    this.$text = this.$el.querySelector("#textInput");
    const button = this.$el.querySelector("form");
    button.addEventListener("submit", (e) => this._send(e));
  }

  _onRecipient(recipient) {
    this._recipient = recipient;
    this._handleShareTargetText();
    this.show();

    const range = document.createRange();
    const sel = window.getSelection();

    range = selectNodeContents(this.$text);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _handleShareTargetText() {
    if (!window.shareTargetText) {
      return;
    }
    this.$text.textContent = window.shareTargetText;
    window.shareTargetText = "";
  }

  _send(e) {
    e.preventDefault();
    Events.fire("send-text", {
      to: this._recipient,
      text: this.$text.innerText,
    });
  }
}

class ReceiveTextDialog extends Dialog {
  constructor() {
    super("receiveTextDialog");
    Events.on("text-received", (e) => this._onText(e.detail));
    this.$text = this.$el.querySelector("#text");
    const $copy = this.$el.querySelector("#copy");
    $copy.addEventListener("click", (_) => this._onCopy());
  }

  _onText(e) {
    this.$text.innerHTML = "";
    const text = e.text;
    if (isURL(text)) {
      const $a = document.createElement("a");
      $a.href = text;
      $a.target = "_blank";
      $a.textContent = text;
      this.$text.appendChild($a);
    } else {
      this.$text.textContent = text;
    }
    this.show();
    window.blop.play();
  }

  async _onCopy() {
    await navigator.clipboard.writeText(this.$text.textContent);
    Events.fire("notify-user", "Text copied to clipboard");
  }
}

class Toast extends Dialog {
  constructor() {
    super("toast");
    Events.on("notify-user", (e) => this._onNotify(e.detail));
  }

  _onNotify(message) {
    this.$el.textContent = message;
    this.show();
    setTimeout((_) => this.hide(), 3000);
  }
}

// Notifications left

// class sendDialog is not there........ lets see

// can remove NetworkStatusUi... not required for now
class NetworkStatusUI {
  constructor() {
    window.addEventListener(
      "offline",
      (e) => this._showOfflineMessage(),
      false
    );
    window.addEventListener("online", (e) => this._showOnlineMessage(), false);
    if (!navigator.onLine) {
      this._showOfflineMessage();
    }
  }

  _showOfflineMessage() {
    Events.fire("notify-user", "You are offline");
  }

  _showOnlineMessage() {
    Events.fire("notify-user", "You are back online");
  }
}

class WebShareTargetUI {
  constructor() {
    const parsedUrl = new URL(window.location);
    const title = parsedUrl.searchParams.get("title");
    const text = parsedUrl.searchParams.get("text");
    const url = parsedUrl.searchParams.get("url");

    let shareTargetText = title ? title : "";
    shareTargetText += text ? (shareTargetText ? " " + text : text) : "";

    if (url) {
      shareTargetText = url;
    }

    if (!shareTargetText) {
      return;
    }

    window.shareTargetText = shareTargetText;
    history.pushState({}, "URL Rewrite", "/");
    console.log("Shared Target Text:", '"' + shareTargetText + '"');
  }
}

class ShareWith {
  constructor() {
    const server = new ServerConnection();
    const peer = new PeerManager(server);
    const peersUI = new PeersUI();
    Events.on("load", (e) => {
      const receiveDialog = new ReceiveDialog();
      const sendTextDialog = new SendTextDialog();
      const receiveTextDialog = new ReceiveTextDialog();
      const toast = new Toast();
      const networkStatusUI = new NetworkStatusUI();
      const webShareTargetUI = new WebShareTargetUI();
    });
  }
}

const shareWith = new ShareWith();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then((serviceWorker) => {
      console.log("Service Worker registered");
      window.serviceWorker = serviceWorker;
    });
}

window.addEventListener("beforeinstallprompt", (e) => {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    // don't display install banner when installed
    return e.preventDefault();
  } else {
    const btn = document.querySelector("#install");
    btn.hidden = false;
    btn.onclick = (_) => e.prompt();
    return e.preventDefault();
  }
});

// Background Animation
Events.on("load", () => {
  let c = document.createElement("canvas");
  document.body.appendChild(c);
  let style = c.style;
  style.width = "100%";
  style.position = "absolute";
  style.zIndex = -1;
  style.top = 0;
  style.left = 0;
  let ctx = c.getContext("2d");
  let x0, y0, w, h, dw;

  function init() {
    w = window.innerWidth;
    h = window.innerHeight;
    c.width = w;
    c.height = h;
    let offset = h > 380 ? 100 : 65;
    offset = h > 800 ? 116 : offset;
    x0 = w / 2;
    y0 = h - offset;
    dw = Math.max(w, h, 1000) / 13;
    drawCircles();
  }
  window.onresize = init;

  function drawCircle(radius) {
    ctx.beginPath();
    let color = Math.round(255 * (1 - radius / Math.max(w, h)));
    ctx.strokeStyle = "rgba(" + color + "," + color + "," + color + ",0.1)";
    ctx.arc(x0, y0, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.lineWidth = 2;
  }

  let step = 0;

  function drawCircles() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      drawCircle(dw * i + (step % dw));
    }
    step += 1;
  }

  let loading = true;

  function animate() {
    if (loading || step % dw < dw - 5) {
      requestAnimationFrame(function () {
        drawCircles();
        animate();
      });
    }
  }
  window.animateBackground = function (l) {
    loading = l;
    animate();
  };
  init();
  animate();
});

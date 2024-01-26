var process = require("process");
// Handle SIGINT
process.on("SIGINT", () => {
  console.info("SIGINT Received, exiting...");
  process.exit(0);
});

// Handle SIGTERM
process.on("SIGTERM", () => {
  console.info("SIGTERM Received, exiting...");
  process.exit(0);
});

const WebSocket = require("ws");
const parser = require("ua-parser-js");
const {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} = require("unique-names-generator");

class ShareWithServer {
  constructor(port) {
    this._wss = new WebSocket.Server({ port: port });
    this._wss.on(
      "connection",
      (socket, request) => this._onConnection(new Peer(socket, request)),
      console.log("Peer connection requested.")
    );
    this._wss.on("headers", (headers, response) =>
      this._onHeaders(headers, response)
    );

    this._rooms = {};

    console.log("ShareWith server started on port", port);
  }
  //   Add peer to Room.
  _onConnection(peer) {
    this._joinRoom(peer);
    peer.socket.on("message", (message) => this._onMessage(peer, message));
    peer.socket.on("error", console.error);
    this._keepAlive(peer);

    // send displayName
    this._send(peer, {
      type: "display-name",
      message: {
        displayName: peer.name.displayName,
        deviceName: peer.name.deviceName,
      },
    });
  }

  _onHeaders(headers, response) {
    if (
      response.headers.cookie &&
      response.headers.cookie.indexOf("peerid=") > -1
    ) {
      return;
    }
    response.peerId = Peer.uuid();
    headers.push(
      "Set-Cookie: peerid=" + response.peerId + ";SameSite=Strict; Secure"
    );
  }

  _keepAlive(peer) {
    // cancel previous keepAlive
    this._cancelKeepAlive(peer);
    var timeout = 60000; // 1 minute
    if (!peer.lastBeat) {
      peer.lastBeat = Date.now();
      if (Date.now() - peer.lastBeat > timeout) {
        this._leaveRoom(peer);
        return;
      }
    }
    this._send(peer, { type: "ping" });
    peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
  }

  _cancelKeepAlive(peer) {
    if (peer && peer.timerId) {
      clearTimeout(peer.timerId);
    }
  }

  _onMessage(sender, message) {
    try {
      message = JSON.parse(message);
    } catch (e) {
      console.error(e);
      return;
    }
    switch (message.type) {
      case "disconnect":
        this._leaveRoom(sender);
        break;
      case "pong":
        sender.lastBeat = Date.now();
        break;
    }

    // relay message to recipient
    if (message.to && this._rooms[sender.ip]) {
      const recipientId = message.to;
      const recipient = this._rooms[sender.ip][recipientId];
      delete message.to;
      message.sender = sender.id;
      this._send(recipient, message);
      return;
    }
  }

  _send(peer, message) {
    if (!peer) {
      return;
    }
    if (this._wss.readyState !== this._wss.OPEN) {
      return;
    }
    message = JSON.stringify(message);
    peer.socket.send(message, (error) => "");
  }

  _joinRoom(peer) {
    // if room does not exist, create it
    if (!this._rooms[peer.ip]) {
      this._rooms[peer.ip] = {};
    }

    // notify all other peers
    for (const otherPeerId in this._rooms[peer.ip]) {
      const otherPeer = this._rooms[peer.ip][otherPeerId];
      this._send(otherPeer, { type: "peer-joined", peer: peer.getInfo() });
    }

    // notify peer about all other peers
    const otherPeers = [];
    for (const otherPeerId in this._rooms[peer.ip]) {
      const otherPeer = this._rooms[peer.ip][otherPeerId];
      otherPeers.push(otherPeer.getInfo());
    }

    this._send(peer, { type: "peers", peers: otherPeers });

    // add peer to room
    this._rooms[peer.ip][peer.id] = peer;
    console.log("Peer joined room");
  }

  _leaveRoom(peer) {
    if (!this._rooms[peer.ip] || !this._rooms[peer.ip][peer.id]) {
      return;
    }
    this._cancelKeepAlive(peer);

    // delete the peer
    delete this._rooms[peer.ip][peer.id];

    peer.socket.terminate();

    // if room is empty, delete it; else notify other peers
    if (!Object.keys(this._rooms[peer.ip]).length) {
      delete this._rooms[peer.ip];
    } else {
      for (const otherPeerId in this._rooms[peer.ip]) {
        const otherPeer = this._rooms[peer.ip][otherPeerId];
        this._send(otherPeer, { type: "peer-left", peerId: peer.id });
      }
    }
  }
}

class Peer {
  constructor(socket, request) {
    // set socket
    this.socket = socket;
    // set remote ip
    this._setIP(request);
    // set peer id
    this._setPeerId(request);
    // checking if WebRTC is supported or not
    this.rtcSupported = request.url.indexOf("webrtc") > -1;
    // set name
    this._setName(request);
    // for keep alive
    this.timerId = 0;
    this.lastBeat = Date.now();
  }

  _setIP(request) {
    if (request.headers["x-forwarded-for"]) {
      this.ip = request.headers["x-forwarded-for"].split(/\s*,\s*/)[0];
    } else {
      this.ip = request.connection.remoteAddress;
    }

    // for IPv4 and IPv6 localhost
    if (this.ip == "::1" || this.ip == "::ffff:127.0.0.1") {
      this.ip = "127.0.0.1";
    }
  }

  _setPeerId(request) {
    if (request.peerId) {
      this.id = request.peerId;
    } else {
      this.id = request.headers.cookie.replace("peerid=", "");
    }
  }

  toString() {
    return `<Peer id = ${this.id} ip = ${this.ip} rtcSupported = ${this.rtcSupported}>`;
  }

  _setName(req) {
    let ua = parser(req.headers["user-agent"]);
    let deviceName = "";
    if (ua.os && ua.os.name) {
      deviceName = ua.os.name.replace("Mac OS", "Mac") + " ";
    }
    if (ua.device.model) {
      deviceName += ua.device.model;
    } else {
      deviceName += ua.browser.name;
    }

    if (!deviceName) {
      deviceName = "Unknown Device";
    }

    const displayName = uniqueNamesGenerator({
      length: 2,
      separator: " ",
      dictionaries: [adjectives, animals],
      style: "capital",
      seed: this.id.hashCode(),
    });

    this.name = {
      model: ua.device.model,
      os: ua.os.name,
      browser: ua.browser.name,
      type: ua.device.type,
      deviceName,
      displayName,
    };
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      rtcSupported: this.rtcSupported,
    };
  }

  static uuid() {
    let uuid = "",
      ii;
    for (ii = 0; ii < 32; ii += 1) {
      switch (ii) {
        case 8:
        case 20:
          uuid += "-";
          uuid += ((Math.random() * 16) | 0).toString(16);
          break;
        case 12:
          uuid += "-";
          uuid += "4";
          break;
        case 16:
          uuid += "-";
          uuid += ((Math.random() * 4) | 8).toString(16);
          break;
        default:
          uuid += ((Math.random() * 16) | 0).toString(16);
      }
    }
    return uuid;
  }
}

Object.defineProperty(String.prototype, "hashCode", {
  value: function () {
    var hash = 0,
      i,
      chr;
    for (i = 0; i < this.length; i++) {
      chr = this.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // convert to 32-bit integer
    }
    return hash;
  },
});

const server = new ShareWithServer(process.env.PORT || 8080);

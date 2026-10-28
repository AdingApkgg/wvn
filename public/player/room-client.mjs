/** 房间连接基础 SDK。P2P 数据仅是临时交流，权威状态只来自服务器事件。 */
export class RoomClient extends EventTarget {
  constructor(options) {
    super();
    this.options = { reconnect: true, transportTimeoutMs: 3000, ...options };
    this.baseUrl = new URL(options.baseUrl ?? globalThis.location?.origin).origin;
    this.roomId = options.roomId;
    this.sequence = 0;
    this.transport = null;
    this.snapshot = null;
    this.userId = null;
    this.peers = new Map();
    this.pending = new Map();
    this.generation = 0;
    this.retry = 0;
    this.manualClose = false;
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async request(path, data) {
    const headers = new Headers(typeof this.options.headers === 'function' ? await this.options.headers() : this.options.headers);
    headers.set('content-type', 'application/json');
    const response = await fetch(this.baseUrl + '/api/rooms/' + encodeURIComponent(this.roomId) + path, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'include', headers,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error ?? 'room_request_failed'), { status: response.status });
    return result;
  }
  connect() {
    if (this.connecting) return this.connecting;
    this.manualClose = false;
    clearTimeout(this.retryTimer);
    this.connecting = this.connectAttempt().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async connectAttempt() {
    const info = await this.request('/ticket', {});
    if (info.webTransportUrl && typeof globalThis.WebTransport === 'function' && this.options.preferWebTransport !== false) {
      try { return await this.openTransport('webtransport', info); }
      catch (error) { this.resetTransport(); this.emit('fallback', { from: 'webtransport', to: 'websocket', reason: error.message }); }
    }
    // WT 可能已消耗票据，回退必须重新取得一次性票据。
    return this.openTransport('websocket', await this.request('/ticket', {}));
  }
  async openTransport(kind, info) {
    const generation = ++this.generation;
    this.transport = kind;
    let settle, reject;
    const ready = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
    // 打开QUIC流可能先耗时；立即接住拒绝，避免握手超时成为未处理异常。
    ready.catch(() => {});
    this.onReady = value => { clearTimeout(timer); this.retry = 0; settle(value); };
    const timer = setTimeout(() => reject(new Error('room_connect_timeout')), this.options.transportTimeoutMs);
    const fail = error => {
      if (generation !== this.generation) return;
      reject(error instanceof Error ? error : new Error('room_transport_closed'));
      this.disconnected(error);
    };
    try {
      if (kind === 'webtransport') {
        const wtOptions = this.options.serverCertificateHashes ? { serverCertificateHashes: this.options.serverCertificateHashes } : undefined;
        const wt = new globalThis.WebTransport(info.webTransportUrl, wtOptions);
        this.connection = wt;
        wt.closed.then(() => fail(new Error('room_transport_closed')), fail);
        await Promise.race([wt.ready, ready]);
        const stream = await Promise.race([wt.createBidirectionalStream(), ready]);
        this.writer = stream.writable.getWriter();
        this.datagramWriter = wt.datagrams.writable.getWriter();
        this.writeChain = Promise.resolve();
        this.write = value => {
          const bytes = new TextEncoder().encode(JSON.stringify(value) + '\n');
          this.writeChain = this.writeChain.then(() => this.writer.write(bytes));
          return this.writeChain;
        };
        void this.readStream(stream.readable, generation).catch(fail);
        void this.readDatagrams(wt.datagrams.readable, generation).catch(fail);
      } else {
        const url = new URL(info.websocketPath, this.baseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(url.href);
        this.connection = ws;
        ws.addEventListener('message', event => { if (generation === this.generation) this.receive(JSON.parse(event.data)); });
        ws.addEventListener('close', event => fail(Object.assign(new Error('room_transport_closed'), { code: event.code })));
        ws.addEventListener('error', () => fail(new Error('room_transport_failed')));
        await Promise.race([new Promise((resolve, failOpen) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', failOpen, { once: true });
        }), ready]);
        this.write = value => {
          if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 262144) return Promise.reject(new Error('room_backpressure'));
          ws.send(JSON.stringify(value)); return Promise.resolve();
        };
      }
      await this.write({ type: 'auth', ticket: info.ticket, after: this.sequence });
      return await ready;
    } catch (error) { clearTimeout(timer); throw error; }
  }
  async readStream(readable, generation) {
    const reader = readable.getReader(), decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || generation !== this.generation) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 262144) throw new Error('room_frame_too_large');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (line) this.receive(JSON.parse(line));
        }
      }
    } finally { reader.releaseLock(); }
  }
  async readDatagrams(readable, generation) {
    const reader = readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || generation !== this.generation) break;
        if (value.length <= 1200) this.emit('datagram', JSON.parse(new TextDecoder().decode(value)));
      }
    } finally { reader.releaseLock(); }
  }
  receive(frame) {
    if (frame.type === 'ready' || frame.type === 'sync') {
      this.userId = frame.userId ?? this.userId;
      this.snapshot = frame.snapshot ?? this.snapshot;
      for (const event of frame.events ?? []) this.event(event);
      this.sequence = Math.max(this.sequence, frame.cursor ?? 0);
      if (frame.type === 'ready') { this.onReady?.(frame); this.onReady = null; this.emit('connected', { transport: this.transport, ...frame }); }
      else this.emit('sync', frame);
    } else if (frame.type === 'event') this.event(frame.event);
    else if (frame.type === 'ack') {
      const pending = this.pending.get(frame.id);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(frame.id); pending.resolve(frame.event); }
    } else if (frame.type === 'error') {
      this.emit('error', frame); this.connection?.close();
    } else this.emit('message', frame);
  }
  event(event) {
    if (event.seq <= this.sequence) return;
    this.sequence = event.seq;
    if (event.kind === 'state' && this.snapshot && event.seq > this.snapshot.stateSeq) { this.snapshot.state = event.data; this.snapshot.stateSeq = event.seq; }
    if (['offer', 'answer', 'ice'].includes(event.kind) && event.target === this.userId) {
      this.signalChain = (this.signalChain ?? Promise.resolve()).then(() => this.signal(event)).catch(error => this.emit('error', { code: 'peer_signal_failed', message: error.message }));
    }
    if (event.kind === 'member.joined' && this.snapshot && !this.snapshot.members.some(m => m.userId === event.data.userId)) this.snapshot.members.push({ userId: event.data.userId, displayName: event.data.displayName ?? event.data.userId });
    if (event.kind === 'member.kicked' || event.kind === 'member.left') {
      this.closePeer(event.data.userId);
      if (this.snapshot) this.snapshot.members = this.snapshot.members.filter(m => m.userId !== event.data.userId);
    }
    if (event.kind === 'room.closed') for (const id of this.peers.keys()) this.closePeer(id);
    this.emit('event', event);
  }
  async send(kind, data, target, id = crypto.randomUUID()) {
    if (!this.write || this.pending.size >= 32) throw new Error('room_not_connected_or_busy');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('room_ack_timeout')); }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ type: 'event', event: { id, kind, data, ...(target ? { target } : {}) } }).catch(error => {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }
  publishState(data, id) { return this.send('state', data, undefined, id); }
  async pingDatagram() {
    if (this.transport !== 'webtransport' || !this.datagramWriter) throw new Error('webtransport_required');
    await this.datagramWriter.write(new TextEncoder().encode(JSON.stringify({ type: 'ping' })));
  }
  async peer(userId, relayOnly = false) {
    if (this.peers.has(userId)) return this.peers.get(userId);
    if (!this.snapshot?.members.some(m => m.userId === userId) || userId === this.userId) throw new Error('peer_not_a_member');
    const turn = await this.request('/turn', {});
    const pc = new RTCPeerConnection({ iceServers: [{ urls: turn.urls, username: turn.username, credential: turn.credential }], iceTransportPolicy: relayOnly ? 'relay' : 'all' });
    const peer = { pc, channel: null, candidates: [] };
    this.peers.set(userId, peer);
    pc.onicecandidate = event => { if (event.candidate) void this.send('ice', event.candidate.toJSON(), userId).catch(error => this.emit('error', { code: 'ice_send_failed', message: error.message })); };
    pc.ondatachannel = event => this.channel(userId, peer, event.channel);
    pc.onconnectionstatechange = () => this.emit('peerstate', { userId, state: pc.connectionState });
    return peer;
  }
  channel(userId, peer, channel) {
    peer.channel = channel;
    channel.onopen = () => this.emit('peeropen', { userId });
    channel.onmessage = event => {
      if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 4096) return;
      try { this.emit('peerdata', { userId, data: JSON.parse(event.data), authoritative: false }); } catch {}
    };
    channel.onclose = () => this.emit('peerclose', { userId });
  }
  async openPeer(userId, options = {}) {
    const peer = await this.peer(userId, options.relayOnly ?? false);
    if (!peer.channel) this.channel(userId, peer, peer.pc.createDataChannel('wvn.ephemeral.v1', { ordered: false, maxRetransmits: 0 }));
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await this.send('offer', peer.pc.localDescription.toJSON(), userId);
    return peer.pc;
  }
  async signal(event) {
    const peer = await this.peer(event.actor, this.options.relayOnly ?? false), pc = peer.pc;
    if (event.kind === 'ice') {
      if (!pc.remoteDescription) peer.candidates.push(event.data);
      else await pc.addIceCandidate(event.data);
      return;
    }
    if (event.kind === 'offer' && pc.signalingState !== 'stable') {
      if (this.userId < event.actor) return;
      await pc.setLocalDescription({ type: 'rollback' });
    }
    await pc.setRemoteDescription(event.data);
    for (const candidate of peer.candidates.splice(0)) await pc.addIceCandidate(candidate);
    if (event.kind === 'offer') {
      await pc.setLocalDescription(await pc.createAnswer());
      await this.send('answer', pc.localDescription.toJSON(), event.actor);
    }
  }
  sendPeer(userId, data) {
    const channel = this.peers.get(userId)?.channel, value = JSON.stringify(data);
    if (new TextEncoder().encode(value).length > 4096) throw new Error('peer_message_too_large');
    if (!channel || channel.readyState !== 'open' || channel.bufferedAmount > 65536) throw new Error('peer_not_ready');
    channel.send(value);
  }
  closePeer(id) { const peer = this.peers.get(id); peer?.channel?.close(); peer?.pc.close(); this.peers.delete(id); }
  disconnected(error) {
    this.emit('disconnected', { message: error?.message });
    if (this.manualClose || this.connecting || error?.code === 4003 || !this.options.reconnect) return;
    this.resetTransport();
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect().catch(next => this.disconnected(next)), Math.min(30000, 500 * 2 ** this.retry++));
  }
  resetTransport() {
    ++this.generation;
    this.write = null;
    this.connection?.close(); this.connection = null;
    this.writer?.releaseLock(); this.writer = null;
    this.datagramWriter?.releaseLock(); this.datagramWriter = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('room_disconnected')); }
    this.pending.clear();
  }
  close() {
    this.manualClose = true; clearTimeout(this.retryTimer); this.resetTransport();
    for (const id of this.peers.keys()) this.closePeer(id);
  }
}

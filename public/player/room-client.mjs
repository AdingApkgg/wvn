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
  activeAttempt(attempt) {
    return !!attempt && this.attempt === attempt && !attempt.controller.signal.aborted && !this.manualClose;
  }
  assertAttempt(attempt) {
    if (!this.activeAttempt(attempt)) throw attempt?.controller.signal.reason ?? new DOMException('Room connection cancelled', 'AbortError');
  }
  async request(path, data, { signal } = {}) {
    signal?.throwIfAborted();
    const suppliedHeaders = typeof this.options.headers === 'function' ? await this.options.headers() : this.options.headers;
    signal?.throwIfAborted();
    const headers = new Headers(suppliedHeaders);
    headers.set('content-type', 'application/json');
    const response = await fetch(this.baseUrl + '/api/rooms/' + encodeURIComponent(this.roomId) + path, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'include', headers, signal,
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    signal?.throwIfAborted();
    const result = await response.json();
    signal?.throwIfAborted();
    if (!response.ok) throw Object.assign(new Error(result.error ?? 'room_request_failed'), { status: response.status });
    return result;
  }
  connect() {
    if (this.connecting) return this.connecting;
    this.manualClose = false;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    if (this.attempt) { this.cancelAttempt(); this.resetTransport(); }
    const attempt = { controller: new AbortController() };
    this.attempt = attempt;
    const connecting = this.connectAttempt(attempt).catch(error => {
      // 旧尝试完成时，不得清理后来显式发起的新连接。
      if (this.activeAttempt(attempt)) {
        if (attempt.terminalError || this.terminalError(error)) this.stopAttempt(attempt, attempt.terminalError ?? error);
        else this.resetTransport();
      }
      throw error;
    }).finally(() => { if (this.connecting === connecting) this.connecting = null; });
    this.connecting = connecting;
    return connecting;
  }
  async connectAttempt(attempt) {
    const requestOptions = { signal: attempt.controller.signal };
    let info = await this.request('/ticket', {}, requestOptions);
    this.assertAttempt(attempt);
    if (info.webTransportUrl && typeof globalThis.WebTransport === 'function' && this.options.preferWebTransport !== false) {
      try {
        const ready = await this.openTransport('webtransport', info, attempt);
        this.assertAttempt(attempt);
        return ready;
      } catch (error) {
        this.assertAttempt(attempt);
        this.resetTransport();
        this.assertAttempt(attempt);
        this.emit('fallback', { from: 'webtransport', to: 'websocket', reason: error.message });
      }
      this.assertAttempt(attempt);
      // WT 可能已消耗票据，只有仍有效的尝试才能申请回退票据。
      info = await this.request('/ticket', {}, requestOptions);
      this.assertAttempt(attempt);
    }
    this.assertAttempt(attempt);
    const ready = await this.openTransport('websocket', info, attempt);
    this.assertAttempt(attempt);
    return ready;
  }
  async openTransport(kind, info, attempt) {
    this.assertAttempt(attempt);
    const generation = ++this.generation;
    const current = () => generation === this.generation && this.activeAttempt(attempt);
    this.transport = kind;
    let settle, reject;
    const ready = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
    ready.catch(() => {});
    const signal = attempt.controller.signal;
    const abort = () => reject(signal.reason ?? new DOMException('Room connection cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => reject(new Error('room_connect_timeout')), this.options.transportTimeoutMs);
    this.onReady = value => { if (current()) { clearTimeout(timer); this.retry = 0; settle(value); } };
    const fail = error => {
      if (!current()) return;
      reject(error instanceof Error ? error : new Error('room_transport_closed'));
      this.disconnected(error, attempt);
    };
    try {
      if (kind === 'webtransport') {
        const wtOptions = this.options.serverCertificateHashes ? { serverCertificateHashes: this.options.serverCertificateHashes } : undefined;
        this.assertAttempt(attempt);
        const wt = new globalThis.WebTransport(info.webTransportUrl, wtOptions);
        this.connection = wt;
        wt.closed.then(() => fail(new Error('room_transport_closed')), fail);
        await Promise.race([wt.ready, ready]);
        this.assertAttempt(attempt);
        const stream = await Promise.race([wt.createBidirectionalStream(), ready]);
        this.assertAttempt(attempt);
        this.writer = stream.writable.getWriter();
        this.datagramWriter = wt.datagrams.writable.getWriter();
        this.writeChain = Promise.resolve();
        this.write = value => {
          const bytes = new TextEncoder().encode(JSON.stringify(value) + '\n');
          this.writeChain = this.writeChain.then(() => {
            this.assertAttempt(attempt);
            if (!current()) throw new Error('room_disconnected');
            return this.writer.write(bytes);
          });
          return this.writeChain;
        };
        void this.readStream(stream.readable, generation, attempt).catch(fail);
        void this.readDatagrams(wt.datagrams.readable, generation, attempt).catch(fail);
      } else {
        const url = new URL(info.websocketPath, this.baseUrl);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        this.assertAttempt(attempt);
        const ws = new WebSocket(url.href);
        this.connection = ws;
        ws.addEventListener('message', event => { if (current()) this.receive(JSON.parse(event.data), attempt); });
        ws.addEventListener('close', event => fail(Object.assign(new Error('room_transport_closed'), { code: event.code })));
        ws.addEventListener('error', () => fail(new Error('room_transport_failed')));
        await Promise.race([new Promise((resolve, failOpen) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', failOpen, { once: true });
        }), ready]);
        this.assertAttempt(attempt);
        this.write = value => {
          this.assertAttempt(attempt);
          if (!current() || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 262144) return Promise.reject(new Error('room_backpressure'));
          ws.send(JSON.stringify(value)); return Promise.resolve();
        };
      }
      this.assertAttempt(attempt);
      await this.write({ type: 'auth', ticket: info.ticket, after: this.sequence });
      this.assertAttempt(attempt);
      const result = await ready;
      this.assertAttempt(attempt);
      return result;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  async readStream(readable, generation, attempt) {
    const reader = readable.getReader(), decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || generation !== this.generation || !this.activeAttempt(attempt)) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 262144) throw new Error('room_frame_too_large');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          if (generation !== this.generation || !this.activeAttempt(attempt)) return;
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (line) this.receive(JSON.parse(line), attempt);
        }
      }
    } finally { reader.releaseLock(); }
  }
  async readDatagrams(readable, generation, attempt) {
    const reader = readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || generation !== this.generation || !this.activeAttempt(attempt)) break;
        if (value.length <= 1200) this.emit('datagram', JSON.parse(new TextDecoder().decode(value)));
      }
    } finally { reader.releaseLock(); }
  }
  receive(frame, attempt) {
    if (!this.activeAttempt(attempt)) return;
    if (frame.type === 'ready' || frame.type === 'sync') {
      this.userId = frame.userId ?? this.userId;
      this.snapshot = frame.snapshot ?? this.snapshot;
      for (const event of frame.events ?? []) {
        if (!this.activeAttempt(attempt)) return;
        this.event(event);
      }
      if (!this.activeAttempt(attempt)) return;
      this.sequence = Math.max(this.sequence, frame.cursor ?? 0);
      if (frame.type === 'ready') { this.onReady?.(frame); this.onReady = null; if (this.activeAttempt(attempt)) this.emit('connected', { transport: this.transport, ...frame }); }
      else this.emit('sync', frame);
    } else if (frame.type === 'event') this.event(frame.event);
    else if (frame.type === 'ack') {
      const pending = this.pending.get(frame.id);
      if (pending) { clearTimeout(pending.timer); this.pending.delete(frame.id); pending.resolve(frame.event); }
    } else if (frame.type === 'error') {
      // WT 没有 WS 的4003关闭码，先记住应用层终止原因，避免关闭后误判为网络故障。
      if (frame.code !== 'rate_limited') attempt.terminalError = Object.assign(new Error(frame.code), { code: frame.code });
      this.emit('error', frame);
      if (this.activeAttempt(attempt)) {
        if (attempt.terminalError) this.disconnected(attempt.terminalError, attempt);
        else this.connection?.close();
      }
    } else this.emit('message', frame);
  }
  event(event) {
    if (event.seq <= this.sequence) return;
    this.sequence = event.seq;
    if (event.kind === 'state' && this.snapshot && event.seq > this.snapshot.stateSeq) { this.snapshot.state = event.data; this.snapshot.stateSeq = event.seq; }
    if (['offer', 'answer', 'ice'].includes(event.kind) && event.target === this.userId) {
      const attempt = this.attempt, generation = this.generation;
      this.signalChain = (this.signalChain ?? Promise.resolve()).then(() => {
        this.assertPeerContext(attempt, generation);
        return this.signal(event, attempt, generation);
      }).catch(error => {
        if (this.activeAttempt(attempt) && generation === this.generation) this.emit('error', { code: 'peer_signal_failed', message: error.message });
      });
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
  peerCurrent(attempt, generation, userId, peer) {
    return this.activeAttempt(attempt) && generation === this.generation && this.peers.get(userId) === peer;
  }
  assertPeerContext(attempt, generation, userId, peer) {
    this.assertAttempt(attempt);
    if (generation !== this.generation || (peer && this.peers.get(userId) !== peer)) throw new DOMException('Peer connection cancelled', 'AbortError');
  }
  async peer(userId, relayOnly = false, attempt = this.attempt, generation = this.generation) {
    this.assertPeerContext(attempt, generation);
    if (this.peers.has(userId)) return this.peers.get(userId);
    if (!this.snapshot?.members.some(m => m.userId === userId) || userId === this.userId) throw new Error('peer_not_a_member');
    const turn = await this.request('/turn', {}, { signal: attempt.controller.signal });
    this.assertPeerContext(attempt, generation);
    // 同成员的本地主动连接与入站offer可能同时取TURN；返回后复用先完成的peer。
    if (this.peers.has(userId)) return this.peers.get(userId);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: turn.urls, username: turn.username, credential: turn.credential }], iceTransportPolicy: relayOnly ? 'relay' : 'all' });
    const peer = { pc, channel: null, candidates: [], attempt, generation };
    this.peers.set(userId, peer);
    const current = () => this.peerCurrent(attempt, generation, userId, peer);
    pc.onicecandidate = event => {
      if (event.candidate && current()) void this.send('ice', event.candidate.toJSON(), userId).catch(error => {
        if (current()) this.emit('error', { code: 'ice_send_failed', message: error.message });
      });
    };
    pc.ondatachannel = event => { if (current()) this.channel(userId, peer, event.channel); else event.channel.close(); };
    pc.onconnectionstatechange = () => { if (current()) this.emit('peerstate', { userId, state: pc.connectionState }); };
    return peer;
  }
  channel(userId, peer, channel) {
    const current = () => this.peerCurrent(peer.attempt, peer.generation, userId, peer);
    peer.channel = channel;
    channel.onopen = () => { if (current()) this.emit('peeropen', { userId }); };
    channel.onmessage = event => {
      if (!current() || typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > 4096) return;
      try { this.emit('peerdata', { userId, data: JSON.parse(event.data), authoritative: false }); } catch {}
    };
    channel.onclose = () => this.emit('peerclose', { userId });
  }
  async openPeer(userId, options = {}) {
    const attempt = this.attempt, generation = this.generation;
    this.assertPeerContext(attempt, generation);
    const peer = await this.peer(userId, options.relayOnly ?? false, attempt, generation);
    const check = () => this.assertPeerContext(attempt, generation, userId, peer);
    check();
    if (!peer.channel) this.channel(userId, peer, peer.pc.createDataChannel('wvn.ephemeral.v1', { ordered: false, maxRetransmits: 0 }));
    const offer = await peer.pc.createOffer(); check();
    await peer.pc.setLocalDescription(offer); check();
    await this.send('offer', peer.pc.localDescription.toJSON(), userId); check();
    return peer.pc;
  }
  async signal(event, attempt = this.attempt, generation = this.generation) {
    this.assertPeerContext(attempt, generation);
    const peer = await this.peer(event.actor, this.options.relayOnly ?? false, attempt, generation), pc = peer.pc;
    const check = () => this.assertPeerContext(attempt, generation, event.actor, peer);
    check();
    if (event.kind === 'ice') {
      if (!pc.remoteDescription) peer.candidates.push(event.data);
      else { await pc.addIceCandidate(event.data); check(); }
      return;
    }
    if (event.kind === 'offer' && pc.signalingState !== 'stable') {
      if (this.userId < event.actor) return;
      await pc.setLocalDescription({ type: 'rollback' }); check();
    }
    await pc.setRemoteDescription(event.data); check();
    for (const candidate of peer.candidates.splice(0)) { await pc.addIceCandidate(candidate); check(); }
    if (event.kind === 'offer') {
      const answer = await pc.createAnswer(); check();
      await pc.setLocalDescription(answer); check();
      await this.send('answer', pc.localDescription.toJSON(), event.actor); check();
    }
  }
  sendPeer(userId, data) {
    const channel = this.peers.get(userId)?.channel, value = JSON.stringify(data);
    if (new TextEncoder().encode(value).length > 4096) throw new Error('peer_message_too_large');
    if (!channel || channel.readyState !== 'open' || channel.bufferedAmount > 65536) throw new Error('peer_not_ready');
    channel.send(value);
  }
  closePeer(id) { const peer = this.peers.get(id); peer?.channel?.close(); peer?.pc.close(); this.peers.delete(id); }
  terminalError(error) { return [401, 403, 410].includes(error?.status) || error?.code === 4003; }
  stopAttempt(attempt, error) {
    if (!this.activeAttempt(attempt)) return;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    this.cancelAttempt(error); this.resetTransport();
    for (const id of this.peers.keys()) this.closePeer(id);
  }
  disconnected(error, attempt = this.attempt) {
    if (!this.activeAttempt(attempt)) return;
    this.emit('disconnected', { message: error?.message });
    if (!this.activeAttempt(attempt)) return;
    if (attempt.terminalError || this.terminalError(error)) { this.stopAttempt(attempt, attempt.terminalError ?? error); return; }
    if (this.connecting || !this.options.reconnect) return;
    this.cancelAttempt(); this.resetTransport();
    const generation = this.generation;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.manualClose && generation === this.generation && !this.attempt) this.connect().catch(next => this.disconnected(next));
    }, Math.min(30000, 500 * 2 ** this.retry++));
  }
  cancelAttempt(reason = new DOMException('Room connection cancelled', 'AbortError')) {
    const attempt = this.attempt;
    this.attempt = null;
    this.connecting = null;
    attempt?.controller.abort(reason);
  }
  resetTransport() {
    ++this.generation;
    this.write = null; this.onReady = null; this.transport = null; this.signalChain = null;
    // 新信令generation必须重新建peer，不能保留回调绑定旧attempt的连接。
    for (const id of this.peers.keys()) this.closePeer(id);
    this.connection?.close(); this.connection = null;
    this.writer?.releaseLock(); this.writer = null;
    this.datagramWriter?.releaseLock(); this.datagramWriter = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('room_disconnected')); }
    this.pending.clear();
  }
  close() {
    this.manualClose = true; clearTimeout(this.retryTimer); this.retryTimer = undefined;
    this.cancelAttempt(); this.resetTransport();
    for (const id of this.peers.keys()) this.closePeer(id);
  }
}

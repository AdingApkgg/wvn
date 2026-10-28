export type RoomSnapshot = { id: string; ownerUserId: string; versionId: string; status: 'open' | 'closed'; seq: number; state: unknown; stateSeq: number; members: { userId: string; displayName: string }[] };
export type RoomEvent = { seq: number; id: string | null; actor: string; kind: string; target: string | null; data: any };
export type RoomReady = { type: 'ready'; userId: string; snapshot: RoomSnapshot; events: RoomEvent[]; cursor: number; head: number };
export type RoomClientOptions = { roomId: string; baseUrl?: string; headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>); preferWebTransport?: boolean; transportTimeoutMs?: number; reconnect?: boolean; relayOnly?: boolean; serverCertificateHashes?: { algorithm: 'sha-256'; value: BufferSource }[] };
export class RoomClient extends EventTarget {
  constructor(options: RoomClientOptions);
  readonly roomId: string;
  readonly transport: 'websocket' | 'webtransport' | null;
  readonly sequence: number;
  readonly userId: string | null;
  readonly snapshot: RoomSnapshot | null;
  readonly peers: Map<string, { pc: RTCPeerConnection; channel: RTCDataChannel | null }>;
  /** close() 以 AbortError 取消尝试；鉴权/成员终止会停止重试并关闭peer。 */
  connect(): Promise<RoomReady>;
  request(path: string, data?: unknown, options?: { signal?: AbortSignal }): Promise<any>;
  publishState(data: unknown, id?: string): Promise<RoomEvent>;
  send(kind: 'state' | 'offer' | 'answer' | 'ice', data: unknown, target?: string, id?: string): Promise<RoomEvent>;
  pingDatagram(): Promise<void>;
  /** TURN和SDP异步工作随当前连接取消，关闭后不会创建peer或发送信令。 */
  openPeer(userId: string, options?: { relayOnly?: boolean }): Promise<RTCPeerConnection>;
  sendPeer(userId: string, data: unknown): void;
  closePeer(userId: string): void;
  /** 取消待完成取票/握手，关闭传输与peer，并停止自动重连。 */
  close(): void;
}

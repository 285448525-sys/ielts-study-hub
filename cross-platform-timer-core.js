/**
 * cross-platform-timer-core.js
 * 跨平台防丢失计时内核（浏览器 / Node 通用）
 *
 * 设计要点（详见 cross-platform-timer-design.md）：
 *  1. 计时基准 = 单调时钟（performance.now / hrtime.bigint），完全隔离 wall-clock。
 *  2. 已走时间 = 当前单调 - 起点单调 - 暂停累计，全程整数纳秒减法，绝不逐 tick 累加。
 *  3. 状态挂 globalThis，避免软导航/重入丢失。
 *  4. 双锚点持久化（mono + wall），进程/设备重启可恢复，单调归零时降级 wall 不丢计时。
 *  5. SyncClient 多端同步：只传事件 + 墙上锚点，不传已走时间。
 */

'use strict';

/* ───────────────────────────────────────────────────────────
 * 1. 单调时钟封装（整数纳秒）
 * ─────────────────────────────────────────────────────────── */
function monoNowNs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    // 浏览器：performance.now() 返回浮点毫秒，转整数纳秒
    return BigInt(Math.round(performance.now() * 1e6));
  }
  if (typeof process !== 'undefined' && typeof process.hrtime === 'object' && process.hrtime.bigint) {
    // Node：原生 BigInt 纳秒
    return process.hrtime.bigint();
  }
  // 极端兜底：用 wall-clock（会受时间修改影响，仅保底）
  return BigInt(Date.now()) * 1000000n;
}

const wallNowMs = () => Date.now();

// 单调回退钳制：极少数平台 hrtime 异常回退时，不更新 lastMono
let _lastMono = monoNowNs();
function safeMonoNowNs() {
  const m = monoNowNs();
  if (m < _lastMono) return _lastMono; // 钳制，避免负 elapsed
  _lastMono = m;
  return m;
}

/* ───────────────────────────────────────────────────────────
 * 2. 活跃计时状态（只存事实，现算 elapsed）
 * ─────────────────────────────────────────────────────────── */
function newTimerId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 't_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function deviceId() {
  // 简化：实际项目用稳定设备指纹
  return (typeof globalThis !== 'undefined' && globalThis.__deviceId) ||
    (globalThis.__deviceId = newTimerId());
}

/**
 * @typedef {Object} ActiveTimer
 * @property {string}   timerId
 * @property {string}   ownerDevice
 * @property {string}   moduleId
 * @property {bigint}   startMonoNs      // 本机单调起点（整数纳秒）
 * @property {number}   startWallMs      // 墙上锚点（仅展示用）
 * @property {boolean}  paused
 * @property {bigint|null} pauseStartMonoNs
 * @property {bigint}   pauseAccumNs     // 历史暂停累计（整数纳秒）
 * @property {number|null} targetSec
 * @property {number}   updatedAtWallMs
 * @property {number}   wallAtWrite      // 持久化时的墙上时间
 * @property {bigint}   monoAtWrite      // 持久化时的单调值（双锚点恢复用）
 */

/* ───────────────────────────────────────────────────────────
 * 3. 计时内核
 * ─────────────────────────────────────────────────────────── */
class TimerCore {
  constructor(opts = {}) {
    this.storageKey = opts.storageKey || 'xpt_active_timer';
    this.onChange = opts.onChange || (() => {});
    this.sync = opts.sync || null; // SyncClient 实例（可选）
    this._tickHandle = null;
    this._tickMs = opts.tickMs || 250;

    // 全局句柄：跨软导航/重入保留
    globalThis.__activeTimer = globalThis.__activeTimer || null;
  }

  get active() { return globalThis.__activeTimer; }
  set active(v) { globalThis.__activeTimer = v; }

  /** 已走纳秒（单一真源：减法，不累加） */
  elapsedNs(t = this.active) {
    if (!t) return 0n;
    const end = t.paused ? (t.pauseStartMonoNs || safeMonoNowNs()) : safeMonoNowNs();
    return end - t.startMonoNs - t.pauseAccumNs;
  }

  elapsedMs(t = this.active) { return Number(this.elapsedNs(t) / 1000000n); }

  isRunning() { return !!this.active && !this.active.paused; }

  /** 开始计时 */
  start(moduleId, targetSec = null) {
    if (this.active && !this.active.paused) {
      // 已在跑：拒绝双开（多端冲突由 sync 层解决）
      return { ok: false, reason: 'already-running', active: this.active };
    }
    const mono = safeMonoNowNs();
    const wall = wallNowMs();
    /** @type {ActiveTimer} */
    const t = {
      timerId: newTimerId(),
      ownerDevice: deviceId(),
      moduleId,
      startMonoNs: mono,
      startWallMs: wall,
      paused: false,
      pauseStartMonoNs: null,
      pauseAccumNs: 0n,
      targetSec,
      updatedAtWallMs: wall,
      wallAtWrite: wall,
      monoAtWrite: mono,
    };
    this.active = t;
    this.persistLocal();
    if (this.sync) this.sync.publishStart(t);
    this._startTick();
    this.onChange({ type: 'start', timer: t, elapsedMs: this.elapsedMs() });
    return { ok: true, active: t };
  }

  pause() {
    const t = this.active;
    if (!t || t.paused) return { ok: false };
    const mono = safeMonoNowNs();
    t.pauseStartMonoNs = mono;
    t.paused = true;
    t.updatedAtWallMs = wallNowMs();
    this.persistLocal();
    if (this.sync) this.sync.publishPause(t);
    this.onChange({ type: 'pause', timer: t, elapsedMs: this.elapsedMs() });
    return { ok: true };
  }

  resume() {
    const t = this.active;
    if (!t || !t.paused) return { ok: false };
    const mono = safeMonoNowNs();
    if (t.pauseStartMonoNs != null) {
      t.pauseAccumNs += mono - t.pauseStartMonoNs; // 一次性结算，tick 不累加
    }
    t.pauseStartMonoNs = null;
    t.paused = false;
    t.updatedAtWallMs = wallNowMs();
    this.persistLocal();
    if (this.sync) this.sync.publishResume(t);
    this.onChange({ type: 'resume', timer: t, elapsedMs: this.elapsedMs() });
    return { ok: true };
  }

  stop() {
    const t = this.active;
    if (!t) return { ok: false };
    this.active = null;
    this.clearLocal();
    this._stopTick();
    if (this.sync) this.sync.publishStop(t);
    this.onChange({ type: 'stop', timer: t, elapsedMs: this.elapsedMs(t) });
    return { ok: true };
  }

  /** 从外部镜像恢复（多端：B 端收到 A 端状态） */
  applyRemote(timerLike) {
    // 远端传来的 wall 锚点，本地用 Date.now() 推演显示
    const t = {
      ...timerLike,
      startMonoNs: 0n,            // 远端 mono 不可比，本地不用于计算
      pauseStartMonoNs: timerLike.paused ? null : null,
      pauseAccumNs: BigInt(timerLike.pauseAccumNs || 0),
      // 本地展示用 wall 推导：
      _remoteStartWallMs: timerLike.startWallMs,
      _remotePauseAccumMs: Number(BigInt(timerLike.pauseAccumNs || 0) / 1000000n),
    };
    this.active = t;
    this.onChange({ type: 'remote', timer: t, elapsedMs: this.remoteElapsedMs(t) });
  }

  /** 远端计时的本地近似（秒级一致） */
  remoteElapsedMs(t) {
    if (!t || !t._remoteStartWallMs) return 0;
    const now = wallNowMs();
    const end = t.paused ? (t._remotePauseStartWallMs || now) : now;
    return Math.max(0, end - t._remoteStartWallMs - (t._remotePauseAccumMs || 0));
  }

  /* ── 本地持久化（双锚点） ── */
  persistLocal() {
    const t = this.active;
    if (!t) return;
    try {
      const mono = safeMonoNowNs();
      t.wallAtWrite = wallNowMs();
      t.monoAtWrite = mono;
      const payload = {
        timerId: t.timerId,
        ownerDevice: t.ownerDevice,
        moduleId: t.moduleId,
        startMonoNs: t.startMonoNs.toString(),
        startWallMs: t.startWallMs,
        paused: t.paused,
        pauseStartMonoNs: t.pauseStartMonoNs == null ? null : t.pauseStartMonoNs.toString(),
        pauseAccumNs: t.pauseAccumNs.toString(),
        targetSec: t.targetSec,
        updatedAtWallMs: t.updatedAtWallMs,
        wallAtWrite: t.wallAtWrite,
        monoAtWrite: t.monoAtWrite.toString(),
      };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(payload));
      }
    } catch (e) {
      // 隐私模式/配额异常：仅丢跨重启恢复能力，不影响本次会话
      console.warn('[TimerCore] persist failed:', e.message);
    }
  }

  clearLocal() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(this.storageKey);
    } catch (e) { /* ignore */ }
  }

  /**
   * 双锚点恢复：进程/设备重启后调用。
   * 单调时钟会归零，故用 (wallNow - wallAtWrite) 与 (monoNow - monoAtWrite) 交叉校验。
   */
  recoverLocal() {
    let raw;
    try {
      if (typeof localStorage === 'undefined') return null;
      raw = localStorage.getItem(this.storageKey);
    } catch (e) { return null; }
    if (!raw) return null;
    let p;
    try { p = JSON.parse(raw); } catch (e) { return null; }

    const monoNow = safeMonoNowNs();
    const monoAtWrite = BigInt(p.monoAtWrite || '0');
    const wallAtWrite = p.wallAtWrite || 0;
    const wallNow = wallNowMs();

    // 单调时钟未被重置（同进程/短时间重启）：直接用 mono 反推
    if (monoNow >= monoAtWrite) {
      const drift = monoNow - monoAtWrite; // 写盘后到现在的单调流逝
      const t = {
        timerId: p.timerId,
        ownerDevice: p.ownerDevice,
        moduleId: p.moduleId,
        startMonoNs: BigInt(p.startMonoNs) + drift, // 反推真实起点
        startWallMs: p.startWallMs,
        paused: p.paused,
        pauseStartMonoNs: p.pauseStartMonoNs == null ? null : BigInt(p.pauseStartMonoNs) + (p.paused ? drift : 0n),
        pauseAccumNs: BigInt(p.pauseAccumNs),
        targetSec: p.targetSec,
        updatedAtWallMs: p.updatedAtWallMs,
        wallAtWrite,
        monoAtWrite,
      };
      this.active = t;
      this._startTick();
      this.onChange({ type: 'recover', timer: t, elapsedMs: this.elapsedMs() });
      return t;
    }

    // 单调时钟已归零（设备重启）：降级用 wall 锚点，接受 NTP 误差但不丢计时
    const wallDrift = Math.max(0, wallNow - wallAtWrite);
    const t = {
      timerId: p.timerId,
      ownerDevice: p.ownerDevice,
      moduleId: p.moduleId,
      startMonoNs: monoNow - BigInt(Math.round(wallDrift * 1e6)), // 用 wall 估算 mono 起点
      startWallMs: p.startWallMs,
      paused: p.paused,
      pauseStartMonoNs: p.pauseStartMonoNs == null ? null : monoNow,
      pauseAccumNs: BigInt(p.pauseAccumNs),
      targetSec: p.targetSec,
      updatedAtWallMs: p.updatedAtWallMs,
      wallAtWrite,
      monoAtWrite,
    };
    this.active = t;
    this._startTick();
    this.onChange({ type: 'recover-wall-fallback', timer: t, elapsedMs: this.elapsedMs() });
    return t;
  }

  /* ── Tick 引擎：只做减法渲染，绝不累加 ── */
  _startTick() {
    if (this._tickHandle) return;
    this._tickHandle = setInterval(() => {
      if (!this.active) { this._stopTick(); return; }
      this.onChange({ type: 'tick', timer: this.active, elapsedMs: this.elapsedMs() });
      // 若绑定 sync，周期心跳（不阻塞本地计时）
      if (this.sync && this.sync.heartbeat) this.sync.heartbeat(this.active);
    }, this._tickMs);
    // 防止 Node 下 setInterval 阻止进程退出
    if (this._tickHandle && typeof this._tickHandle.unref === 'function') this._tickHandle.unref();
  }
  _stopTick() {
    if (this._tickHandle) { clearInterval(this._tickHandle); this._tickHandle = null; }
  }

  /** 格式化：天/时/分/秒 */
  static format(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
}

/* ───────────────────────────────────────────────────────────
 * 4. 多端同步客户端（桩：接 WebSocket / REST）
 * ─────────────────────────────────────────────────────────── */
class SyncClient {
  /**
   * @param {Object} opts
   *   opts.send(event)  // 发送事件到服务端
   *   opts.onRemote(cb) // 注册接收远端事件的回调
   *   opts.heartbeatMs  // 心跳间隔
   */
  constructor(opts = {}) {
    this.send = opts.send || (() => {});
    this.heartbeatMs = opts.heartbeatMs || 5000;
    this._lastBeat = 0;
    this._handlers = { start: [], stop: [], pause: [], resume: [], tick: [] };
    if (opts.onRemote) opts.onRemote((evt) => this._dispatch(evt));
  }
  on(type, cb) { (this._handlers[type] || (this._handlers[type] = [])).push(cb); }
  _dispatch(evt) { (this._handlers[evt.type] || []).forEach((h) => h(evt)); }

  publishStart(t) { this.send({ type: 'start', timer: this._serialize(t) }); }
  publishStop(t)  { this.send({ type: 'stop',  timerId: t.timerId }); }
  publishPause(t) { this.send({ type: 'pause', timer: this._serialize(t) }); }
  publishResume(t){ this.send({ type: 'resume',timer: this._serialize(t) }); }

  // 心跳：节流到 heartbeatMs
  heartbeat(t) {
    const now = Date.now();
    if (now - this._lastBeat < this.heartbeatMs) return;
    this._lastBeat = now;
    this.send({ type: 'heartbeat', timer: this._serialize(t) });
  }

  // 序列化：BigInt -> 字符串；不传本机 mono（跨端不可比），传 wall 锚点
  _serialize(t) {
    return {
      timerId: t.timerId,
      ownerDevice: t.ownerDevice,
      moduleId: t.moduleId,
      startWallMs: t.startWallMs,
      paused: t.paused,
      pauseAccumNs: (t.pauseAccumNs || 0n).toString(),
      targetSec: t.targetSec,
      updatedAtWallMs: Date.now(),
    };
  }
}

/* ───────────────────────────────────────────────────────────
 * 5. 导出
 * ─────────────────────────────────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TimerCore, SyncClient, monoNowNs, safeMonoNowNs };
} else {
  globalThis.TimerCore = TimerCore;
  globalThis.SyncClient = SyncClient;
}

/* ───────────────────────────────────────────────────────────
 * 6. 自检（node cross-platform-timer-core.js）
 * ─────────────────────────────────────────────────────────── */
if (typeof require !== 'undefined' && require.main === module) {
  const core = new TimerCore({ tickMs: 100 });
  console.log('start →', core.start('listening').ok);
  setTimeout(() => {
    console.log('elapsed after 300ms ≈', core.elapsedMs(), 'ms (应≈300)');
    core.pause();
    const before = core.elapsedMs();
    setTimeout(() => {
      console.log('paused 200ms, elapsed unchanged?', core.elapsedMs() === before);
      core.resume();
      setTimeout(() => {
        console.log('after resume +100ms elapsed ≈', core.elapsedMs(), 'ms (应≈400)');
        console.log('format:', TimerCore.format(core.elapsedMs()));
        core.stop();
        console.log('after stop active =', core.active);
        console.log('SELF-CHECK DONE');
      }, 120);
    }, 220);
  }, 320);
}

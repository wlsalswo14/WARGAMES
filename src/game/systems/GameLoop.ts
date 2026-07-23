export class GameLoop {
  private readonly minimumFrameInterval = 1000 / 60 - 1;
  private animationFrameId: number | null = null;
  private watchdogId: number | null = null;
  private running = false;
  private lastFrameTime = performance.now();
  private lastUpdateTime = performance.now();

  constructor(private readonly update: () => void) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastFrameTime = performance.now();
    this.lastUpdateTime = this.lastFrameTime;
    this.scheduleFrame();
    this.watchdogId = window.setInterval(this.ensureRunning, 1000);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.watchdogId !== null) {
      window.clearInterval(this.watchdogId);
      this.watchdogId = null;
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private readonly tick = (timestamp: number): void => {
    this.animationFrameId = null;
    this.lastFrameTime = performance.now();
    if (timestamp - this.lastUpdateTime < this.minimumFrameInterval) {
      this.scheduleFrame();
      return;
    }
    this.lastUpdateTime = timestamp;
    this.update();
    this.scheduleFrame();
  };

  private readonly ensureRunning = (): void => {
    if (
      !this.running
      || document.visibilityState !== 'visible'
      || performance.now() - this.lastFrameTime < 1500
    ) {
      return;
    }
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.scheduleFrame();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.lastFrameTime = performance.now();
      this.lastUpdateTime = this.lastFrameTime;
      this.scheduleFrame();
    }
  };

  private scheduleFrame(): void {
    if (!this.running || this.animationFrameId !== null) {
      return;
    }
    this.animationFrameId = window.requestAnimationFrame(this.tick);
  }
}

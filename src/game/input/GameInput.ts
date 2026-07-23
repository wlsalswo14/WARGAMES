interface GameInputCallbacks {
  onKeyDown: (event: KeyboardEvent) => void;
  onMouseDown: (event: MouseEvent) => void;
  onMouseLook: (movementX: number, movementY: number) => void;
  onWheel: (deltaY: number) => void;
  onDoubleClick: (event: MouseEvent) => void;
  onPointerLockChange: (locked: boolean) => void;
  onResize: () => void;
}

const CONTROL_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
]);

export class GameInput {
  private readonly keys = new Set<string>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: GameInputCallbacks,
  ) {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('dblclick', this.handleDoubleClick);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lockPointer(): void {
    if (!this.pointerLocked) {
      void this.canvas.requestPointerLock();
    }
  }

  unlockPointer(): void {
    if (this.pointerLocked) {
      document.exitPointerLock();
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick);
  }

  private readonly handleResize = (): void => {
    this.callbacks.onResize();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.pointerLocked && CONTROL_KEYS.has(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
    this.callbacks.onKeyDown(event);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.pointerLocked && CONTROL_KEYS.has(event.code)) {
      event.preventDefault();
    }
    this.keys.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.keys.clear();
  };

  private readonly handlePointerLockChange = (): void => {
    this.callbacks.onPointerLockChange(this.pointerLocked);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (this.pointerLocked) {
      this.callbacks.onMouseLook(event.movementX, event.movementY);
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.callbacks.onWheel(event.deltaY);
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    this.callbacks.onMouseDown(event);
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    this.callbacks.onDoubleClick(event);
  };
}

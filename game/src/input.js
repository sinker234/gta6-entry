// Keyboard + mouse input. Keys are tracked as a set of codes; the mouse is
// tracked in screen space and converted to world space by the game.
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.mouse = { x: 0, y: 0, down: false };
    this.pressed = new Set(); // edge-triggered, cleared each frame by game
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
    canvas.addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.pressed.add('Mouse0'); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('click', () => this.pressed.add('Click'));
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}

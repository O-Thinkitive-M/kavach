// Kavach branding for the terminal.
//
// The mark is a concentric-ring shield with a center star. Banner art must never
// corrupt machine-readable stdout, so it degrades to a wordmark when stdout is not
// a TTY (piped output, CI) or NO_COLOR is set.

const plain = () => Boolean(process.env.NO_COLOR) || !process.stdout.isTTY;

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  blue: '\x1b[38;5;39m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;221m',
  green: '\x1b[38;5;114m',
  grey: '\x1b[38;5;245m',
};

function color(code: string, text: string): string {
  return plain() ? text : code + text + ANSI.reset;
}

export const c = {
  bold: (t: string) => color(ANSI.bold, t),
  dim: (t: string) => color(ANSI.dim, t),
  blue: (t: string) => color(ANSI.blue, t),
  red: (t: string) => color(ANSI.red, t),
  yellow: (t: string) => color(ANSI.yellow, t),
  green: (t: string) => color(ANSI.green, t),
  grey: (t: string) => color(ANSI.grey, t),
};

// The shield is drawn from the same geometry as assets/shield.svg rather than
// hand-laid ASCII, so the terminal mark and the image mark cannot drift apart.
// Each cell samples the top and bottom half and renders a half-block, which
// doubles vertical resolution in a terminal's 2:1 character aspect.
const RINGS = [
  { r: 1.0, fg: '\x1b[38;5;196m' }, // outer red
  { r: 0.78, fg: '\x1b[38;5;255m' }, // white
  { r: 0.56, fg: '\x1b[38;5;196m' }, // red
  { r: 0.35, fg: '\x1b[38;5;19m' }, // navy centre
];
const STAR_FG = '\x1b[38;5;255m';

const COLS = 22;
const ROWS = 11;

function starHit(nx: number, ny: number): boolean {
  // Point-in-polygon against a 5-point star, apex up, in normalized space.
  const outer = 0.315;
  const inner = 0.126;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([r * Math.cos(angle), r * Math.sin(angle)]);
  }

  let inside = false;
  for (let i = 0, j = 9; i < 10; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > ny !== yj > ny && nx < ((xj - xi) * (ny - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Colour of one sample point, or null when outside the shield. */
function sample(nx: number, ny: number): string | null {
  const d = Math.hypot(nx, ny);
  if (d > RINGS[0].r) return null;
  if (d <= RINGS[3].r) return starHit(nx, ny) ? STAR_FG : RINGS[3].fg;
  for (let i = 0; i < 3; i++) {
    if (d > RINGS[i + 1].r) return RINGS[i].fg;
  }
  return RINGS[3].fg;
}

/** Turn a 256-colour foreground escape into the matching background escape. */
function bg(fg: string): string {
  return fg.replace('[38;5;', '[48;5;');
}

function shieldRows(): string[] {
  const rows: string[] = [];

  for (let row = 0; row < ROWS; row++) {
    let line = '';
    for (let col = 0; col < COLS; col++) {
      const nx = ((col + 0.5) / COLS) * 2 - 1;
      // Two vertical samples per cell -> upper and lower half-block.
      const top = sample(nx, ((row + 0.25) / ROWS) * 2 - 1);
      const bottom = sample(nx, ((row + 0.75) / ROWS) * 2 - 1);

      if (!top && !bottom) {
        line += ' ';
      } else if (top && bottom) {
        // Both halves filled: use a full block in the top colour, with the
        // bottom colour as background so a two-tone cell still reads correctly.
        line += top === bottom ? `${top}█\x1b[0m` : `${top}${bg(bottom)}▀\x1b[0m`;
      } else if (top) {
        line += `${top}▀\x1b[0m`;
      } else {
        line += `${bottom}▄\x1b[0m`;
      }
    }
    rows.push(line);
  }
  return rows;
}

/** Printed once per run. Goes to stderr so stdout stays parseable. */
export function banner(subtitle = 'autonomous PR review'): string {
  if (plain()) return `KAVACH — ${subtitle}`;

  const lines = shieldRows();
  lines[4] += c.bold('   K A V A C H');
  lines[5] += c.grey(`   ${subtitle}`);
  return lines.join('\n');
}

export function severityColor(severity: string, text: string): string {
  switch (severity) {
    case 'Critical':
      return c.red(text);
    case 'High':
      return c.red(text);
    case 'Medium':
      return c.yellow(text);
    case 'Low':
      return c.grey(text);
    default:
      return c.blue(text);
  }
}

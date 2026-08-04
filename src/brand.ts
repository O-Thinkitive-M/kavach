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

// Concentric rings with a center star. Every row is the same display width so
// the circle does not shear; box-drawing glyphs are all single-width.
const SHIELD = [
  '    ▄▄████████▄▄    ',
  '  ▄███▀▀    ▀▀███▄  ',
  ' ███  ▄▄████▄▄  ███ ',
  '███  ███▀  ▀███  ███',
  '██  ██▀  ▄▄  ▀██  ██',
  '██  ██  ▐██▌  ██  ██',
  '██  ██▄  ▀▀  ▄██  ██',
  '███  ███▄  ▄███  ███',
  ' ███  ▀▀████▀▀  ███ ',
  '  ▀███▄▄    ▄▄███▀  ',
  '    ▀▀████████▀▀    ',
];

/** Printed once per run. Goes to stderr so stdout stays parseable. */
export function banner(subtitle = 'autonomous PR review'): string {
  if (plain()) return `KAVACH — ${subtitle}`;

  const lines = SHIELD.map((l) => c.blue(l));
  lines[4] += c.bold('        K A V A C H');
  lines[5] += c.grey(`        ${subtitle}`);
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

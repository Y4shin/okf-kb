// splitByHeadings — per-section chunking. Split a note's body by `#`/`##`
// headings; the text of a chunk is the heading line + body until the next
// heading. The first chunk (before any heading) uses the note's title.
import { marked } from 'marked';

export interface Chunk {
  headingPath: string[];
  text: string;
}

export function splitByHeadings(body: string, title?: string): Chunk[] {
  const tokens = marked.lexer(body);
  const chunks: Chunk[] = [];
  // stack of headings currently in scope, indexed by depth (1-based)
  const stack: string[] = [];
  let current: { headingPath: string[]; lines: string[] } | null = null;

  const flush = () => {
    if (current && current.lines.join('').trim().length > 0) {
      chunks.push({ headingPath: [...current.headingPath], text: current.lines.join('\n').trim() });
    } else if (current && current.headingPath.length > 0) {
      // a heading with no body still becomes a (possibly empty-text) chunk
      chunks.push({ headingPath: [...current.headingPath], text: current.lines.join('\n').trim() });
    }
  };

  for (const tok of tokens) {
    if (tok.type === 'heading') {
      flush();
      stack.length = tok.depth - 1;
      stack[tok.depth - 1] = tok.text;
      const headingPath = stack.slice(0, tok.depth).filter(Boolean);
      current = { headingPath, lines: [`${'#'.repeat(tok.depth)} ${tok.text}`] };
    } else {
      const raw = 'raw' in tok ? (tok as { raw: string }).raw : '';
      if (current === null) {
        current = { headingPath: title ? [title] : [], lines: [] };
      }
      current.lines.push(raw.replace(/\n+$/, ''));
    }
  }
  flush();

  return chunks.length > 0 ? chunks : [{ headingPath: title ? [title] : [], text: body.trim() }];
}

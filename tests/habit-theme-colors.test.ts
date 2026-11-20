import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/ui/HabitVisuals.tsx'), 'utf8');

describe('Lotus habit colour mapping', () => {
  it('uses existing Lotus palette tokens for complete, incomplete, and partial controls', () => {
    const lotusStart = source.indexOf("if (p.style === 'lotus')");
    const lotusBranch = source.slice(lotusStart, source.indexOf("\n  if (group === 'Body') return", lotusStart));
    expect(lotusBranch).toContain('solid: p.blue');
    expect(lotusBranch).toContain('solid: p.lime');
    expect(lotusBranch).toContain('solid: p.g1');
    expect(lotusBranch).toContain('soft: p.paleBlue');
    expect(lotusBranch).toContain('soft: p.softLime');
    expect(lotusBranch).toContain('soft: p.soft1');
    expect(lotusBranch).toContain('softInk: p.accent');
    expect(lotusBranch).not.toMatch(/#(?:EAF3FF|F4FBD2|E7ECF8|5E7FAE|7C8A2E|55618A)\b/);
  });

  it('leaves Volt category mapping unchanged', () => {
    const voltBranch = source.slice(source.lastIndexOf("if (group === 'Body')"));
    expect(voltBranch).toContain("'#EAF3FF'");
    expect(voltBranch).toContain("'#F4FBD2'");
    expect(voltBranch).toContain('brand.violet');
  });
});

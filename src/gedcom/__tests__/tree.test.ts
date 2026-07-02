import { describe, expect, it } from 'vitest';
import { buildTree } from '../parser/tree.js';

describe('buildTree', () => {
  it('nests children by level and captures xrefs', () => {
    const text = [
      '0 @I1@ INDI',
      '1 NAME John /Smith/',
      '2 GIVN John',
      '1 SEX M',
      '0 @I2@ INDI',
      '1 SEX F',
    ].join('\n');

    const { records, warnings } = buildTree(text);
    expect(warnings).toEqual([]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ tag: 'INDI', xref: '@I1@' });
    expect(records[0]!.children).toHaveLength(2);
    expect(records[0]!.children[0]).toMatchObject({ tag: 'NAME', value: 'John /Smith/' });
    expect(records[0]!.children[0]!.children[0]).toMatchObject({ tag: 'GIVN', value: 'John' });
  });

  it('joins CONT with a newline and CONC without one', () => {
    const text = ['0 @I1@ INDI', '1 NOTE first line', '2 CONT second line', '2 CONC -continued'].join('\n');
    const { records } = buildTree(text);
    const note = records[0]!.children[0]!;
    expect(note.value).toBe('first line\nsecond line-continued');
  });

  it('handles CRLF line endings', () => {
    const text = '0 @I1@ INDI\r\n1 SEX M\r\n';
    const { records } = buildTree(text);
    expect(records).toHaveLength(1);
    expect(records[0]!.children[0]).toMatchObject({ tag: 'SEX', value: 'M' });
  });

  it('skips malformed lines without throwing', () => {
    const text = ['0 @I1@ INDI', 'this is not a valid gedcom line', '1 SEX M'].join('\n');
    const { records, warnings } = buildTree(text);
    expect(records).toHaveLength(1);
    expect(records[0]!.children).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it('skips unknown/custom Ancestry tags gracefully rather than dropping siblings', () => {
    const text = ['0 @I1@ INDI', '1 _MTTAG something', '1 SEX M'].join('\n');
    const { records } = buildTree(text);
    expect(records[0]!.children.map((c) => c.tag)).toEqual(['_MTTAG', 'SEX']);
  });
});

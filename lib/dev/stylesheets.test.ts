import { describe, expect, it } from 'vitest';

import { subjectClasses } from './stylesheets';

describe('the classes a selector styles', () => {
  it('takes the last compound of each branch', () => {
    expect(subjectClasses('.sheet-seg > .value')).toEqual(['value']);
    expect(subjectClasses('.a .b, .c.d')).toEqual(['b', 'c', 'd']);
  });

  it('reads through :is() and :where(), not :not() or :has()', () => {
    expect(subjectClasses(':is(.row)[data-current]')).toEqual(['row']);
    expect(subjectClasses('.row:not(.row-end):has(.badge)')).toEqual(['row']);
    expect(subjectClasses(':is(.menu) :is(.row, .link)')).toEqual([
      'row',
      'link',
    ]);
  });

  it('keeps attribute values whole', () => {
    expect(subjectClasses(".row[data-kind='a b'] .end")).toEqual(['end']);
  });
});

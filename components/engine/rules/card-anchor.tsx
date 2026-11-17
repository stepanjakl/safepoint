'use client';

import { createContext } from 'react';

// Where a card is, for a link from a card that reads it.
export const anchorOf = (id: string) => `definition-${id}`;
// A page drawing the same rulebook more than once gives each its own anchors.
export const CardAnchor = createContext(anchorOf);

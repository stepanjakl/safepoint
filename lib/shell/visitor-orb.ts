import {
  amber,
  blue,
  bronze,
  brown,
  crimson,
  gold,
  grass,
  green,
  indigo,
  iris,
  jade,
  lime,
  mint,
  olive,
  orange,
  pink,
  plum,
  purple,
  red,
  ruby,
  teal,
  tomato,
  violet,
  yellow,
} from '@radix-ui/colors';

import {
  VISITOR_ADJECTIVES,
  VISITOR_NOUNS,
  type VisitorAdjective,
  type VisitorNoun,
} from './visitor-name';

/*
  A visitor's orb is painted from their name: the noun picks the colours of
  the food, the adjective sets the mood. The avatar draws on a canvas, which
  cannot read a CSS role, so the stops are Radix light steps as hex.
*/

// Still issued in the cookie (server/access/visitor.ts); the colours no
// longer read it, so existing cookies keep working unchanged.
export const VISITOR_ORB_COUNT = 6;

const SCALES = {
  amber,
  blue,
  bronze,
  brown,
  crimson,
  gold,
  grass,
  green,
  indigo,
  iris,
  jade,
  lime,
  mint,
  olive,
  orange,
  pink,
  plum,
  purple,
  red,
  ruby,
  teal,
  tomato,
  violet,
  yellow,
} as const;

type Scale = keyof typeof SCALES;
type Step = 5 | 6 | 7 | 8 | 9 | 10 | 11;
type Stop = readonly [Scale, Step];

// Pale foods carry an accent (jam, berries, honey) so they do not read as mud.
const NOUN_STOPS: Record<VisitorNoun, readonly Stop[]> = {
  Croissant: [
    ['amber', 7],
    ['orange', 9],
    ['brown', 10],
    ['yellow', 6],
  ],
  Shakshuka: [
    ['tomato', 9],
    ['red', 10],
    ['orange', 8],
    ['grass', 8],
  ],
  Pancake: [
    ['amber', 6],
    ['gold', 8],
    ['amber', 10],
    ['orange', 9],
  ],
  Waffle: [
    ['amber', 8],
    ['brown', 9],
    ['yellow', 7],
  ],
  Muffin: [
    ['brown', 10],
    ['iris', 9],
    ['amber', 7],
  ],
  Bagel: [
    ['bronze', 9],
    ['gold', 7],
    ['tomato', 8],
  ],
  Biscuit: [
    ['gold', 8],
    ['amber', 6],
    ['red', 9],
  ],
  Brioche: [
    ['amber', 9],
    ['yellow', 7],
    ['orange', 10],
  ],
  Scone: [
    ['gold', 8],
    ['crimson', 9],
    ['yellow', 6],
  ],
  Crumpet: [
    ['amber', 8],
    ['yellow', 9],
    ['brown', 9],
  ],
  Omelette: [
    ['yellow', 9],
    ['amber', 7],
    ['grass', 9],
  ],
  Granola: [
    ['brown', 9],
    ['amber', 9],
    ['crimson', 10],
  ],
  Yoghurt: [
    ['pink', 7],
    ['ruby', 9],
    ['plum', 8],
  ],
  Avocado: [
    ['grass', 9],
    ['lime', 8],
    ['green', 11],
    ['brown', 10],
  ],
  Tomato: [
    ['tomato', 9],
    ['red', 10],
    ['grass', 9],
  ],
  Mushroom: [
    ['brown', 9],
    ['bronze', 7],
    ['olive', 9],
  ],
  Pretzel: [
    ['brown', 10],
    ['bronze', 9],
    ['amber', 10],
  ],
  Toast: [
    ['amber', 9],
    ['brown', 9],
    ['crimson', 9],
    ['yellow', 7],
  ],
  Sourdough: [
    ['bronze', 8],
    ['brown', 10],
    ['gold', 7],
  ],
  Cinnamon: [
    ['orange', 10],
    ['brown', 10],
    ['tomato', 9],
  ],
  Blueberry: [
    ['indigo', 9],
    ['violet', 9],
    ['iris', 10],
    ['blue', 7],
  ],
  Raspberry: [
    ['crimson', 9],
    ['ruby', 10],
    ['pink', 8],
  ],
  Strawberry: [
    ['red', 9],
    ['crimson', 9],
    ['grass', 8],
  ],
  Mango: [
    ['orange', 9],
    ['amber', 9],
    ['yellow', 8],
    ['lime', 9],
  ],
  Papaya: [
    ['orange', 8],
    ['tomato', 9],
    ['amber', 7],
    ['green', 10],
  ],
  Peach: [
    ['orange', 8],
    ['amber', 7],
    ['pink', 8],
  ],
  Plum: [
    ['plum', 9],
    ['purple', 10],
    ['violet', 9],
    ['pink', 8],
  ],
  Honey: [
    ['amber', 9],
    ['yellow', 9],
    ['orange', 9],
  ],
  Maple: [
    ['orange', 10],
    ['amber', 10],
    ['brown', 10],
    ['red', 9],
  ],
  Cappuccino: [
    ['brown', 9],
    ['bronze', 7],
    ['brown', 11],
  ],
  Espresso: [
    ['brown', 11],
    ['brown', 9],
    ['amber', 7],
  ],
  Latte: [
    ['bronze', 7],
    ['brown', 8],
    ['gold', 6],
  ],
  Teapot: [
    ['jade', 9],
    ['teal', 10],
    ['mint', 8],
  ],
  Marmalade: [
    ['orange', 9],
    ['amber', 9],
    ['tomato', 10],
  ],
  Pastry: [
    ['amber', 8],
    ['crimson', 8],
    ['gold', 9],
  ],
  Danish: [
    ['amber', 9],
    ['ruby', 9],
    ['yellow', 7],
  ],
  Frittata: [
    ['yellow', 9],
    ['grass', 9],
    ['tomato', 9],
  ],
  Pecan: [
    ['brown', 10],
    ['amber', 10],
    ['bronze', 10],
  ],
  Porridge: [
    ['gold', 7],
    ['amber', 9],
    ['violet', 9],
  ],
  Smoothie: [
    ['pink', 9],
    ['mint', 8],
    ['plum', 8],
    ['lime', 8],
  ],
};

type Mood = 'warm' | 'soft' | 'lively' | 'plain';

const ADJECTIVE_MOOD: Record<VisitorAdjective, Mood> = {
  Sunny: 'warm',
  Golden: 'warm',
  Toasty: 'warm',
  Glowing: 'warm',
  Warm: 'warm',
  Cosy: 'warm',
  Hearty: 'warm',
  Happy: 'warm',
  Calm: 'soft',
  Quiet: 'soft',
  Mellow: 'soft',
  Gentle: 'soft',
  Dreamy: 'soft',
  Humble: 'soft',
  Fluffy: 'soft',
  Sweet: 'soft',
  Zesty: 'lively',
  Peppy: 'lively',
  Snappy: 'lively',
  Bubbly: 'lively',
  Lively: 'lively',
  Speedy: 'lively',
  Spry: 'lively',
  Plucky: 'lively',
  Eager: 'lively',
  Jolly: 'lively',
  Nimble: 'lively',
  Playful: 'lively',
  Merry: 'lively',
  Curious: 'plain',
  Cheerful: 'plain',
  Bright: 'plain',
  Breezy: 'plain',
  Dandy: 'plain',
  Lucky: 'plain',
  Clever: 'plain',
  Crisp: 'plain',
  Friendly: 'plain',
  Smiling: 'plain',
  Rosy: 'plain',
};

const clamp = (step: number): Step => Math.min(11, Math.max(5, step)) as Step;

// Soft lifts every stop toward the light end; lively pushes the stops apart;
// warm adds a honeyed stop.
function withMood(stops: readonly Stop[], mood: Mood): readonly Stop[] {
  switch (mood) {
    case 'soft':
      return stops.map(([scale, step]) => [scale, clamp(step - 2)] as const);
    case 'lively':
      return stops.map(
        ([scale, step]) =>
          [scale, clamp(step >= 9 ? step + 1 : step - 1)] as const,
      );
    case 'warm':
      return [...stops, ['amber', 8]];
    case 'plain':
      return stops;
  }
}

const isAdjective = (word: string): word is VisitorAdjective =>
  (VISITOR_ADJECTIVES as readonly string[]).includes(word);
const isNoun = (word: string): word is VisitorNoun =>
  (VISITOR_NOUNS as readonly string[]).includes(word);

// The hex stops for a visitor name, or null for a name the list did not give
// (a signed-in person), which keeps the brand palette.
export function visitorPalette(name: string): string[] | null {
  const [adjective, noun, ...rest] = name.split(' ');
  if (rest.length > 0 || !adjective || !noun) return null;
  if (!isAdjective(adjective) || !isNoun(noun)) return null;
  return withMood(NOUN_STOPS[noun], ADJECTIVE_MOOD[adjective]).map(
    ([scale, step]) =>
      (SCALES[scale] as Record<string, string>)[`${scale}${step}`]!,
  );
}

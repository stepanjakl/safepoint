/*
  The name a visitor is given before they have said who they are: an adjective
  and a brunch table's noun. Kind words only, and none that reads as a person's
  name. The function takes the random bytes it needs so a test can choose them.
*/
export const VISITOR_ADJECTIVES = [
  'Curious',
  'Sunny',
  'Cheerful',
  'Gentle',
  'Bright',
  'Cosy',
  'Merry',
  'Jolly',
  'Breezy',
  'Dandy',
  'Eager',
  'Fluffy',
  'Golden',
  'Happy',
  'Lively',
  'Lucky',
  'Mellow',
  'Nimble',
  'Peppy',
  'Plucky',
  'Quiet',
  'Rosy',
  'Snappy',
  'Spry',
  'Sweet',
  'Toasty',
  'Warm',
  'Zesty',
  'Bubbly',
  'Calm',
  'Clever',
  'Crisp',
  'Dreamy',
  'Friendly',
  'Glowing',
  'Hearty',
  'Humble',
  'Playful',
  'Smiling',
  'Speedy',
] as const;

export const VISITOR_NOUNS = [
  'Croissant',
  'Shakshuka',
  'Pancake',
  'Waffle',
  'Muffin',
  'Bagel',
  'Biscuit',
  'Brioche',
  'Scone',
  'Crumpet',
  'Omelette',
  'Granola',
  'Yoghurt',
  'Avocado',
  'Tomato',
  'Mushroom',
  'Pretzel',
  'Toast',
  'Sourdough',
  'Cinnamon',
  'Blueberry',
  'Raspberry',
  'Strawberry',
  'Mango',
  'Papaya',
  'Peach',
  'Plum',
  'Honey',
  'Maple',
  'Cappuccino',
  'Espresso',
  'Latte',
  'Teapot',
  'Marmalade',
  'Pastry',
  'Danish',
  'Frittata',
  'Pecan',
  'Porridge',
  'Smoothie',
] as const;

export type VisitorAdjective = (typeof VISITOR_ADJECTIVES)[number];
export type VisitorNoun = (typeof VISITOR_NOUNS)[number];

// The first two bytes pick the words, so a name is a function of its bytes.
export function visitorName(bytes: Uint8Array): string {
  const adjective =
    VISITOR_ADJECTIVES[(bytes[0] ?? 0) % VISITOR_ADJECTIVES.length];
  const noun = VISITOR_NOUNS[(bytes[1] ?? 0) % VISITOR_NOUNS.length];
  return `${adjective} ${noun}`;
}

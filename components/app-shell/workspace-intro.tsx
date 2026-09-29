'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { BiomorphicSymbol } from '@/components/ui/biomorphic-symbol';
import {
  BRAND_TURN_DURATION,
  BRAND_TURN_ROTATION,
  BRAND_TURN_TIMES,
} from '@/components/ui/brand-turn';
import { useShellPageNavigation } from './shell-page-transition';
import { EASE_OUT_QUAD } from '@/lib/motion';

type Phrase =
  | { kind: 'plain'; text: string }
  | { kind: 'emphasis'; before: string; word: string; after: string };

const BEATS = [
  {
    phrases: [
      { kind: 'plain', text: 'The agent' },
      { kind: 'emphasis', before: ' ', word: 'proposes', after: '' },
      { kind: 'plain', text: ' changes' },
      { kind: 'plain', text: ' to your' },
      { kind: 'plain', text: ' systems.' },
    ],
  },
  {
    phrases: [
      { kind: 'plain', text: 'You' },
      { kind: 'emphasis', before: ' ', word: 'review', after: '' },
      { kind: 'plain', text: ' what would' },
      { kind: 'plain', text: ' change,' },
      { kind: 'plain', text: ' and why.' },
    ],
  },
  {
    phrases: [
      { kind: 'plain', text: 'Safepoint' },
      { kind: 'plain', text: ' applies' },
      { kind: 'plain', text: ' only what' },
      { kind: 'plain', text: ' you' },
      {
        kind: 'emphasis',
        before: ' ',
        word: 'approve',
        after: '.',
      },
    ],
  },
] satisfies { phrases: Phrase[] }[];
const FIRST_PHRASE_DELAY = 1.14;
const PHRASE_DURATION = 0.5;
const PHRASE_STAGGER = 0.28;
const BEAT_PAUSE = 0.18;
const PHRASE_OPACITY = [0, 0.25, 1];
const PHRASE_TIMES = [0, 0.25, 1];
const MENU_REVEAL_PAUSE = 450;

let nextPhraseDelay = FIRST_PHRASE_DELAY;
const TIMED_BEATS = BEATS.map(({ phrases }) => ({
  phrases: phrases.map((phrase, index) => {
    const delay = nextPhraseDelay;
    nextPhraseDelay +=
      PHRASE_STAGGER + (index === phrases.length - 1 ? BEAT_PAUSE : 0);
    return { phrase, delay };
  }),
}));

export function WorkspaceIntro() {
  const reduceMotion = useReducedMotion();
  const { finishWorkspaceIntro } = useShellPageNavigation();
  const [textComplete, setTextComplete] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introFinished = useRef(false);

  useEffect(
    () => () => {
      if (revealTimer.current !== null) clearTimeout(revealTimer.current);
    },
    [],
  );

  function finishText() {
    if (introFinished.current) return;
    introFinished.current = true;
    if (reduceMotion) {
      finishWorkspaceIntro();
      return;
    }
    setTextComplete(true);
    revealTimer.current = setTimeout(() => {
      revealTimer.current = null;
      finishWorkspaceIntro();
    }, MENU_REVEAL_PAUSE);
  }

  return (
    <main className="workspace-intro">
      <div className="workspace-intro-content">
        <motion.div
          className="workspace-intro-mark text-brand-mark"
          aria-hidden="true"
          animate={
            reduceMotion || !textComplete
              ? { rotate: 0 }
              : { rotate: [...BRAND_TURN_ROTATION] }
          }
          transition={
            reduceMotion || !textComplete
              ? { duration: 0 }
              : {
                  duration: BRAND_TURN_DURATION,
                  repeat: Infinity,
                  repeatDelay: 4.8,
                  times: [...BRAND_TURN_TIMES],
                  ease: EASE_OUT_QUAD,
                }
          }
        >
          <BiomorphicSymbol
            variant="soft-radial"
            className="size-full"
            renderPiece={(piece, index) => (
              <motion.g
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: -120, rotate: -8, scale: 0.84 }
                }
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.66,
                  delay: reduceMotion ? 0 : 0.22 + index * 0.1,
                  ease: EASE_OUT_QUAD,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                {piece}
              </motion.g>
            )}
          />
        </motion.div>
        <h1 className="workspace-intro-heading font-display text-primary">
          {TIMED_BEATS.map(({ phrases }, beatIndex) => (
            <span
              key={beatIndex}
              className="workspace-intro-beat"
              data-beat={beatIndex + 1}
            >
              {phrases.map(({ phrase, delay }, phraseIndex) => {
                const finalPhrase =
                  beatIndex === TIMED_BEATS.length - 1 &&
                  phraseIndex === phrases.length - 1;
                return (
                  <motion.span
                    key={phraseIndex}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: reduceMotion ? 1 : PHRASE_OPACITY }}
                    transition={{
                      duration: reduceMotion ? 0 : PHRASE_DURATION,
                      delay: reduceMotion ? 0 : delay,
                      times: PHRASE_TIMES,
                      ease: EASE_OUT_QUAD,
                    }}
                    onAnimationComplete={finalPhrase ? finishText : undefined}
                  >
                    {phrase.kind === 'plain' ? (
                      phrase.text
                    ) : (
                      <>
                        {phrase.before}
                        <span className="workspace-intro-keyword">
                          {phrase.word}
                        </span>
                        {phrase.after}
                      </>
                    )}
                  </motion.span>
                );
              })}
            </span>
          ))}
        </h1>
      </div>
    </main>
  );
}

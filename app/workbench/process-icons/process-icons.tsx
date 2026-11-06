import type { ComponentType } from 'react';
import ArrowRotateClockwise from 'blode-icons-react/icons/arrow-rotate-clockwise';
import ArrowRotateClockwiseFilled from 'blode-icons-react/icons/arrow-rotate-clockwise-filled';
import ArrowRotateSparkle from 'blode-icons-react/icons/arrow-rotate-sparkle';
import ArrowRotateSparkleFilled from 'blode-icons-react/icons/arrow-rotate-sparkle-filled';
import Book from 'blode-icons-react/icons/book';
import BookFilled from 'blode-icons-react/icons/book-filled';
import Brain from 'blode-icons-react/icons/brain';
import BrainFilled from 'blode-icons-react/icons/brain-filled';
import Calculator from 'blode-icons-react/icons/calculator';
import CalculatorFilled from 'blode-icons-react/icons/calculator-filled';
import Checklist from 'blode-icons-react/icons/checklist';
import ChecklistFilled from 'blode-icons-react/icons/checklist-filled';
import Clipboard2 from 'blode-icons-react/icons/clipboard-2';
import Clipboard2Filled from 'blode-icons-react/icons/clipboard-2-filled';
import Clipboard2Sparkle from 'blode-icons-react/icons/clipboard-2-sparkle';
import Clipboard2SparkleFilled from 'blode-icons-react/icons/clipboard-2-sparkle-filled';
import Dices from 'blode-icons-react/icons/dices';
import DicesFilled from 'blode-icons-react/icons/dices-filled';
import FileSparkle from 'blode-icons-react/icons/file-sparkle';
import FileSparkleFilled from 'blode-icons-react/icons/file-sparkle-filled';
import FileBend from 'blode-icons-react/icons/file-bend';
import FileBendFilled from 'blode-icons-react/icons/file-bend-filled';
import PageEmpty from 'blode-icons-react/icons/page-empty';
import PageEmptyFilled from 'blode-icons-react/icons/page-empty-filled';
import PageCheck from 'blode-icons-react/icons/page-check';
import PageCheckFilled from 'blode-icons-react/icons/page-check-filled';
import FileLock from 'blode-icons-react/icons/file-lock';
import FileLockFilled from 'blode-icons-react/icons/file-lock-filled';
import FileEdit from 'blode-icons-react/icons/file-edit';
import FileEditFilled from 'blode-icons-react/icons/file-edit-filled';
import FileText from 'blode-icons-react/icons/file-text';
import FileTextFilled from 'blode-icons-react/icons/file-text-filled';
import ListSparkle from 'blode-icons-react/icons/list-sparkle';
import ListSparkleFilled from 'blode-icons-react/icons/list-sparkle-filled';
import Lock from 'blode-icons-react/icons/lock';
import LockFilled from 'blode-icons-react/icons/lock-filled';
import MagicWand from 'blode-icons-react/icons/magic-wand';
import MagicWandFilled from 'blode-icons-react/icons/magic-wand-filled';
import MathEquals from 'blode-icons-react/icons/math-equals';
import MathEqualsFilled from 'blode-icons-react/icons/math-equals-filled';
import PencilSparkle from 'blode-icons-react/icons/pencil-sparkle';
import PencilSparkleFilled from 'blode-icons-react/icons/pencil-sparkle-filled';
import Random from 'blode-icons-react/icons/random';
import RandomFilled from 'blode-icons-react/icons/random-filled';
import Ruler from 'blode-icons-react/icons/ruler';
import RulerFilled from 'blode-icons-react/icons/ruler-filled';
import ShieldAi from 'blode-icons-react/icons/shield-ai';
import ShieldAiFilled from 'blode-icons-react/icons/shield-ai-filled';
import ShieldCheck from 'blode-icons-react/icons/shield-check';
import ShieldCheckFilled from 'blode-icons-react/icons/shield-check-filled';
import Sparkle3 from 'blode-icons-react/icons/sparkle-3';
import Sparkle3Filled from 'blode-icons-react/icons/sparkle-3-filled';
import SquareChecklist from 'blode-icons-react/icons/square-checklist';
import SquareChecklistFilled from 'blode-icons-react/icons/square-checklist-filled';

import {
  MENU_RAIL,
  MENU_TITLE,
} from '@/components/app-shell/sidebar/menu-parts';

type Icon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;
type Face = { name: string; outline: Icon; filled: Icon };

const PAIRS: { id: string; rules: Face; model: Face }[] = [
  {
    id: 'B4',
    rules: { name: 'file-lock', outline: FileLock, filled: FileLockFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'B5',
    rules: { name: 'file-edit', outline: FileEdit, filled: FileEditFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'B1 (shipped)',
    rules: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
    model: { name: 'file-bend', outline: FileBend, filled: FileBendFilled },
  },
  {
    id: 'A',
    rules: {
      name: 'clipboard-2',
      outline: Clipboard2,
      filled: Clipboard2Filled,
    },
    model: {
      name: 'clipboard-2-sparkle',
      outline: Clipboard2Sparkle,
      filled: Clipboard2SparkleFilled,
    },
  },
  {
    id: 'B',
    rules: { name: 'file-text', outline: FileText, filled: FileTextFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'B1',
    rules: { name: 'file-bend', outline: FileBend, filled: FileBendFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'B2',
    rules: { name: 'page-empty', outline: PageEmpty, filled: PageEmptyFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'B3',
    rules: { name: 'page-check', outline: PageCheck, filled: PageCheckFilled },
    model: {
      name: 'file-sparkle',
      outline: FileSparkle,
      filled: FileSparkleFilled,
    },
  },
  {
    id: 'C',
    rules: {
      name: 'square-checklist',
      outline: SquareChecklist,
      filled: SquareChecklistFilled,
    },
    model: {
      name: 'list-sparkle',
      outline: ListSparkle,
      filled: ListSparkleFilled,
    },
  },
  {
    id: 'D',
    rules: { name: 'checklist', outline: Checklist, filled: ChecklistFilled },
    model: { name: 'sparkle-3', outline: Sparkle3, filled: Sparkle3Filled },
  },
  {
    id: 'E',
    rules: {
      name: 'arrow-rotate-clockwise',
      outline: ArrowRotateClockwise,
      filled: ArrowRotateClockwiseFilled,
    },
    model: {
      name: 'arrow-rotate-sparkle',
      outline: ArrowRotateSparkle,
      filled: ArrowRotateSparkleFilled,
    },
  },
  {
    id: 'F',
    rules: {
      name: 'shield-check',
      outline: ShieldCheck,
      filled: ShieldCheckFilled,
    },
    model: { name: 'shield-ai', outline: ShieldAi, filled: ShieldAiFilled },
  },
  {
    id: 'G',
    rules: {
      name: 'calculator',
      outline: Calculator,
      filled: CalculatorFilled,
    },
    model: { name: 'magic-wand', outline: MagicWand, filled: MagicWandFilled },
  },
  {
    id: 'H',
    rules: {
      name: 'math-equals',
      outline: MathEquals,
      filled: MathEqualsFilled,
    },
    model: { name: 'dices', outline: Dices, filled: DicesFilled },
  },
  {
    id: 'I',
    rules: { name: 'ruler', outline: Ruler, filled: RulerFilled },
    model: {
      name: 'pencil-sparkle',
      outline: PencilSparkle,
      filled: PencilSparkleFilled,
    },
  },
  {
    id: 'J',
    rules: { name: 'book', outline: Book, filled: BookFilled },
    model: { name: 'brain', outline: Brain, filled: BrainFilled },
  },
  {
    id: 'K',
    rules: { name: 'lock', outline: Lock, filled: LockFilled },
    model: { name: 'random', outline: Random, filled: RandomFilled },
  },
  {
    id: 'L',
    rules: { name: 'checklist', outline: Checklist, filled: ChecklistFilled },
    model: { name: 'magic-wand', outline: MagicWand, filled: MagicWandFilled },
  },
];

const ROW = 'flex h-9 items-center gap-1 rounded-control pr-2.5';

function Row({ face, current }: { face: Face; current: boolean }) {
  const Glyph = current ? face.filled : face.outline;
  return (
    <div
      className={`${ROW} ${current ? 'bg-surface-selected text-primary' : 'text-menu-link'}`}
    >
      <span className={MENU_RAIL}>
        <Glyph aria-hidden size={18} strokeWidth={1.8} />
      </span>
      <span className={`${MENU_TITLE} min-w-0 flex-1 truncate`}>
        Brunch orders
      </span>
      <span className="text-muted text-micro font-mono">{face.name}</span>
    </div>
  );
}

export function ProcessIcons() {
  return (
    <ol className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-6">
      {PAIRS.map((pair) => (
        <li key={pair.id} className="grid content-start gap-2">
          <h2 className="text-meta font-semibold">Option {pair.id}</h2>
          <div className="ground-raised surface-raised rounded-section grid gap-1 p-2">
            <Row face={pair.rules} current={false} />
            <Row face={pair.model} current={false} />
            <Row face={pair.rules} current />
            <Row face={pair.model} current />
          </div>
        </li>
      ))}
    </ol>
  );
}

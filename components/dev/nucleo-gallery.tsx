// Specimens of Nucleo's six free React families. None is a system-disc
// candidate: they are illustrative sets — colour is part of the drawing for
// glass, flags, cards and brand marks — and none ships an outline/fill pair.
// They are here so the families can be judged before one is reached for.
import type { ComponentType } from 'react';
import { cx } from '@/lib/cx';
import {
  IconBook,
  IconChart,
  IconFloppyDisk,
  IconHouse,
  IconMagnifier,
  IconTag,
  IconTrophy,
  IconTruck,
} from 'nucleo-arcade';
import {
  IconAlipay,
  IconAmericanExpress,
  IconCreditCardFront,
  IconGooglePay,
  IconMastercard,
  IconPaypal,
  IconShopPay,
  IconVisa,
} from 'nucleo-credit-cards';
import {
  IconCanada,
  IconCzechia,
  IconEurope,
  IconFrance,
  IconGermany,
  IconIreland,
  IconItaly,
  IconJapan,
} from 'nucleo-flags';
import {
  IconAppStack,
  IconBell,
  IconBookOpen,
  IconChartBar,
  IconEnvelope,
  IconFolder,
  IconGear,
  IconRocket,
} from 'nucleo-glass';
import {
  IconBoxPackage,
  IconChartArea,
  IconDeliveryCar,
  IconFactory,
  IconLaptop,
  IconReceipt,
  IconShop,
  IconWalletCard,
} from 'nucleo-isometric';
import {
  IconBluesky,
  IconDiscord,
  IconGithub,
  IconLinkedin,
  IconSlack,
  IconXTwitter,
  IconYoutube,
  IconWhatsapp,
} from 'nucleo-social-media';

type Specimen = [name: string, Icon: ComponentType<{ className?: string }>];

const NUCLEO_FAMILIES: {
  pkg: string;
  label: string;
  note: string;
  specimens: Specimen[];
}[] = [
  {
    pkg: 'nucleo-glass',
    label: 'Glass',
    note: 'Translucent layered glyphs in fixed colours.',
    specimens: [
      ['app stack', IconAppStack],
      ['bell', IconBell],
      ['book open', IconBookOpen],
      ['chart bar', IconChartBar],
      ['envelope', IconEnvelope],
      ['folder', IconFolder],
      ['gear', IconGear],
      ['rocket', IconRocket],
    ],
  },
  {
    pkg: 'nucleo-arcade',
    label: 'Arcade',
    note: 'Pixel-grid glyphs in currentColor — the one free family with an interface vocabulary.',
    specimens: [
      ['floppy disk', IconFloppyDisk],
      ['house', IconHouse],
      ['magnifier', IconMagnifier],
      ['book', IconBook],
      ['chart', IconChart],
      ['tag', IconTag],
      ['truck', IconTruck],
      ['trophy', IconTrophy],
    ],
  },
  {
    pkg: 'nucleo-isometric',
    label: 'Isometric',
    note: 'Small spot illustrations on an isometric grid.',
    specimens: [
      ['laptop', IconLaptop],
      ['shop', IconShop],
      ['box package', IconBoxPackage],
      ['delivery car', IconDeliveryCar],
      ['chart area', IconChartArea],
      ['receipt', IconReceipt],
      ['factory', IconFactory],
      ['wallet card', IconWalletCard],
    ],
  },
  {
    pkg: 'nucleo-social-media',
    label: 'Social media',
    note: 'Brand marks.',
    specimens: [
      ['github', IconGithub],
      ['slack', IconSlack],
      ['linkedin', IconLinkedin],
      ['bluesky', IconBluesky],
      ['discord', IconDiscord],
      ['youtube', IconYoutube],
      ['x', IconXTwitter],
      ['whatsapp', IconWhatsapp],
    ],
  },
  {
    pkg: 'nucleo-credit-cards',
    label: 'Credit cards',
    note: 'Payment networks and wallets, drawn as cards.',
    specimens: [
      ['visa', IconVisa],
      ['mastercard', IconMastercard],
      ['amex', IconAmericanExpress],
      ['paypal', IconPaypal],
      ['google pay', IconGooglePay],
      ['shop pay', IconShopPay],
      ['alipay', IconAlipay],
      ['card front', IconCreditCardFront],
    ],
  },
  {
    pkg: 'nucleo-flags',
    label: 'Flags',
    note: 'Country and region flags.',
    specimens: [
      ['europe', IconEurope],
      ['czechia', IconCzechia],
      ['germany', IconGermany],
      ['france', IconFrance],
      ['italy', IconItaly],
      ['ireland', IconIreland],
      ['canada', IconCanada],
      ['japan', IconJapan],
    ],
  },
];

export function NucleoGallery() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {NUCLEO_FAMILIES.map((family) => (
        <div
          key={family.pkg}
          className={cx(
            'border-rule-default bg-surface-primary space-y-3 border p-4',
            family.pkg === 'nucleo-arcade' && 'nucleo-arcade',
          )}
        >
          <div className="space-y-1">
            <p className="readout text-muted">
              {family.label} · {family.pkg}
            </p>
            <p className="text-meta text-muted">{family.note}</p>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3">
            {family.specimens.map(([name, Icon]) => (
              <figure
                key={name}
                className="grid justify-items-center gap-1.5 text-center"
              >
                <Icon aria-hidden="true" className="size-8" />
                <figcaption className="text-micro text-muted">
                  {name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

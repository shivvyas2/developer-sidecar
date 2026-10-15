import { useMemo, useState } from 'react'
import { FONTS, palette, renderText, type Line, type TextModel, type Tone, type Town } from '@sidecar/ui-kit'
import { SAMPLE_SCENES } from '@sidecar/ui-kit/catalog'
import {
  callout, cardDrawer, cloud, connector, cursor, dial, gridPaper, helperHand, hand, indexCard, indicatorRow,
  instrumentModule, isoBlock, isoStack, magnifier, packageBlock, readout, sessionArc, stamp, statusStrip,
  type BlockTone,
} from '@sidecar/ui-kit/primitives'
import { Scene } from '@sidecar/ui-kit/react'
import {
  CardCatalog, Chip, FolderTabs, PulledCard, ReadoutPanel, RotarySelect, RoundButton, SpecCard, StatusStrip,
  StepCard, StepDrawer, ThemeToggle, TickRuler,
} from './ds'
import { kitScopeCss } from './kitTheme'

const TOWN: Town = { places: [], labels: {}, appFloors: 2 }
const THEMES = ['light', 'dark'] as const


/** Both halves of every section: the same content under a light and a dark wrapper. */
function Pair({ children }: { children: () => React.ReactNode }) {
  return (
    <div className="kit__pair">
      {THEMES.map((t) => (
        <div key={t} className="kit__half" data-theme={t}>
          <span className="kit__tag">{t}</span>
          {children()}
        </div>
      ))}
    </div>
  )
}

function Svg({ children, w = 220, h = 110 }: { children: string; w?: number; h?: number }) {
  return (
    <svg className="kit__svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      dangerouslySetInnerHTML={{ __html: children }} />
  )
}

function Spec({ name, children, w, h }: { name: string; children: string; w?: number; h?: number }) {
  return (
    <figure className="kit__spec">
      <Svg {...(w ? { w } : {})} {...(h ? { h } : {})}>{children}</Svg>
      <figcaption>{name}</figcaption>
    </figure>
  )
}

/**
 * A cell that fits an isoStack of `floors`: the stack reaches 40 left and 52 right of
 * its origin, 53 below it and 26 + 22 per floor above it (see primitives/stack).
 */
const stackCell = (floors: number) => {
  const top = 26 + 22 * floors + 6
  return { w: 104, h: top + 59, o: { x: 46, y: top } }
}

const BLOCKS: BlockTone[] = ['app', 'service', 'data', 'auth', 'ok', 'paper']
const CARD_STATES = ['rest', 'lifted', 'inserting', 'editing'] as const

function Primitives() {
  return (
    <div className="kit__row">
      <Spec name="gridPaper" w={160} h={90}>{gridPaper(160, 90)}</Spec>
      {BLOCKS.map((b) => (
        <Spec key={b} name={`isoBlock ${b}`} w={120} h={96}>
          {isoBlock({ x: 60, y: 40 }, { x: 0, y: 0, z: 0, w: 40, d: 40, h: 30 }, b)}
        </Spec>
      ))}
      <Spec name="isoBlock dashed" w={120} h={96}>
        {isoBlock({ x: 60, y: 40 }, { x: 0, y: 0, z: 0, w: 40, d: 40, h: 30 }, 'app', { dashed: true })}
      </Spec>
      {[1, 3, 5].map((f) => <Spec key={f} name={`isoStack ${f}`} {...stackCell(f)}>{isoStack(stackCell(f).o, f)}</Spec>)}
      <Spec name="isoStack building" {...stackCell(3)}>{isoStack(stackCell(3).o, 3, { building: true })}</Spec>
      {CARD_STATES.map((s) => (
        <Spec key={s} name={`indexCard ${s}`} w={200} h={80}>
          {indexCard({ x: 10, y: 14 }, { num: '004', title: 'Add checkout', lines: 3, state: s, progress: 0.6 })}
        </Spec>
      ))}
      <Spec name="cardDrawer" w={240} h={120}>
        {cardDrawer({ x: 10, y: 20 }, { cards: [{ num: '001', name: 'Read' }, { num: '002', name: 'Edit' }, { num: '003', name: 'Test', group: true }], lifted: '002', label: 'STEPS', width: 220 })}
      </Spec>
      <Spec name="stamp" w={160} h={60}>{stamp({ x: 20, y: 40 }, 'APPROVED')}</Spec>
      {(['run', 'ok', 'fail'] as const).map((s) => (
        <Spec key={s} name={`dial ${s}`} w={150} h={150}>
          {dial({ x: 75, y: 78 }, 52, { progress: s === 'run' ? 0.55 : 1, value: s === 'run' ? '055' : '100', title: 'TOKENS', unit: 'K', state: s })}
        </Spec>
      ))}
      <Spec name="readout" w={300} h={110}>
        {readout({ x: 10, y: 14 }, 280, [{ k: 'STEP', v: '012', big: true }, { k: 'FILES', v: '07' }, { k: 'TOKENS', v: '4.2k' }], [{ k: 'NOW', v: 'Editing auth.ts' }])}
      </Spec>
      <Spec name="indicatorRow" w={140} h={40}>{indicatorRow({ x: 20, y: 20 }, ['LT', 'P', 'TC', 'OK'], 2)}</Spec>
      <Spec name="sessionArc" w={300} h={280}>{sessionArc({ x: 150, y: 170 }, 100, 0.6)}</Spec>
      <Spec name="statusStrip live" w={320} h={34}>{statusStrip({ x: 8, y: 6 }, 304, { text: 'STEP 012 · Editing auth.ts', live: true })}</Spec>
      <Spec name="statusStrip replay" w={320} h={34}>{statusStrip({ x: 8, y: 6 }, 304, { text: 'STEP 003 · Reading app.ts', live: false })}</Spec>
      <Spec name="callout" w={220} h={70}>{callout({ x: 14, y: 40 }, { x: 70, y: 22 }, 'YOUR APP', 'ISO BLOCK')}</Spec>
      <Spec name="connector" w={220} h={100}>{connector({ x: 20, y: 80 }, { x: 200, y: 70 }, 0.7)}</Spec>
      <Spec name="cursor" w={220} h={90}>{cursor({ x: 20, y: 80 }, 'add Stripe checkout')}</Spec>
      {(['point', 'press', 'hold'] as const).map((p) => (
        <Spec key={p} name={`hand ${p}`} w={200} h={110}>{hand({ x: 60, y: 90 }, { pose: p })}</Spec>
      ))}
      {(['card', 'block', 'module'] as const).map((h) => (
        <Spec key={h} name={`hand holding ${h}`} w={200} h={110}>{hand({ x: 60, y: 90 }, { pose: 'hold', holding: h })}</Spec>
      ))}
      <Spec name="helperHand" w={200} h={110}>{helperHand({ x: 60, y: 90 }, 0.5)}</Spec>
      <Spec name="cloud" w={140} h={90}>{cloud({ x: 70, y: 50 })}</Spec>
      <Spec name="instrumentModule" w={100} h={90}>{instrumentModule({ x: 50, y: 60 })}</Spec>
      <Spec name="magnifier" w={100} h={90}>{magnifier({ x: 50, y: 60 })}</Spec>
      <Spec name="packageBlock" w={120} h={80}>{packageBlock({ x: 60, y: 36 }, 0.5)}</Spec>
    </div>
  )
}

function Tokens() {
  const keys = Object.keys(palette.light) as (keyof typeof palette.light)[]
  return (
    <Pair>
      {() => (
        <ul className="kit__swatches">
          {keys.map((k) => (
            <li key={k}>
              {k === 'onLabel'
                ? <span className="kit__chip kit__chip--text" style={{ background: 'var(--sk-label)', color: 'var(--sk-onLabel)' }}>Aa</span>
                : <span className="kit__chip" style={{ background: `var(--sk-${k})` }} />}
              <code>--sk-{k}</code>
            </li>
          ))}
        </ul>
      )}
    </Pair>
  )
}

function TypeSamples() {
  return (
    <Pair>
      {() => (
        <div className="kit__type">
          <p style={{ font: `700 12px/1.4 ${FONTS.mono}`, letterSpacing: '1.4px' }}>MONO · LABELS, TABS, CODE · STEP 012</p>
          <p style={{ font: `400 28px/1.2 ${FONTS.dot}` }}>0123456789 4.2k 00:42</p>
          <p style={{ font: `400 15px/1.5 ${FONTS.sans}` }}>Sans is for sentences: Claude is wiring up the checkout page.</p>
        </div>
      )}
    </Pair>
  )
}

function Components() {
  const [tab, setTab] = useState('one')
  const [pos, setPos] = useState(3)
  const [mode, setMode] = useState<'off' | 'quick' | 'detailed'>('quick')
  const [open, setOpen] = useState<string | null>('api')
  const [sel, setSel] = useState(2)
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto')
  return (
    <Pair>
      {() => (
        <div className="kit__comps">
          <FolderTabs tabs={[{ id: 'one', label: 'Stage' }, { id: 'two', label: 'Decisions' }, { id: 'three', label: 'Glossary' }]} active={tab} onSelect={setTab} />
          <div className="kit__inline">
            <RoundButton label="LT" active={false} onPress={() => {}} title="Idle" />
            <RoundButton label="P" active onPress={() => {}} title="Active" />
            <RoundButton label="TC" active={false} disabled onPress={() => {}} title="Disabled" />
            <Chip>Stripe</Chip>
            <ThemeToggle pref={theme} onChange={setTheme} />
          </div>
          <TickRuler value={pos} max={12} onChange={setPos} valueText={`step ${pos}`} />
          <RotarySelect label="Explanations" value={mode} onChange={setMode}
            options={[{ value: 'off', label: 'Off' }, { value: 'quick', label: 'Quick' }, { value: 'detailed', label: 'Detailed' }]} />
          <ReadoutPanel fields={[{ label: 'STEP', value: '012' }, { label: 'FILES', value: '07' }, { label: 'TOKENS', value: '4.2k' }]} note="Editing auth.ts" />
          <StepDrawer count={4}>
            {(['ok', 'ok', 'failed', 'running'] as const).map((s, i) => (
              <StepCard key={i} num={i + 1} title={['Read app.ts', 'Edit auth.ts', 'Run tests', 'Deploy'][i]!} caption="Plain-English caption" status={s} selected={sel === i + 1} onSelect={() => setSel(i + 1)} />
            ))}
          </StepDrawer>
          <PulledCard num={3} title="Run tests"><p>Claude checked that nothing broke.</p></PulledCard>
          <SpecCard num={1} title="Use Postgres" chose="Postgres" alternatives={['SQLite', 'MongoDB']} reason="Relational data and hosting support." step={4} onStep={() => {}} />
          <CardCatalog label="Glossary" open={open} onOpen={setOpen} groups={[
            { letter: 'A', terms: [{ id: 'api', term: 'API', body: 'How two programs talk.' }, { id: 'auth', term: 'Auth', body: 'Proving who you are.' }] },
            { letter: 'D', terms: [{ id: 'db', term: 'Database', body: 'Where your data lives.' }] },
          ]} />
          <StatusStrip tag="LIVE" action={{ label: 'Pause', title: 'Pause', onPress: () => {} }}>Step 012 · Editing auth.ts</StatusStrip>
        </div>
      )}
    </Pair>
  )
}

const TONE_CLASS: Record<Tone, string> = { ink: 'kit-t-ink', dim: 'kit-t-dim', accent: 'kit-t-accent', inverse: 'kit-t-inverse', bold: 'kit-t-bold' }

const TEXT_MODEL: TextModel = {
  project: 'storefront', live: true,
  readout: { step: 12, files: 7, tokens: 4200, elapsed: '03:21' },
  steps: [
    { num: 10, title: 'Read app.ts', caption: 'looking around', status: 'ok' },
    { num: 11, title: 'Run tests', caption: 'one failed', status: 'failed' },
    { num: 12, title: 'Edit auth.ts', caption: 'fixing the login check', status: 'running', plain: 'Claude is changing how login is checked so the failing test passes.', why: 'A broken login check would lock real users out.', chip: 'auth' },
  ],
}

function TextPreview() {
  const lines: Line[] = useMemo(() => renderText(TEXT_MODEL, 64, 14), [])
  return (
    <Pair>
      {() => (
        <pre className="kit__pre" aria-label="Terminal renderer preview">
          {lines.map((l, i) => (
            <div key={i}>{l.map((s, j) => <span key={j} className={s.tone ? TONE_CLASS[s.tone] : undefined}>{s.text}</span>)}{'\n'}</div>
          ))}
        </pre>
      )}
    </Pair>
  )
}

function SceneCard({ name, spec, frame }: { name: string; spec: (typeof SAMPLE_SCENES)[number]['spec']; frame: boolean }) {
  return (
    <figure className="kit__card">
      {frame
        ? <Scene spec={spec} town={TOWN} loop frame readout={{ step: 12, files: 7, tokens: 4200, now: spec.caption, elapsed: '03:21', live: true, session: 0.6, project: 'storefront' }} />
        : <Scene spec={spec} town={TOWN} loop />}
      <figcaption><strong>{name}</strong> · <code>{spec.scene}</code>{frame ? ' · framed' : ''}<br />{spec.caption}</figcaption>
    </figure>
  )
}

function Scenes() {
  return (
    <>
      <h3 className="kit__h3">Bare, looping</h3>
      <div className="kit__grid">{SAMPLE_SCENES.map((s) => <SceneCard key={s.name} name={s.name} spec={s.spec} frame={false} />)}</div>
      <h3 className="kit__h3">Framed, looping</h3>
      <div className="kit__grid kit__grid--wide">{SAMPLE_SCENES.map((s) => <SceneCard key={s.name} name={s.name} spec={s.spec} frame />)}</div>
    </>
  )
}

function SceneTheme({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  return <div className="kit__half kit__half--scenes" data-theme={theme}><span className="kit__tag">{theme}</span>{children}</div>
}

export function Kit() {
  const css = useMemo(kitScopeCss, [])
  return (
    <main className="kit">
      <style>{css}</style>
      <p><a className="kit__back" href="#/">← Back to the workstation</a></p>
      <h1 className="kit__h1">Kit · drafting instrument</h1>
      <h2>Tokens</h2><Tokens />
      <h2>Type</h2><TypeSamples />
      <h2>Primitives</h2>
      <Pair>{() => <Primitives />}</Pair>
      <h2>Components</h2><Components />
      <h2>Text renderer</h2><TextPreview />
      <h2>Scenes</h2>
      {THEMES.map((t) => <SceneTheme key={t} theme={t}><Scenes /></SceneTheme>)}
    </main>
  )
}

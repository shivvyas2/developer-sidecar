import { ActionIdSchema, ActorIdSchema, EffectIdSchema, PlaceIdSchema, type SceneSpec } from '@sidecar/shared'
import type { Town } from '@sidecar/ui-kit'
import { SAMPLE_SCENES } from '@sidecar/ui-kit/catalog'
import { Scene } from '@sidecar/ui-kit/react'

const TOWN: Town = { places: [], labels: {}, appFloors: 2 }

interface Piece { group: string; name: string; spec: SceneSpec }

const PIECES: Piece[] = [
  ...PlaceIdSchema.options.map((place): Piece => ({
    group: 'Places', name: place,
    spec: { scene: `place-${place}`, cast: [{ place, ...(place === 'service' ? { label: 'Stripe' } : {}) }], beats: [], caption: place },
  })),
  ...ActorIdSchema.options.flatMap((actor) => ActionIdSchema.options.map((action): Piece => ({
    group: `Actor: ${actor}`, name: action,
    spec: { scene: `${actor}-${action}`, cast: [actor, { place: 'app' }], beats: [{ actor, do: action, to: 'app' }], caption: `${actor} ${action}` },
  }))),
  ...EffectIdSchema.options.map((fx): Piece => ({
    group: 'Effects', name: fx,
    spec: { scene: `fx-${fx}`, cast: ['claude'], beats: [{ fx, at: 'claude' }], caption: fx },
  })),
]

function Card({ name, spec }: { name: string; spec: SceneSpec }) {
  return (
    <figure className="kit__card">
      <Scene spec={spec} town={TOWN} loop />
      <figcaption><strong>{name}</strong> · <code>{spec.scene}</code><br />{spec.caption}</figcaption>
    </figure>
  )
}

export function Kit() {
  const groups = [...new Set(PIECES.map((p) => p.group))]
  return (
    <main className="kit">
      <p><a href="#/">← Back to the workstation</a></p>
      <h2>Rule scenes</h2>
      <div className="kit__grid">{SAMPLE_SCENES.map((s) => <Card key={s.name} name={s.name} spec={s.spec} />)}</div>
      {groups.map((group) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="kit__grid">{PIECES.filter((p) => p.group === group).map((p) => <Card key={p.spec.scene} name={p.name} spec={p.spec} />)}</div>
        </section>
      ))}
    </main>
  )
}

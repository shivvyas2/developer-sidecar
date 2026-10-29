import type { SceneKind } from './scenes'
import type { Building, BuildingKind, CityTown } from './town'

/**
 * What everything in the town means, in plain words. Each concept has the town's picture of it (`city`), one
 * sentence of analogy, two or three sentences on what it really is, and related ideas. Fixed copy, no model.
 */

export const CONCEPT_IDS = [
  'reading', 'packages', 'files', 'tests', 'build', 'pages', 'styling', 'backend', 'api', 'database', 'table', 'migration',
  'cache', 'requests', 'login', 'secrets', 'services', 'jobs', 'hosting', 'repository', 'commit', 'branch', 'push', 'pull',
  'pullRequest', 'merge', 'github', 'gitignore', 'deploy', 'domain', 'devServer', 'helpers', 'permissions', 'errors',
  'commands', 'asking',
] as const
export type ConceptId = (typeof CONCEPT_IDS)[number]

export interface Concept {
  id: ConceptId
  /** What it looks like in the town. */
  city: string
  analogy: string
  real: string
  related: ConceptId[]
  /** The word to look up on the Glossary tab. */
  glossaryTerm?: string
}

type Copy = Omit<Concept, 'id'>
const COPY: Record<ConceptId, Copy> = {
  reading: {
    city: 'The foreman studying a blueprint',
    analogy: 'Before building, the foreman studies the plans of what is already there.',
    real: 'Claude reads files and searches the code to understand how your project works before it changes anything. Reading never changes your project.',
    related: ['files', 'commands'], glossaryTerm: 'codebase',
  },
  packages: {
    city: 'Crates in the supply yard',
    analogy: 'Ready-made parts bought from a supplier, so not every brick is made by hand.',
    real: 'Packages are code other people wrote and shared, like a date picker or a payments library. Installing one downloads it into your project so your code can use it.',
    related: ['files', 'services'], glossaryTerm: 'package',
  },
  files: {
    city: 'Brick walls',
    analogy: 'Every file Claude writes is another stretch of wall.',
    real: 'Your project is made of files of code. Claude creates new ones and changes existing ones; together they make up your app.',
    related: ['reading', 'tests', 'commit'], glossaryTerm: 'source file',
  },
  tests: {
    city: 'The inspector with a clipboard',
    analogy: 'An inspector checks the walls hold before anyone moves in.',
    real: 'Tests are small programs that check your code does what it should. When they pass, the work is solid; when one fails, something needs fixing before moving on.',
    related: ['build', 'errors'], glossaryTerm: 'test',
  },
  build: {
    city: 'The mixer pouring concrete',
    analogy: 'All the pieces are poured and set into one solid building.',
    real: 'A build turns your source files into the finished app a browser or phone can run. If the build fails, something in the code does not fit together yet.',
    related: ['tests', 'deploy'], glossaryTerm: 'build',
  },
  pages: {
    city: 'The shops on the main street',
    analogy: 'The shops are what visitors walk into and see.',
    real: 'Pages and screens are the parts of your app people see and use: the buttons, forms and text. This is often called the frontend.',
    related: ['styling', 'backend', 'devServer'], glossaryTerm: 'frontend',
  },
  styling: {
    city: 'Paint and awnings',
    analogy: 'Paint changes how a shop looks, not what it sells.',
    real: 'Styles set colours, fonts, spacing and layout. Changing them changes how your app looks without changing what it does.',
    related: ['pages'], glossaryTerm: 'CSS',
  },
  backend: {
    city: 'The office behind the shops',
    analogy: 'The office is where the real work happens, out of sight of visitors.',
    real: 'The backend is code that runs on a server, not in the visitor\'s browser. It handles things like saving orders, checking rules and talking to other services.',
    related: ['api', 'database', 'pages'], glossaryTerm: 'backend',
  },
  api: {
    city: 'The service window between shop and office',
    analogy: 'The shop asks the office for things through a window, always in the same agreed way.',
    real: 'An API is an agreed way for one part of software to ask another for something and get an answer back. Your pages use it to talk to your backend, and your app uses other companies\' APIs too.',
    related: ['backend', 'requests', 'services'], glossaryTerm: 'API',
  },
  database: {
    city: 'The warehouse',
    analogy: 'The warehouse keeps everything on labelled shelves so it can be found again.',
    real: 'A database stores your app\'s information, like users and orders, so it is still there tomorrow. Your code saves things into it and looks them up later.',
    related: ['table', 'migration', 'cache'], glossaryTerm: 'database',
  },
  table: {
    city: 'A section of the warehouse',
    analogy: 'Each section of the warehouse holds one kind of thing, like orders or customers.',
    real: 'A table holds one kind of record in the database, in rows and columns: one row per order, one column per detail such as price or date.',
    related: ['database', 'migration'], glossaryTerm: 'table',
  },
  migration: {
    city: 'The forklift rearranging shelves',
    analogy: 'Changing the shelves means moving what is already stored, carefully.',
    real: 'A migration changes how the database is laid out, like adding a column or a new table. It has to keep the information already stored safe while it does.',
    related: ['database', 'table'], glossaryTerm: 'migration',
  },
  cache: {
    city: 'The fridge by the shop door',
    analogy: 'Popular things are kept close so nobody walks to the warehouse every time.',
    real: 'A cache keeps a copy of information that is asked for often, so the app can answer faster. The copy can go out of date, so it is refreshed now and then.',
    related: ['database', 'backend'], glossaryTerm: 'cache',
  },
  requests: {
    city: 'Cars on the roads',
    analogy: 'Every time someone uses the app, a small trip is made along the roads and back.',
    real: 'A request is a message sent over the internet asking for something, like a page or some data. The answer comes back the same way. Slow or failed requests are a common source of problems.',
    related: ['api', 'services'], glossaryTerm: 'request',
  },
  login: {
    city: 'The guard house at the gate',
    analogy: 'The guard checks who you are before letting you in.',
    real: 'Login, or authentication, checks that people are who they say they are. A related step decides what each person is allowed to see or change.',
    related: ['secrets', 'services'], glossaryTerm: 'authentication',
  },
  secrets: {
    city: 'The locked safe',
    analogy: 'The keys to other buildings are locked in a safe, never left on the counter.',
    real: 'Secret keys, like a payments key, let your app use other services. They live in settings files such as .env that must never be shared or uploaded, because anyone with a key can use it as you.',
    related: ['gitignore', 'services'], glossaryTerm: 'environment variable',
  },
  services: {
    city: 'Other companies\' buildings across the road',
    analogy: 'Your app sends people to the bank for payments instead of handling money itself.',
    real: 'Outside services are other companies\' software your app relies on, like Stripe for payments or an email sender. Your app talks to them through their APIs, using secret keys.',
    related: ['api', 'secrets', 'requests'], glossaryTerm: 'third-party service',
  },
  jobs: {
    city: 'The post office and its vans',
    analogy: 'Letters go in the box and are delivered in order, without making you wait at the counter.',
    real: 'Background jobs are work that can happen later, like sending emails, so people are not kept waiting. They are often lined up in a queue and handled one by one.',
    related: ['backend', 'services'], glossaryTerm: 'queue',
  },
  hosting: {
    city: 'The power station and its lines',
    analogy: 'The land and electricity your shop runs on, rented from a provider.',
    real: 'Hosting is the computers on the internet that run your app for everyone, rented from a company like Vercel. Deploying puts your app there.',
    related: ['deploy', 'domain'], glossaryTerm: 'hosting',
  },
  repository: {
    city: 'The archive building',
    analogy: 'The archive keeps a photo of the town every time it changes.',
    real: 'A repository is your project plus its full history, kept by a tool called git. You can see what changed, when, and go back if something breaks.',
    related: ['commit', 'branch', 'github'], glossaryTerm: 'repository',
  },
  commit: {
    city: 'A photo pinned in the archive',
    analogy: 'A photo of the town with a note saying what changed.',
    real: 'A commit saves a snapshot of your project with a short message. Each one is a point you can go back to, so commit often with clear messages.',
    related: ['repository', 'push'], glossaryTerm: 'commit',
  },
  branch: {
    city: 'A side street with a temporary sign',
    analogy: 'Work happens on a side street so the main street stays open.',
    real: 'A branch is a separate line of changes. You try things there without touching the main version, then merge them in when they are ready.',
    related: ['merge', 'pullRequest'], glossaryTerm: 'branch',
  },
  push: {
    city: 'A truck taking a copy of the archive away',
    analogy: 'A copy of the archive goes to a safe place off the island.',
    real: 'Pushing sends your commits to an online copy of the repository, usually on GitHub. It is your backup and how others see your work.',
    related: ['github', 'pull', 'commit'], glossaryTerm: 'push',
  },
  pull: {
    city: 'A truck bringing the latest copy back',
    analogy: 'The latest archive comes back so your copy is up to date.',
    real: 'Pulling fetches changes made elsewhere, by you on another computer or by someone else, and adds them to your copy.',
    related: ['push', 'merge'], glossaryTerm: 'pull',
  },
  pullRequest: {
    city: 'A proposal on the town hall board',
    analogy: 'Changes are pinned up for review before they join the main street.',
    real: 'A pull request asks for a branch\'s changes to be checked before they are merged. It is where review, comments and automatic checks happen.',
    related: ['branch', 'merge', 'github'], glossaryTerm: 'pull request',
  },
  merge: {
    city: 'The side street joining the main street',
    analogy: 'The finished side street becomes part of the main road.',
    real: 'Merging brings a branch\'s changes into another branch, usually the main one. If the same lines changed in both, git asks which to keep.',
    related: ['branch', 'pullRequest'], glossaryTerm: 'merge',
  },
  github: {
    city: 'The archive across the water',
    analogy: 'A safe copy of your archive, kept online.',
    real: 'GitHub is a website that keeps your repository online. Keep it private unless you mean to share it, and never upload secret keys to it.',
    related: ['repository', 'push', 'gitignore'], glossaryTerm: 'GitHub',
  },
  gitignore: {
    city: 'The list of things that never go in the archive',
    analogy: 'Some things, like the safe\'s keys, must never be photographed.',
    real: 'A .gitignore file lists files git should leave out, such as secret settings, downloaded packages and build output. It keeps keys and clutter out of your history.',
    related: ['secrets', 'repository'], glossaryTerm: '.gitignore',
  },
  deploy: {
    city: 'Cutting the ribbon',
    analogy: 'The doors open and anyone with the address can come in.',
    real: 'Deploying puts the latest version of your app online for people to use. It usually runs a build first and fails if the build does.',
    related: ['hosting', 'build', 'domain'], glossaryTerm: 'deploy',
  },
  domain: {
    city: 'The street sign',
    analogy: 'The address people use to find your shop.',
    real: 'A domain name, like yourapp.com, is the address people type to reach your app. It points to wherever your app is hosted.',
    related: ['hosting', 'deploy'], glossaryTerm: 'domain name',
  },
  devServer: {
    city: 'The shop lights coming on',
    analogy: 'The shop opens for a private preview, just for you.',
    real: 'A dev server runs your app on your own computer so you can try it in your browser while it is being built. Only you can see it, and it stops when it is closed.',
    related: ['pages', 'build'], glossaryTerm: 'dev server',
  },
  helpers: {
    city: 'Extra workers in other colours',
    analogy: 'The foreman sends extra workers to do jobs at the same time.',
    real: 'Claude can start helper agents that each take on part of the work, like searching or reviewing, then report back. It gets more done at once.',
    related: ['asking'], glossaryTerm: 'subagent',
  },
  permissions: {
    city: 'The foreman waiting at the gate with a sign',
    analogy: 'Some jobs need the owner\'s OK before the work can go on.',
    real: 'Claude asks before doing things you have not allowed yet, like running some commands. It waits until you answer in Claude Code.',
    related: ['asking', 'commands'], glossaryTerm: 'permission',
  },
  errors: {
    city: 'Smoke and the repair crew',
    analogy: 'Smoke shows where something went wrong; the repair crew puts it right.',
    real: 'An error means a step did not work, like a failing test or a broken build. Claude usually reads the message, changes the code, and runs it again to check the fix.',
    related: ['tests', 'build'], glossaryTerm: 'error',
  },
  commands: {
    city: 'A worker with a toolbox',
    analogy: 'A worker uses a tool from the box for a one-off job.',
    real: 'Commands are instructions typed into the terminal, like starting the app or listing files. Claude runs them to do work that is not editing a file.',
    related: ['reading', 'permissions'], glossaryTerm: 'terminal',
  },
  asking: {
    city: 'Handing the foreman a work order',
    analogy: 'You hand the foreman a work order, and the crew starts on it.',
    real: 'Each thing you ask Claude starts a new chapter of work. The clearer the request, the closer the result is to what you want.',
    related: ['helpers', 'permissions'], glossaryTerm: 'prompt',
  },
}

export const CONCEPTS: Record<ConceptId, Concept> = Object.fromEntries(
  CONCEPT_IDS.map((id) => [id, { id, ...COPY[id] }]),
) as Record<ConceptId, Concept>

const BY_BUILDING: Record<BuildingKind, ConceptId> = {
  shop: 'pages', office: 'backend', workshop: 'files', warehouse: 'database', service: 'services', vault: 'secrets',
  inspector: 'tests', yard: 'packages', archive: 'repository', siteOffice: 'asking',
}

export function conceptOfBuilding(b: Pick<Building, 'kind' | 'vendorKind'>): ConceptId {
  if (b.kind === 'service') {
    if (b.vendorKind === 'hosting') return 'hosting'
    if (b.vendorKind === 'login') return 'login'
    if (b.vendorKind === 'database') return 'database'
    if (b.vendorKind === 'code') return 'github'
    if (b.vendorKind === 'messages') return 'jobs'
  }
  return BY_BUILDING[b.kind]
}

const BY_SCENE: Record<SceneKind, ConceptId> = {
  blueprint: 'reading', bricks: 'files', scaffold: 'files', paint: 'styling', delivery: 'packages', inspect: 'tests', pour: 'build',
  lightsOn: 'devServer', lightsOff: 'devServer', toolbox: 'commands', library: 'requests', cable: 'services', photo: 'commit',
  branch: 'branch', pushTruck: 'push', pullTruck: 'pull', proposal: 'pullRequest', merge: 'merge', forklift: 'migration',
  ribbon: 'deploy', helpers: 'helpers', workOrder: 'asking',
}

export const conceptOfScene = (k: SceneKind): ConceptId => BY_SCENE[k]

/** Concepts that live inside a building without being its main idea. */
const LIVES_IN: Partial<Record<ConceptId, BuildingKind[]>> = {
  table: ['warehouse'], migration: ['warehouse'], cache: ['warehouse'], api: ['office'], jobs: ['office'],
  commit: ['archive'], branch: ['archive'], push: ['archive'], pull: ['archive'], pullRequest: ['archive'], merge: ['archive'],
  styling: ['shop'], devServer: ['shop'], errors: ['inspector'], build: ['inspector'],
}

/** The real files and steps behind a concept in this project. */
export function inYourProject(id: ConceptId, town: CityTown): { files: string[]; stepIds: string[] } {
  const homes = LIVES_IN[id]
  const hits = town.buildings.filter((b) => (homes ? homes.includes(b.kind) : conceptOfBuilding(b) === id))
  return { files: [...new Set(hits.flatMap((b) => b.files))], stepIds: [...new Set(hits.flatMap((b) => b.stepIds))] }
}

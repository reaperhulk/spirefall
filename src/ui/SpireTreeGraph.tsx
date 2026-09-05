import { useEffect, useRef, useState } from 'react'
import {
  BRANCH_BLURBS,
  BRANCH_GATES,
  BRANCH_NAMES,
  META_BRANCHES,
  META_TREE,
  metaNode,
  metaNodeEffect,
  type MetaBranch,
  type MetaNodeDef,
  type MetaUpgradeId,
} from '../data/metaTree'
import { branchSpend, isNodeUnlocked, keystoneConflict, metaLevel, metaUpgradeCost } from '../engine/meta'
import type { MetaState } from '../engine/types'

// The Spire Tree as a graph. SVG rather than canvas on purpose: every node is
// a real focusable button, so keyboard navigation, screen readers and
// getByTestId all work exactly as they do everywhere else in the app.
//
// Coordinates are authored in the data (0-100 in both axes, `wide` and
// `compact` layouts) and never computed here — the shape is a design
// decision, reviewable in a diff.

const ROOT = { wide: { x: 53, y: 93 }, compact: { x: 50, y: 4 } }

// Node radius and the viewBox padding around the authored 0-100 space.
const R = 2.7
const PAD = 8

export type NodeState =
  | 'locked' // branch gate unpaid
  | 'affordable' // buyable right now
  | 'unaffordable' // open, but the sparks aren't there
  | 'owned' // has levels, more to buy
  | 'maxed'
  | 'keystone-out' // a rival keystone is held

export function nodeState(meta: MetaState, node: MetaNodeDef): NodeState {
  const cost = metaUpgradeCost(meta, node.id)
  if (cost === null) return 'maxed'
  if (!isNodeUnlocked(meta, node.id)) return 'locked'
  if (keystoneConflict(meta, node.id) !== null) return 'keystone-out'
  if (meta.sparks >= cost) return 'affordable'
  return metaLevel(meta, node.id) > 0 ? 'owned' : 'unaffordable'
}

function pos(node: MetaNodeDef, compact: boolean): { x: number; y: number } {
  return compact ? node.compact : node.wide
}

function rootPos(compact: boolean): { x: number; y: number } {
  return compact ? ROOT.compact : ROOT.wide
}

// Wide fans out, so straight lines read fine. Stacked (compact) they would
// be long diagonals crossing every row between parent and child, so those
// route as right-angle traces instead — circuit board, not spaghetti.
// Every node between this one and the Spire. Selecting a node lights its
// whole lineage, which is how a player learns what a node actually costs to
// reach — the tree teaches its own shape.
function lineageOf(id: MetaUpgradeId): Set<MetaUpgradeId> {
  const chain = new Set<MetaUpgradeId>()
  let cursor: MetaUpgradeId | undefined = id
  while (cursor !== undefined) {
    chain.add(cursor)
    cursor = metaNode(cursor).parent
  }
  return chain
}

// Ambient embers: fixed positions and phases, so the background has life
// without a random number anywhere near it.
const EMBERS = [
  { x: 12, y: 84, d: 11, delay: 0 },
  { x: 34, y: 92, d: 14, delay: 2.5 },
  { x: 58, y: 88, d: 12, delay: 5 },
  { x: 78, y: 94, d: 15, delay: 1.2 },
  { x: 92, y: 80, d: 13, delay: 3.8 },
  { x: 46, y: 96, d: 16, delay: 6.4 },
]

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, compact: boolean): string {
  if (!compact) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
  const midY = from.y + (to.y - from.y) * 0.55
  return `M ${from.x} ${from.y} V ${midY} H ${to.x} V ${to.y}`
}

// Narrow screens get the authored `compact` coordinates — the same graph,
// stacked instead of fanned. One component, one dataset, two shapes; the
// alternative (a separate mobile list) is two things to keep true.
function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const onChange = (e: MediaQueryListEvent): void => setCompact(e.matches)
    // No sync setState here: the state initializer already read the query,
    // and re-reading it in the effect only cascades an extra render.
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return compact
}

export function SpireTreeGraph({
  meta,
  onBuy,
  onRespec,
  compact: forceCompact,
}: {
  meta: MetaState
  onBuy: (id: MetaUpgradeId) => void
  onRespec?: ((id: MetaUpgradeId) => void) | undefined
  compact?: boolean
}) {
  const autoCompact = useCompactLayout()
  const compact = forceCompact ?? autoCompact
  const [selected, setSelected] = useState<MetaUpgradeId | null>(null)
  // Edges that are currently carrying charge outward from a purchase, and the
  // nodes that charge is about to reveal. Purely presentational.
  const [charging, setCharging] = useState<MetaUpgradeId[]>([])
  const [struck, setStruck] = useState<MetaUpgradeId | null>(null)
  // What the last purchase cost, floating off the node it bought.
  const [spent, setSpent] = useState<{ id: MetaUpgradeId; cost: number; key: number } | null>(null)
  const spendKey = useRef(0)
  const prevUnlocked = useRef<Set<MetaUpgradeId>>(new Set())
  const timers = useRef<number[]>([])

  useEffect(() => {
    return () => {
      for (const t of timers.current) window.clearTimeout(t)
    }
  }, [])

  // Whenever a purchase opens something new, run charge down the lines that
  // lead to it: the spend visibly travels outward and unveils what it bought.
  useEffect(() => {
    const open = new Set<MetaUpgradeId>()
    for (const node of META_TREE) if (isNodeUnlocked(meta, node.id)) open.add(node.id)
    const revealed = [...open].filter((id) => !prevUnlocked.current.has(id))
    prevUnlocked.current = open
    if (revealed.length > 0) {
      // Deferred rather than set synchronously in the effect: this is an
      // animation cue, not render-critical state, and a sync setState here
      // cascades a second render for every purchase.
      const start = window.setTimeout(() => setCharging(revealed), 0)
      const stop = window.setTimeout(() => setCharging([]), 900)
      timers.current.push(start, stop)
    }
  }, [meta])

  const handleBuy = (id: MetaUpgradeId): void => {
    const cost = metaUpgradeCost(meta, id) ?? 0
    onBuy(id)
    setStruck(id)
    setSpent({ id, cost, key: spendKey.current++ })
    const t = window.setTimeout(() => setStruck(null), 460)
    const t2 = window.setTimeout(() => setSpent(null), 900)
    timers.current.push(t, t2)
  }

  const root = rootPos(compact)
  const detail = selected === null ? null : metaNode(selected)
  const lineage = selected === null ? new Set<MetaUpgradeId>() : lineageOf(selected)

  return (
    <div className="tree-graph-wrap" data-testid="tree-graph">
      <svg
        className="tree-graph"
        viewBox={`${-PAD} ${-PAD} ${100 + PAD * 2} ${(compact ? 115 : 100) + PAD * 2}`}
        role="group"
        aria-label="The Spire Tree"
      >
        <defs>
          <radialGradient id="pool-iron"><stop offset="0%" className="pool-iron-a" /><stop offset="100%" className="pool-stop-b" /></radialGradient>
          <radialGradient id="pool-gold"><stop offset="0%" className="pool-gold-a" /><stop offset="100%" className="pool-stop-b" /></radialGradient>
          <radialGradient id="pool-ash"><stop offset="0%" className="pool-ash-a" /><stop offset="100%" className="pool-stop-b" /></radialGradient>
          {META_BRANCHES.map((branch) => (
            <linearGradient key={branch} id={`branch-${branch}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" className={`grad-${branch}-a`} />
              <stop offset="100%" className={`grad-${branch}-b`} />
            </linearGradient>
          ))}
        </defs>

        {/* Atmosphere, behind everything: a colour pool per branch so each
            one owns a region of the canvas, plus embers drifting up from the
            Spire's fires. Decoration only — nothing here is a state tell. */}
        {!compact &&
          (['iron', 'gold', 'ash'] as const).map((branch, i) => (
            <circle
              key={`pool-${branch}`}
              className="tree-pool"
              cx={[20, 54, 86][i]}
              cy={52}
              r={26}
              fill={`url(#pool-${branch})`}
            />
          ))}
        {EMBERS.map((e, i) => (
          <circle
            key={`ember-${i}`}
            className="tree-ember"
            cx={e.x}
            cy={e.y}
            r={0.5}
            style={{ animationDuration: `${e.d}s`, animationDelay: `${e.delay}s` }}
          />
        ))}

        {/* Edges first, so nodes sit on top of their own lines. */}
        {META_TREE.map((node) => {
          const from = node.parent === undefined ? root : pos(metaNode(node.parent), compact)
          const to = pos(node, compact)
          const open = isNodeUnlocked(meta, node.id)
          const live = metaLevel(meta, node.id) > 0
          const pulls = nodeState(meta, node) === 'affordable'
          return (
            <g key={`edge-${node.id}`}>
              <path
                className={`tree-edge${open ? ' open' : ''}${live ? ' live' : ''}${lineage.has(node.id) ? ' lineage' : ''}${pulls ? ' affordable-target' : ''} edge-${node.branch}`}
                d={edgePath(from, to, compact)}
                data-testid={`edge-${node.id}`}
              />
              {charging.includes(node.id) && (
                <path className={`tree-edge-charge edge-${node.branch}`} d={edgePath(from, to, compact)} />
              )}
            </g>
          )
        })}

        {/* The Spire itself: the root every branch hangs from. */}
        <circle className="tree-root" cx={root.x} cy={root.y} r={R * 1.25} />
        <text className="tree-root-label" x={root.x} y={root.y + R * 3} textAnchor="middle">
          THE SPIRE
        </text>

        {META_TREE.map((node) => {
          const state = nodeState(meta, node)
          const level = metaLevel(meta, node.id)
          const p = pos(node, compact)
          const revealing = charging.includes(node.id)
          return (
            <g
              key={node.id}
              className={`tree-gnode state-${state} branch-${node.branch}${node.keystone === true ? ' is-keystone' : ''}${revealing ? ' revealing' : ''}${struck === node.id ? ' struck' : ''}${lineage.has(node.id) ? ' lineage' : ''}${selected === node.id ? ' selected' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
            >
              {/* The hit target is a real button so focus and keys work. */}
              <circle className="tree-gnode-halo" r={R * 1.9} />
              {node.keystone === true ? (
                // A diamond by geometry, not by a CSS transform: the punch
                // and reveal animations both animate `transform`, and a
                // rotation there gets clobbered the moment one fires.
                <polygon
                  className="tree-gnode-face keystone-face"
                  points={`0,${-R * 1.25} ${R * 1.25},0 0,${R * 1.25} ${-R * 1.25},0`}
                />
              ) : (
                <circle className="tree-gnode-face" r={R} />
              )}
              {level > 0 && <circle className="tree-gnode-fill" r={R * 0.55} />}
              {/* Progress arc: how far into this node you are, read at a
                  glance instead of parsed from "4/8". */}
              {node.maxLevel > 1 && level > 0 && (
                <circle
                  className="tree-gnode-arc"
                  r={R * 1.35}
                  strokeDasharray={`${(level / node.maxLevel) * 2 * Math.PI * R * 1.35} 999`}
                  transform="rotate(-90)"
                />
              )}
              <circle
                className="tree-gnode-hit"
                r={R * 2.2}
                data-testid={`gnode-${node.id}`}
                tabIndex={0}
                role="button"
                aria-label={`${node.name} — ${state}`}
                onClick={() => setSelected(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(node.id)
                  }
                }}
              />
              <text className="tree-gnode-label" y={R * 2.3} textAnchor="middle">
                {node.short}
              </text>
              {spent !== null && spent.id === node.id && (
                <text key={spent.key} className="tree-gnode-spent" y={-R * 2.6} textAnchor="middle">
                  −✦{spent.cost}
                </text>
              )}
              {node.maxLevel > 1 && (
                <text className="tree-gnode-lv" y={-R * 1.6} textAnchor="middle">
                  {level}/{node.maxLevel}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="tree-branch-keys">
        {META_BRANCHES.map((branch: MetaBranch) => (
          <span key={branch} className={`tree-key branch-${branch}`} data-testid={`key-${branch}`}>
            <i />
            {BRANCH_NAMES[branch]} · {BRANCH_BLURBS[branch]} <b>✦{branchSpend(meta, branch)}</b>
            <GateMeter meta={meta} branch={branch} />
          </span>
        ))}
      </div>

      {detail !== null && (
        <div className="tree-detail" data-testid="tree-detail">
          <button className="tree-detail-close" data-testid="tree-detail-close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <strong>{detail.name}</strong>
          <span className="tree-detail-desc">{detail.description}</span>
          <DetailBody meta={meta} node={detail} onBuy={handleBuy} onRespec={onRespec} />
        </div>
      )}
    </div>
  )
}

// How close this branch is to its next gate. A bar is a goal with a shape;
// "spend ✦180 more" is arithmetic you have to do yourself.
function GateMeter({ meta, branch }: { meta: MetaState; branch: MetaBranch }) {
  const spend = branchSpend(meta, branch)
  const next = ([2, 3] as const).find((tier) => spend < BRANCH_GATES[tier])
  if (next === undefined) return <em className="tree-gate-meter done">all tiers open</em>
  const pct = Math.min(100, Math.round((spend / BRANCH_GATES[next]) * 100))
  return (
    <span className="tree-gate-meter" title={`✦${BRANCH_GATES[next] - spend} more opens tier ${next}`}>
      <span className="tree-gate-fill" style={{ width: `${pct}%` }} />
      <b>tier {next}</b>
    </span>
  )
}

function DetailBody({
  meta,
  node,
  onBuy,
  onRespec,
}: {
  meta: MetaState
  node: MetaNodeDef
  onBuy: (id: MetaUpgradeId) => void
  onRespec?: ((id: MetaUpgradeId) => void) | undefined
}) {
  const level = metaLevel(meta, node.id)
  const cost = metaUpgradeCost(meta, node.id)
  const state = nodeState(meta, node)
  const now = metaNodeEffect(node.id, level)
  const next = cost === null ? null : metaNodeEffect(node.id, level + 1)
  const rival = keystoneConflict(meta, node.id)
  return (
    <>
      {node.keystone && level > 0 && (
        <button className="ghost-btn" data-testid={`respec-${node.id}`} disabled={!onRespec} onClick={() => onRespec?.(node.id)}>
          {onRespec ? 'Respec · full Spark refund' : 'Respec between runs'}
        </button>
      )}
      {now !== null && (
        <span className="tree-detail-effect">
          Now: {now}
          {next !== null && (
            <>
              {' '}
              → <em>next: {next}</em>
            </>
          )}
        </span>
      )}
      <span className="tree-detail-level">
        Level {level}/{node.maxLevel}
      </span>
      {state === 'locked' && (
        <span className="tree-detail-gate" data-testid="detail-gate">
          Locked — spend ✦{BRANCH_GATES[node.tier] - branchSpend(meta, node.branch)} more in{' '}
          {BRANCH_NAMES[node.branch]}
        </span>
      )}
      {rival !== null && (
        <span className="tree-detail-gate">{metaNode(rival).name} is taken — respec it to switch</span>
      )}
      <button
        className="buy-btn tree-detail-buy"
        data-testid={`buy-${node.id}`}
        disabled={state !== 'affordable'}
        onClick={() => onBuy(node.id)}
      >
        {cost === null ? 'MAX' : state === 'locked' ? '🔒' : `✦ ${cost}`}
      </button>
    </>
  )
}

import { expect, it, vi } from 'vitest'
import { createMeta, createRun } from '../../engine/meta'
import type { Sfx } from '../audio'
import { Music } from '../music'

it('unmuting after ten minutes only schedules the normal future lookahead', () => {
  const sfx = { muted: true } as Sfx
  const music = new Music(sfx)
  const clock = { currentTime: 1 }
  const schedule = vi.fn()
  const probe = music as unknown as { tick: () => void; ensureGraph: () => unknown; getState: () => unknown; bus: unknown; scheduleStep: typeof schedule }
  probe.ensureGraph = () => clock
  probe.getState = () => createRun(createMeta(), 'audio-recovery')
  probe.bus = { gain: { setTargetAtTime: vi.fn() } }
  probe.scheduleStep = schedule
  probe.tick()
  clock.currentTime = 601
  sfx.muted = false
  probe.tick()
  expect(schedule.mock.calls.length).toBeGreaterThan(0)
  expect(schedule.mock.calls.length).toBeLessThanOrEqual(3)
  for (const args of schedule.mock.calls) expect(args[1]).toBeGreaterThanOrEqual(601)
  clock.currentTime = 3601
  schedule.mockClear()
  probe.tick()
  expect(schedule.mock.calls.length).toBeLessThanOrEqual(3)
  for (const args of schedule.mock.calls) expect(args[1]).toBeGreaterThanOrEqual(3601)
})

import { useEffect, type RefObject } from 'react'
import type { MetaState } from '../engine/types'
import type { GameSession } from './session'
import { persistSave, registerRecording, saveReloadPending } from './save'

// Browser lifecycle lives outside the command-driven simulation. The refs
// follow session replacement; playback never overwrites the live save.
export function useRunCheckpoint(session: RefObject<GameSession>, meta: RefObject<MetaState>): void {
  useEffect(() => registerRecording(() => session.current.replaying ? undefined : session.current.recording()), [session])
  useEffect(() => {
    const checkpoint = () => {
      const live = session.current
      if (!live.replaying && !saveReloadPending()) persistSave({version:1,meta:meta.current,run:live.terminal ? null : live.state})
    }
    const timer = window.setInterval(checkpoint,5000)
    window.addEventListener('pagehide',checkpoint)
    document.addEventListener('visibilitychange',checkpoint)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide',checkpoint)
      document.removeEventListener('visibilitychange',checkpoint)
    }
  }, [session,meta])
}

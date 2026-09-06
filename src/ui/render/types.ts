// Shared renderer types. Their own module so the passes can import them
// without reaching back into render.ts and making the graph circular.
import type { AbilityId, CellPos, TowerType } from '../../engine/types'

export interface RenderUiState {
  reviewCell?: CellPos | null
  hoverCell: CellPos | null
  selectedTowerId: number | null
  shopSelection: TowerType | null
  abilitySelection: AbilityId | null
}

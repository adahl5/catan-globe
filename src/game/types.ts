/** All shared TypeScript types for the Catan Globe game. */

export type PlayerColor = 'red' | 'blue' | 'orange' | 'white'
export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore'
export type ResourceCounts = Record<Resource, number>
export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'
export type BuildingType = 'settlement' | 'city'

/**
 * Unified face index convention:
 *   0-11  = pentagon faces (matches pentTerrain/pentPorts/pentagons array indices)
 *   12-31 = hexagon faces  (hexIdx = faceIndex - 12, matches hexTerrain/hexPorts/hexagons)
 */
export type FaceIndex = number
export type VertexIndex = number // 0-59
export type EdgeIndex = number   // 0-89
export type PlayerIndex = number // 0-3

export const RESOURCES: Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore']

export function emptyResources(): ResourceCounts {
  return { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
}

export function totalResources(r: ResourceCounts): number {
  return RESOURCES.reduce((s, k) => s + r[k], 0)
}

export interface GlobeGraph {
  /** 90 unique edges as [vertexA, vertexB] with vertexA < vertexB */
  edges: [VertexIndex, VertexIndex][]
  /** vertexToFaces[v] lists all face indices containing vertex v (exactly 3 per vertex) */
  vertexToFaces: FaceIndex[][]
  /** vertexToEdges[v] lists all edge indices incident on vertex v (exactly 3 per vertex) */
  vertexToEdges: EdgeIndex[][]
  /** vertexAdjacency[v] lists all vertices connected to v by an edge (exactly 3 per vertex) */
  vertexAdjacency: VertexIndex[][]
  /** edgeToFaces[e] lists the two face indices that share edge e */
  edgeToFaces: FaceIndex[][]
  /** faceVertices[f] lists the vertex indices around face f in order */
  faceVertices: VertexIndex[][]
  /** "minV,maxV" → EdgeIndex lookup */
  edgeIndex: Map<string, EdgeIndex>
}

export interface PlayerConfig {
  name: string
  color: PlayerColor
}

export interface PlayerState {
  name: string
  color: PlayerColor
  resources: ResourceCounts
  /** Full hand — includes unplayed victoryPoint cards */
  devCards: DevCardType[]
  /** Publicly visible played dev cards */
  playedDevCards: DevCardType[]
  knightsPlayed: number
  /** Vertex indices with this player's settlements */
  settlements: VertexIndex[]
  /** Vertex indices with this player's cities */
  cities: VertexIndex[]
  /** Edge indices with this player's roads */
  roads: EdgeIndex[]
}

export type GamePhase =
  | 'setup_place_settlement'
  | 'setup_place_road'
  | 'main_preroll'
  | 'main_robber_move'
  | 'main_steal'
  | 'main_discard'
  | 'main_road_building_1'
  | 'main_road_building_2'
  | 'main_build'
  | 'game_over'

export interface SetupState {
  /** 1 = first pass forward, 2 = second pass backward */
  round: 1 | 2
  /** Current position in the full setup order array (0 to 2n-1) */
  setupOrderIndex: number
  /** Vertex just placed in setup — determines which edges are valid for the road */
  lastSettlementVertex: VertexIndex | null
}

export interface PendingTradeOffer {
  fromPlayer: PlayerIndex
  /** What fromPlayer is giving */
  offer: Partial<ResourceCounts>
  /** What fromPlayer wants in return */
  request: Partial<ResourceCounts>
}

export interface GameState {
  phase: GamePhase
  players: PlayerState[]
  currentPlayerIndex: PlayerIndex

  /** Turn counter (increments on END_TURN) */
  turnNumber: number
  /** True once dice have been rolled this turn; reset on END_TURN */
  diceRolledThisTurn: boolean

  /** Placed buildings: vertexIndex → {type, player} */
  buildings: Record<VertexIndex, { type: BuildingType; player: PlayerIndex }>
  /** Placed roads: edgeIndex → owning player index */
  roads: Record<EdgeIndex, PlayerIndex>

  /** Current robber face index (unified convention) */
  robberFace: FaceIndex

  /** Remaining face-down dev card deck */
  devCardDeck: DevCardType[]

  /** The last dice roll this turn (kept for display after turn ends) */
  lastRoll: [number, number] | null

  /** Holder of the Longest Road special card (≥5 roads) */
  longestRoadHolder: PlayerIndex | null
  /** Holder of the Largest Army special card (≥3 knights) */
  largestArmyHolder: PlayerIndex | null

  /** Bank resource supply */
  bank: ResourceCounts

  /** Non-null during setup phase */
  setupState: SetupState | null
  /** Flat snake-order array of player indices for setup: [0,1,...,n-1,n-1,...,1,0] */
  setupOrder: PlayerIndex[]

  /**
   * During main_steal phase: list of opponent player indices adjacent to new robber position
   * (current player must steal from one of them)
   */
  pendingStealFrom: PlayerIndex[] | null

  /**
   * During main_discard phase: maps player index → number of cards they still must discard.
   * Null when no discards are needed.
   */
  pendingDiscards: Record<PlayerIndex, number> | null

  /** True once a dev card has been played this turn (prevents playing two) */
  playedDevCardThisTurn: boolean

  /** Non-null when current player has proposed a trade */
  pendingTradeOffer: PendingTradeOffer | null

  winnerIndex: PlayerIndex | null

  /** Running game log (newest entries appended) */
  log: string[]
}

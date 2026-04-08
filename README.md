# Round Catan Layout Generator

Shamefully created using AI.

A web application for generating randomized board layouts for a spherical (globe-shaped) Catan game using a truncated icosahedron geometry (soccer ball pattern). See [this Printables page](https://www.printables.com/model/1081798-settlers-of-catan-globe-edition-magnetized) for details on the globe.

![Round Catan Generator](./src/assets/hero.png)

## Features

- **3D Interactive Globe**: Visualize the board layout on a rotating 3D truncated icosahedron with 12 pentagonal and 20 hexagonal faces
- **Smart Layout Generation**: Automatically distributes terrain, ports, and number chips according to game rules
- **Customizable Number Pool**: Adjust how many of each dice value (2-12, excluding 7) to use
- **Dual Shuffle Modes**:
  - **Full Shuffle**: Randomizes terrain types, port positions, and number placement
  - **Reshuffle Numbers Only**: Keeps terrain and ports, only reassigns number chips

## Game Rules Implemented

The generator follows these rules for a round Catan globe:

- **12 Pentagons** + **20 Hexagons** = 32 total faces
- **31 Playable Faces**:
  - **24 Resource Faces**: Carry terrain (3 Desert, 5 Lumber, 5 Grain, 5 Brick, 6 Wool)
  - **7 Port-Only Faces**: 2 generic 3:1 ports and 5 specific 2:1 ports (Lumber, Brick, Grain, Wool, Ore)
- **21 Number Chips**: Placed on non-desert resource faces (never on port-only faces)
- **South Pole** is left empty (for mounting rod)
- **North Pole**: One hexagon is designated as the north pole

## Tech Stack

- **React 19** — UI framework
- **TypeScript** — Type safety
- **Three.js + React Three Fiber** — 3D globe visualization
- **Vite** — Build tool and dev server
- **Vitest** — Testing framework
- **ESLint** — Code linting

## Development

### Prerequisites

- Node.js 20+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/adahl5/catan-globe
cd round-catan-generator

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once |
| `npm run lint` | Run ESLint |
| `npm start` | Serve production build (for deployment) |

### Project Structure

```
src/
├── components/
│   ├── FaceTile.tsx           # Individual face display component
│   ├── GlobeBoard.tsx         # Globe layout display wrapper
│   ├── GlobeVisualization.tsx # 3D Three.js globe visualization
│   ├── NumberChip.tsx         # Number chip display component
│   └── NumberPoolEditor.tsx   # Number pool configuration UI
├── __tests__/
│   └── globe.test.ts          # Unit tests for layout logic
├── test/
│   └── setup.ts               # Test environment setup
├── globe.ts                   # Core game logic (layout generation)
├── truncatedIcosahedron.ts    # 3D geometry calculations
├── App.tsx                    # Main application component
├── App.css                    # Component styles
├── index.css                  # Global styles
└── main.tsx                   # Application entry point
```

## How It Works

### Layout Generation Algorithm

1. **Port Assignment**: 7 ports (2 generic 3:1, 5 specific 2:1) are randomly assigned to playable faces (excluding south pole)
2. **Terrain Assignment**: 24 terrain tiles are randomly placed on non-port, non-south-pole faces
3. **Number Assignment**: Number chips are randomly placed on non-desert resource faces

The algorithm ensures no conflicts (ports and terrain never overlap, south pole remains empty).

### 3D Visualization

The globe is rendered using Three.js with:
- Procedurally generated truncated icosahedron geometry
- Face-based coloring based on terrain type
- Interactive orbit controls (drag to rotate, scroll to zoom)
- Dynamic labels that only show when faces are facing the camera
- Proper lighting with ambient and directional lights

## Deployment

### Docker

A `Dockerfile` is included for containerized deployment:

```bash
# Build image
docker build -t round-catan-generator .

# Run container
docker run -p 3000:3000 round-catan-generator
```

### Static Hosting

The `dist/` folder contains static files ready for deployment to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

```bash
npm run build
# Deploy dist/ folder to your hosting provider
```

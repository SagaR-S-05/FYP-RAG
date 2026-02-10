# Manim RAG Frontend

A minimal Vite + React frontend for the Manim RAG system that provides a chat interface to generate and display Manim videos.

## Installation

Install dependencies:

```bash
npm install
```

## Running the Frontend

Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173` (or the port Vite assigns).

To build for production:

```bash
npm run build
```

## Chat Flow

1. **User Input**: Enter a text prompt in the chat input area at the bottom of the Chat page
2. **Submit**: Click the "Submit" button to send the prompt to the backend
3. **Backend Processing**: The frontend sends a POST request to `/api/generate` with the text prompt
4. **Video Display**: Once the backend responds with a video URL, the video is displayed inline in the chat interface
5. **Error Handling**: If the request fails, an error message is displayed

## API Integration

### Request Format

**Endpoint**: `POST /api/generate`

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "text": "string"
}
```

### Response Format

**Success Response** (200 OK):
```json
{
  "video_url": "https://example.com/generated-video.mp4"
}
```

**Error Response** (4xx/5xx):
```json
{
  "detail": "Error message"
}
```

The frontend expects the response to contain a `video_url` field. If the response is successful, the video is rendered using an HTML5 `<video>` element with controls and autoplay enabled.

## Theming and Dark Mode

The frontend uses a token-based color system with CSS variables. All colors are defined in `src/index.css` using semantic tokens:

- `--background`: Main background color
- `--foreground`: Main text color
- `--primary`: Primary action color
- `--secondary`: Secondary elements
- `--muted`: Muted text and backgrounds
- `--accent`: Accent colors
- `--destructive`: Error/destructive actions
- `--border`: Border colors
- `--input`: Input field borders
- `--ring`: Focus ring color

### Dark Mode

Dark mode is toggled via a button in the header. When enabled, the `.dark` class is added to the document root, which switches all color tokens to their dark mode variants. All components automatically adapt to the current theme using CSS variables.

No hardcoded colors are used anywhere in the codebase—all styling references the CSS token variables.

## Project Structure

```
frontend-1/
├── src/
│   ├── pages/
│   │   ├── Chat.jsx      # Main chat interface
│   │   └── About.jsx     # About page with structure only
│   ├── App.jsx           # Main app component with routing
│   ├── main.jsx          # Entry point
│   └── index.css         # Global styles with token system
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Technologies

- **Vite**: Build tool and dev server
- **React**: UI library (functional components + hooks only)
- **Fetch API**: HTTP client (no axios)
- **Hash-based routing**: Simple client-side routing
- **CSS Variables**: Token-based theming system

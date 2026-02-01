# Manim Video Generator

A ChatGPT-style interface for video generation with folder-based organization. This application allows users to input prompts, receive generated videos, and organize them in customizable folders.

## Features

- 💬 **Chat Interface**: Interactive chat-style interface for video generation
- 📁 **Folder Organization**: Organize videos with custom folders
- 🔄 **FIFO Recents Folder**: Automatically manages recent videos (max 10)
- 🎨 **Sage Garden Theme**: Beautiful botanical-inspired color palette
- 👤 **Profile Management**: Customize your user profile
- ℹ️ **About Page**: Detailed documentation about the Interactive Manim Video Generator

## Project Structure

```
project/
├── public/
│   └── vite.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── AboutPage.jsx
│   │   ├── ChatInterface.jsx
│   │   ├── ProfilePage.jsx
│   │   └── VideoGallery.jsx
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js
```

## Getting Started

### Prerequisites

- Node.js (version 18 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Clone or download this repository to your local machine

2. Navigate to the project directory:
   ```bash
   cd project
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

Start the development server:
```bash
npm run dev
```

The application will open at `http://localhost:5173` (or another port if 5173 is busy).

### Building for Production

To create a production build:
```bash
npm run build
```

The built files will be in the `dist` directory.

To preview the production build:
```bash
npm run preview
```

## Usage

### Chat Interface
- Click "New Chat" to start a conversation
- Enter a prompt describing the video you want to generate
- The system will generate a video based on your prompt
- View all your chat history in the sidebar

### Video Gallery
- Access all generated videos organized by folders
- **Recents Folder**: Automatically stores your 10 most recent videos (FIFO)
- **Custom Folders**: Create folders to organize your videos (max 5 videos per folder)
- Move videos between folders using the folder icon
- Download videos or delete them as needed

### Profile
- Update your name and email
- View account statistics

### About
- Learn about the Interactive Manim Video Generator
- Understand how natural-language prompts are converted to Manim animations
- Read FAQs and usage guidelines

## Technologies Used

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS v4** - Utility-first CSS framework
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **LocalStorage** - Data persistence

## Color Palette

The application uses a Sage Garden color palette:
- Primary: `#546F54` (Soft sage green)
- Secondary: `#AABCA3` (Light sage)
- Background: `#FAF8F4` (Warm off-white)
- Accents: `#C7D6C1` (Muted mint)
- Destructive: `#C67A5A` (Terracotta)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Browser Support

Modern browsers that support ES6+ features:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

This project is open source and available under the MIT License.

## Contributing

Contributions, issues, and feature requests are welcome!

## Notes

- Video generation uses mock data. In a production environment, replace the `generateMockVideo` function with actual API calls to a video generation service.
- All data is stored locally in the browser's localStorage. Clear your browser data to reset the application.

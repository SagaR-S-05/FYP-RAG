# Quick Start Guide

Get up and running in 3 simple steps!

## Prerequisites
- Node.js 18+ installed ([Download here](https://nodejs.org/))

## Installation & Running

```bash
# 1. Navigate to project directory
cd path/to/project

# 2. Install dependencies (first time only)
npm install

# 3. Start the development server
npm run dev
```

Then open **http://localhost:5173** in your browser!

## That's it! 🎉

The application will start with:
- ✅ Chat interface for video generation
- ✅ Video gallery with folder organization
- ✅ Profile management
- ✅ Complete Manim documentation

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Check code quality |

## Folder Structure

```
src/
├── components/       # All React components
│   ├── AboutPage.jsx
│   ├── ChatInterface.jsx
│   ├── ProfilePage.jsx
│   └── VideoGallery.jsx
├── App.jsx          # Main application
├── main.jsx         # Entry point
└── index.css        # Global styles
```

## Features

### 💬 Chat Interface
Create conversations and generate videos from prompts

### 📁 Video Gallery
- **Recents**: Auto-managed FIFO folder (max 10 videos)
- **Custom Folders**: Create your own (max 5 videos each)
- Move, delete, and download videos

### 👤 Profile
Manage your account settings

### ℹ️ About
Learn about the Interactive Manim Video Generator

## Data Storage
All data is stored in browser localStorage:
- Clear browser data to reset the app
- No backend required for demo

## Need More Help?
- See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed instructions
- See [README.md](./README.md) for complete documentation

---

**Enjoy building!** 🚀

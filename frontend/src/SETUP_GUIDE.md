# Setup Guide - Manim Video Generator

This guide will help you set up and run the project on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18.0.0 or higher)
  - Download from: https://nodejs.org/
  - Check your version: `node --version`
  
- **npm** (usually comes with Node.js)
  - Check your version: `npm --version`

## Step-by-Step Installation

### 1. Download/Clone the Project

If you received this as a zip file:
```bash
# Extract the zip file to a directory of your choice
# Navigate to the extracted directory
cd path/to/manim-video-generator
```

If you're cloning from a repository:
```bash
git clone <repository-url>
cd manim-video-generator
```

### 2. Install Dependencies

Open your terminal in the project directory and run:

```bash
npm install
```

This will install all required dependencies listed in `package.json`. This may take a few minutes.

**Note:** If you encounter any errors during installation:
- Make sure you're using Node.js version 18 or higher
- Try deleting `node_modules` folder and `package-lock.json` file, then run `npm install` again
- On Windows, you may need to run your terminal as Administrator

### 3. Start the Development Server

Once installation is complete, start the development server:

```bash
npm run dev
```

You should see output similar to:
```
VITE v6.0.6  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
➜  press h + enter to show help
```

### 4. Open in Browser

Open your web browser and navigate to:
```
http://localhost:5173
```

The application should now be running!

## Available Scripts

In the project directory, you can run:

### `npm run dev`
Starts the development server with hot-reload enabled. Any changes you make to the code will automatically refresh the browser.

### `npm run build`
Builds the app for production to the `dist` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

### `npm run preview`
Locally preview the production build. Run `npm run build` first.

### `npm run lint`
Runs ESLint to check for code quality issues.

## Project Structure

```
project/
├── public/                 # Static assets
│   └── vite.svg           # Vite logo
├── src/
│   ├── assets/            # Images, fonts, etc.
│   ├── components/        # React components
│   │   ├── AboutPage.jsx
│   │   ├── ChatInterface.jsx
│   │   ├── ProfilePage.jsx
│   │   ├── VideoGallery.jsx
│   │   └── lib/
│   │       └── utils.js   # Utility functions
│   ├── App.css           # App-specific styles
│   ├── App.jsx           # Main App component
│   ├── index.css         # Global styles (includes Tailwind)
│   └── main.jsx          # Entry point
├── .gitignore            # Git ignore rules
├── eslint.config.js      # ESLint configuration
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
├── README.md             # Project documentation
├── SETUP_GUIDE.md        # This file
└── vite.config.js        # Vite configuration
```

## Troubleshooting

### Port 5173 is already in use
If port 5173 is already taken, Vite will automatically try the next available port. Check the terminal output for the actual port number.

Alternatively, you can specify a different port:
```bash
npm run dev -- --port 3000
```

### Changes not reflecting in browser
1. Make sure the dev server is running
2. Try hard-refreshing the browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Check the browser console for errors

### Module not found errors
1. Delete `node_modules` folder
2. Delete `package-lock.json`
3. Run `npm install` again

### ESLint errors
If you see linting errors:
```bash
npm run lint
```
Most issues can be auto-fixed with proper IDE extensions (ESLint for VS Code, etc.)

## Development Tips

### Using VS Code
Recommended extensions:
- ESLint
- Tailwind CSS IntelliSense
- ES7+ React/Redux/React-Native snippets

### Browser DevTools
- React DevTools extension is highly recommended
- Use the Console tab to debug issues
- Network tab can help debug API calls (when implemented)

### Hot Module Replacement (HMR)
Vite's HMR is very fast. When you save a file, changes appear almost instantly without full page reload.

## Data Storage

This application uses browser localStorage to save:
- Chat conversations
- Generated videos metadata
- Folder organization
- User profile information

**To clear all data:**
1. Open browser DevTools (F12)
2. Go to Application/Storage tab
3. Click "Clear site data" or manually delete localStorage items

## Building for Production

When you're ready to deploy:

```bash
# Build the project
npm run build

# The output will be in the 'dist' folder
# You can test the production build with:
npm run preview
```

The `dist` folder can be deployed to any static hosting service:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront
- And many others

## Next Steps

After setting up:

1. **Explore the Chat Interface** - Create a new chat and try generating a video
2. **Check the Videos Page** - See all your generated videos organized in folders
3. **Customize Your Profile** - Update your name and email
4. **Read the About Page** - Learn about the Manim Video Generator

## Need Help?

- Check the main [README.md](./README.md) for feature documentation
- Review the code comments in source files
- Check browser console for error messages
- Ensure all prerequisites are met

## Production Deployment Notes

When deploying to production, remember to:

1. Set up environment variables if needed
2. Configure proper routing (use hash routing or configure server redirects)
3. Set up HTTPS
4. Consider implementing a real backend for video generation
5. Add analytics if desired
6. Set up error tracking (Sentry, etc.)

---

**Happy Coding!** 🚀

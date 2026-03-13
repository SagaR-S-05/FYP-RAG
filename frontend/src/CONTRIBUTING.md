# Contributing Guide

Welcome! This guide will help you understand how to modify and enhance the Manim Video Generator project.

## Getting Started

1. **Set up the development environment**
   ```bash
   npm install
   npm run dev
   ```

2. **Understand the project structure** (see [FILE_MANIFEST.md](./FILE_MANIFEST.md))

3. **Read the codebase** - Start with `App.jsx` and branch out

## Development Workflow

### 1. Create a New Feature

```bash
# 1. Create a feature branch (if using Git)
git checkout -b feature/your-feature-name

# 2. Make your changes

# 3. Test locally
npm run dev

# 4. Check for linting errors
npm run lint

# 5. Build to ensure no build errors
npm run build
```

### 2. Code Style

This project follows these conventions:

#### File Naming
- Components: `PascalCase.jsx` (e.g., `ChatInterface.jsx`)
- Utilities: `camelCase.js` (e.g., `utils.js`)
- Styles: `kebab-case.css` or `camelCase.css`

#### Code Conventions
```javascript
// ✅ Good
export function MyComponent({ prop1, prop2 }) {
  const [state, setState] = useState(initialValue);
  
  const handleClick = () => {
    // Handle click
  };

  return (
    <div className="flex gap-4">
      {/* Component content */}
    </div>
  );
}

// ❌ Avoid
function mycomponent(props) {
  // Use destructuring
  const value = props.prop1;
  // Use meaningful names
  const x = true;
}
```

#### Styling
- Use Tailwind utility classes
- Keep className strings readable
- Extract repeated patterns into reusable classes

```javascript
// ✅ Good
<button className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90">
  Click Me
</button>

// ✅ Also Good (for complex/repeated styles)
const buttonClasses = "inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90";
<button className={buttonClasses}>Click Me</button>
```

### 3. Adding a New Component

**Example: Adding a SettingsPage**

1. Create the component file:
```javascript
// src/components/SettingsPage.jsx
export function SettingsPage() {
  return (
    <div className="flex-1 flex flex-col bg-[#FAF8F4]">
      <div className="border-b border-[#D5CBBE] bg-white p-6">
        <h1 className="text-3xl text-[#2F342E]">Settings</h1>
      </div>
      {/* Settings content */}
    </div>
  );
}
```

2. Import in `App.jsx`:
```javascript
import { SettingsPage } from './components/SettingsPage';
```

3. Add to navigation:
```javascript
// Update state type
const [currentPage, setCurrentPage] = useState('chat'); // Add 'settings'

// Add navigation button
<button
  onClick={() => setCurrentPage('settings')}
  className={/* ... */}
>
  <Settings className="w-6 h-6" />
</button>

// Add to render logic
{currentPage === 'settings' && <SettingsPage />}
```

### 4. Modifying Existing Components

#### Before Modifying:
- Understand the component's purpose
- Check what props it receives
- Look at its state management
- Understand parent-child relationships

#### Best Practices:
```javascript
// ✅ Good: Clear, maintainable
const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!inputValue.trim()) return;
  
  setIsLoading(true);
  
  try {
    await processSubmit();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setIsLoading(false);
  }
};

// ❌ Avoid: Hard to read and debug
const handleSubmit = async (e) => {
  e.preventDefault();
  !inputValue.trim() ? null : (setIsLoading(true), await processSubmit().catch(e=>console.error(e)), setIsLoading(false));
};
```

### 5. State Management

Current approach uses React useState + localStorage:

```javascript
// Reading from localStorage
const [data, setData] = useState(() => {
  const saved = localStorage.getItem('key');
  return saved ? JSON.parse(saved) : defaultValue;
});

// Writing to localStorage
const saveData = (newData) => {
  setData(newData);
  localStorage.setItem('key', JSON.stringify(newData));
};
```

**If you want to add Redux/Context:**

1. Install dependencies:
```bash
npm install @reduxjs/toolkit react-redux
# or
npm install react-context
```

2. Create store/context
3. Wrap App in Provider
4. Update components to use store/context

### 6. Adding New Dependencies

```bash
# Install a package
npm install package-name

# Install dev dependency
npm install --save-dev package-name

# Remove a package
npm uninstall package-name
```

**Before adding a dependency, ask:**
- Is it necessary?
- What's the bundle size impact?
- Is it actively maintained?
- Are there lighter alternatives?

### 7. Styling Modifications

#### Changing Colors

Edit CSS variables in `src/index.css`:

```css
:root {
  --primary: #546F54;    /* Change this */
  --secondary: #AABCA3;  /* And this */
  /* ... */
}
```

#### Adding Custom Styles

For global styles, add to `src/index.css`:
```css
@layer components {
  .my-custom-class {
    @apply flex items-center gap-2;
  }
}
```

For component-specific styles:
```javascript
<div className="flex items-center gap-2 custom-hover">
  {/* content */}
</div>
```

### 8. Adding API Integration

**Example: Real video generation API**

1. Create API client:
```javascript
// src/lib/api.js
export async function generateVideo(prompt) {
  const response = await fetch('https://api.example.com/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_API_KEY}`
    },
    body: JSON.stringify({ prompt })
  });
  
  if (!response.ok) {
    throw new Error('Failed to generate video');
  }
  
  return response.json();
}
```

2. Use in component:
```javascript
import { generateVideo } from '../lib/api';

const handleSubmit = async (e) => {
  e.preventDefault();
  
  try {
    const { videoUrl } = await generateVideo(inputValue);
    // Handle response
  } catch (error) {
    // Handle error
  }
};
```

3. Add environment variables:
```env
# .env
VITE_API_KEY=your_api_key_here
VITE_API_URL=https://api.example.com
```

### 9. Testing Your Changes

#### Manual Testing Checklist:
- ✅ Feature works as expected
- ✅ No console errors
- ✅ Responsive on mobile
- ✅ Works in Chrome, Firefox, Safari
- ✅ localStorage persists correctly
- ✅ No broken navigation
- ✅ All buttons clickable
- ✅ Forms validate properly

#### Build Test:
```bash
npm run build
npm run preview
# Test in browser at http://localhost:4173
```

### 10. Common Tasks

#### Add a new icon:
```javascript
import { IconName } from 'lucide-react';

<IconName className="w-4 h-4" />
```

#### Add a modal/dialog:
```javascript
const [isOpen, setIsOpen] = useState(false);

return (
  <>
    <button onClick={() => setIsOpen(true)}>Open</button>
    
    {isOpen && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg">
          {/* Modal content */}
          <button onClick={() => setIsOpen(false)}>Close</button>
        </div>
      </div>
    )}
  </>
);
```

#### Add form validation:
```javascript
const [errors, setErrors] = useState({});

const validate = () => {
  const newErrors = {};
  
  if (!name.trim()) {
    newErrors.name = 'Name is required';
  }
  
  if (!email.includes('@')) {
    newErrors.email = 'Invalid email';
  }
  
  return newErrors;
};

const handleSubmit = (e) => {
  e.preventDefault();
  
  const validationErrors = validate();
  
  if (Object.keys(validationErrors).length > 0) {
    setErrors(validationErrors);
    return;
  }
  
  // Submit form
};
```

## Performance Best Practices

### 1. Avoid Unnecessary Re-renders

```javascript
// ✅ Memoize callbacks
const handleClick = useCallback(() => {
  // Handler logic
}, [dependency]);

// ✅ Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return calculateExpensiveValue(data);
}, [data]);
```

### 2. Lazy Load Heavy Components

```javascript
import { lazy, Suspense } from 'react';

const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </Suspense>
  );
}
```

### 3. Optimize Images

```javascript
// Use appropriate sizes
<img 
  src="image.jpg" 
  alt="Description"
  loading="lazy"  // Lazy load images
  width="400"     // Set dimensions
  height="300"
/>
```

## Debugging Tips

### 1. Use React DevTools
- Install React DevTools browser extension
- Inspect component state and props
- Profile component renders

### 2. Console Logging
```javascript
console.log('State:', state);
console.table(arrayData);
console.error('Error:', error);
console.warn('Warning:', warning);
```

### 3. Network Tab
- Check API calls in browser DevTools
- Verify request/response data
- Check for failed requests

### 4. Vite Dev Server Errors
- Check terminal for compilation errors
- Look for syntax errors
- Verify import paths

## Git Workflow (If Using Git)

```bash
# Create feature branch
git checkout -b feature/feature-name

# Make changes and commit
git add .
git commit -m "Add: feature description"

# Push to remote
git push origin feature/feature-name

# Create pull request on GitHub/GitLab
```

### Commit Message Convention:
```
Add: New feature
Fix: Bug fix
Update: Modify existing feature
Remove: Delete code/feature
Refactor: Code restructure
Style: Formatting, no code change
Docs: Documentation only
```

## Getting Help

### Resources:
- **React Docs:** https://react.dev
- **Vite Docs:** https://vitejs.dev
- **Tailwind CSS:** https://tailwindcss.com
- **Lucide Icons:** https://lucide.dev
- **Radix UI:** https://www.radix-ui.com

### Within This Project:
- Check [README.md](./README.md) for overview
- See [FILE_MANIFEST.md](./FILE_MANIFEST.md) for file structure
- Read [SETUP_GUIDE.md](./SETUP_GUIDE.md) for setup help

## Questions?

- Check existing code for patterns
- Look at similar components for reference
- Search online for React + Vite + Tailwind solutions
- Don't hesitate to experiment!

---

**Happy Contributing!** 🎉

Remember: There's no such thing as a stupid question. Take your time, test thoroughly, and don't be afraid to break things in development!

# Deployment Guide

Guide for deploying your Manim Video Generator to various hosting platforms.

## Pre-Deployment Checklist

Before deploying, ensure:

- ✅ All features work locally (`npm run dev`)
- ✅ Production build succeeds (`npm run build`)
- ✅ Preview build works (`npm run preview`)
- ✅ No console errors in browser
- ✅ All links and navigation work
- ✅ Images and assets load correctly

## Build for Production

```bash
# Create optimized production build
npm run build
```

This creates a `dist/` folder with:
- Minified JavaScript
- Optimized CSS
- Compressed assets
- Ready-to-deploy files

## Deployment Options

### 1. Vercel (Recommended)

**Why Vercel:**
- Free tier available
- Automatic deployments from Git
- Built-in CDN
- Zero configuration for Vite projects

**Steps:**

1. Push your code to GitHub/GitLab/Bitbucket

2. Go to [vercel.com](https://vercel.com) and sign up

3. Click "New Project"

4. Import your Git repository

5. Vercel auto-detects Vite settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

6. Click "Deploy"

**Using Vercel CLI:**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

### 2. Netlify

**Why Netlify:**
- Free tier with generous limits
- Continuous deployment
- Form handling and serverless functions
- Easy domain management

**Steps:**

1. Push code to Git repository

2. Go to [netlify.com](https://netlify.com) and sign up

3. Click "Add new site" → "Import an existing project"

4. Connect to your Git provider

5. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`

6. Click "Deploy site"

**Using Netlify CLI:**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy

# Deploy to production
netlify deploy --prod
```

**Netlify Drop:**
- Go to [app.netlify.com/drop](https://app.netlify.com/drop)
- Drag and drop your `dist` folder
- Instant deployment!

### 3. GitHub Pages

**Why GitHub Pages:**
- Free hosting for public repos
- Easy integration with GitHub
- Good for open-source projects

**Steps:**

1. Install gh-pages package:
```bash
npm install --save-dev gh-pages
```

2. Update `package.json`:
```json
{
  "homepage": "https://<username>.github.io/<repo-name>",
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```

3. Update `vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react()],
  base: '/<repo-name>/',
})
```

4. Deploy:
```bash
npm run deploy
```

5. Enable GitHub Pages in repository settings:
   - Settings → Pages → Source: `gh-pages` branch

### 4. AWS S3 + CloudFront

**Why AWS:**
- Highly scalable
- Full control
- Professional production setup
- Custom domain with SSL

**Steps:**

1. Build the project:
```bash
npm run build
```

2. Create S3 bucket:
   - Go to AWS S3 Console
   - Create bucket (unique name)
   - Enable static website hosting
   - Set index document: `index.html`
   - Set error document: `index.html`

3. Upload files:
   - Upload contents of `dist/` folder
   - Set permissions to public read

4. Create CloudFront distribution:
   - Origin: Your S3 bucket
   - Default root object: `index.html`
   - Custom error pages: 404 → /index.html

5. Update DNS to point to CloudFront URL

### 5. Firebase Hosting

**Why Firebase:**
- Free tier available
- Fast CDN
- SSL certificates included
- Easy CLI deployment

**Steps:**

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase:
```bash
firebase init hosting
```

Configure:
- Public directory: `dist`
- Single-page app: Yes
- Automatic builds: No

4. Build and deploy:
```bash
npm run build
firebase deploy
```

### 6. Render

**Why Render:**
- Free static site hosting
- Automatic deployments from Git
- Custom domains
- SSL included

**Steps:**

1. Push code to GitHub

2. Go to [render.com](https://render.com) and sign up

3. Click "New" → "Static Site"

4. Connect repository

5. Configure:
   - Build command: `npm run build`
   - Publish directory: `dist`

6. Click "Create Static Site"

## SPA Routing Configuration

Since this is a Single Page Application, you may need to configure redirects:

### Vercel (`vercel.json`)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

### Netlify (`public/_redirects`)
```
/* /index.html 200
```

### Nginx
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Environment Variables

If you add environment variables later:

### Vite Environment Variables
Create `.env` file:
```env
VITE_API_URL=https://api.example.com
VITE_API_KEY=your_api_key_here
```

Access in code:
```javascript
const apiUrl = import.meta.env.VITE_API_URL;
```

**Important:** 
- Prefix with `VITE_`
- Never commit `.env` to Git
- Add `.env` to `.gitignore`

## Custom Domain Setup

### General Steps:
1. Purchase domain (Namecheap, GoDaddy, etc.)
2. Get hosting platform's DNS records
3. Update domain DNS settings
4. Wait for DNS propagation (up to 48 hours)
5. Enable SSL certificate

### Platform-Specific:
- **Vercel:** Domains tab → Add domain → Follow instructions
- **Netlify:** Domain settings → Add custom domain
- **GitHub Pages:** Settings → Pages → Custom domain

## Performance Optimization

### Already Included:
- ✅ Code splitting (Vite default)
- ✅ Minification
- ✅ Tree shaking
- ✅ Asset optimization

### Additional Optimizations:

1. **Enable Compression:**
Most platforms enable gzip/brotli automatically

2. **Image Optimization:**
```bash
npm install -D vite-plugin-image-optimizer
```

3. **Lazy Loading:**
```javascript
const VideoGallery = lazy(() => import('./components/VideoGallery'));
```

4. **Bundle Analysis:**
```bash
npm run build -- --mode analyze
```

## Monitoring & Analytics

### Add Google Analytics:

1. Get tracking ID from Google Analytics

2. Add to `index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_TRACKING_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_TRACKING_ID');
</script>
```

### Error Tracking (Sentry):

```bash
npm install @sentry/react
```

Configure in `main.jsx`:
```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
});
```

## Security Considerations

### Content Security Policy
Add to `index.html`:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
```

### HTTPS
All major platforms provide free SSL certificates

### Environment Variables
Never expose sensitive keys in frontend code

## Continuous Deployment

### GitHub Actions Example
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      # Add deployment step here
```

## Testing Production Build Locally

Before deploying:

```bash
# Build
npm run build

# Preview (test production build locally)
npm run preview

# Or use serve
npx serve dist
```

## Rollback Strategy

### Vercel/Netlify:
- Go to Deployments
- Select previous successful deployment
- Click "Publish"

### Git-based:
```bash
git revert HEAD
git push
```

## Common Deployment Issues

### Issue: Blank page after deployment
**Solution:** Check console for errors, verify base path in `vite.config.js`

### Issue: 404 on refresh
**Solution:** Configure SPA redirects (see SPA Routing section)

### Issue: Assets not loading
**Solution:** Check base URL, ensure assets are in `public/` folder

### Issue: Large bundle size
**Solution:** Analyze bundle, implement code splitting, lazy loading

## Post-Deployment Checklist

After deployment:

- ✅ Visit deployed URL
- ✅ Test all features
- ✅ Check on mobile devices
- ✅ Test in different browsers
- ✅ Verify all links work
- ✅ Check console for errors
- ✅ Test localStorage functionality
- ✅ Verify video playback works

## Update Process

To update deployed site:

1. Make changes locally
2. Test with `npm run dev`
3. Build with `npm run build`
4. Test with `npm run preview`
5. Commit and push (auto-deploys with CI/CD)
   
   OR
   
   Manual deploy with platform CLI

## Cost Estimates

### Free Tier Limits:
- **Vercel:** 100GB bandwidth/month
- **Netlify:** 100GB bandwidth/month, 300 build minutes
- **GitHub Pages:** 100GB bandwidth/month, 1GB storage
- **Firebase:** 10GB storage, 360MB/day bandwidth
- **Render:** 100GB bandwidth/month (free static sites)

For most personal/demo projects, free tiers are sufficient!

---

**Choose a platform and deploy!** 🚀

Need help? Check platform-specific documentation or reach out to their support.
